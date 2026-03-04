const BLOCKSTREAM_MAINNET = "https://blockstream.info/api";
const BLOCKSTREAM_TESTNET = "https://blockstream.info/testnet/api";

function getApi(address) {
  return address.startsWith("tb1") || address.startsWith("2") || address.startsWith("m") || address.startsWith("n")
    ? BLOCKSTREAM_TESTNET : BLOCKSTREAM_MAINNET;
}

export async function analyzeBtcAddress(address) {
  const API = getApi(address);

  const infoRes = await fetch(`${API}/address/${address}`);
  if (!infoRes.ok) throw new Error("Invalid Bitcoin address or API error");
  const info = await infoRes.json();

  // UTXOs may fail for very large addresses — handle gracefully
  let utxos = [];
  try {
    const utxoRes = await fetch(`${API}/address/${address}/utxo`);
    if (utxoRes.ok) utxos = await utxoRes.json();
  } catch {}

  let txs = [];
  try {
    const txRes = await fetch(`${API}/address/${address}/txs`);
    if (txRes.ok) txs = await txRes.json();
  } catch {}

  let currentHeight = 880000;
  try {
    const tipRes = await fetch(`${API}/blocks/tip/height`);
    if (tipRes.ok) currentHeight = parseInt(await tipRes.text());
  } catch {}

  const metrics = computeMetrics(info, utxos, txs, currentHeight);
  const score = computeScore(metrics);
  const addressHash = await hashAddress(address);

  return { score, metrics, addressHash };
}

function computeMetrics(info, utxos, txs, currentHeight) {
  const totalBalance = (info.chain_stats?.funded_txo_sum - info.chain_stats?.spent_txo_sum) || 0;
  const balanceBtc = totalBalance / 1e8;
  const txCount = (info.chain_stats?.tx_count) || 0;
  const totalFunded = (info.chain_stats?.funded_txo_sum || 0) / 1e8;
  const totalSpent = (info.chain_stats?.spent_txo_sum || 0) / 1e8;
  const totalVolume = totalFunded + totalSpent;

  let totalAge = 0;
  let oldUtxos = 0;
  const SIX_MONTHS_BLOCKS = 26280;

  for (const utxo of utxos) {
    if (utxo.status?.block_height) {
      const ageBlocks = currentHeight - utxo.status.block_height;
      const ageDays = ageBlocks * 10 / 1440;
      totalAge += ageDays;
      if (ageBlocks > SIX_MONTHS_BLOCKS) oldUtxos++;
    }
  }

  const avgUtxoAgeDays = utxos.length > 0 ? totalAge / utxos.length : 0;
  const hodlPercentage = utxos.length > 0 ? (oldUtxos / utxos.length) * 100 : 0;

  let accountAgeDays = 0;
  if (txs.length > 0) {
    const timestamps = txs.filter(t => t.status?.block_time).map(t => t.status.block_time);
    if (timestamps.length > 0) {
      const earliest = Math.min(...timestamps);
      accountAgeDays = (Date.now() / 1000 - earliest) / 86400;
    }
  }
  // If no txs returned but we know tx_count, estimate from chain data
  if (accountAgeDays === 0 && txCount > 0) {
    accountAgeDays = 365 * 4; // estimate for old addresses where API paginates
  }

  const monthsActive = Math.max(accountAgeDays / 30, 1);
  const txFrequency = txCount / monthsActive;

  return {
    avg_utxo_age_days: avgUtxoAgeDays,
    hodl_percentage: hodlPercentage,
    total_volume_btc: totalVolume,
    tx_count: txCount,
    account_age_days: accountAgeDays,
    balance_btc: balanceBtc,
    tx_frequency: txFrequency,
    utxo_count: utxos.length,
  };
}

function computeScore(metrics) {
  const utxo_age_score = Math.min(300, Math.round(300 * (1 - Math.exp(-metrics.avg_utxo_age_days / 365))));
  const holdBase = (metrics.hodl_percentage / 100) * 200;
  const balanceBonus = Math.min(50, Math.round(Math.log(1 + metrics.balance_btc) * 30));
  const hodler_score = Math.min(250, Math.round(holdBase + balanceBonus));
  const volume_score = Math.min(200, Math.round(200 * (1 - Math.exp(-metrics.total_volume_btc / 2))));
  const txBase = Math.min(100, Math.round(Math.log(1 + metrics.tx_count) * 25));
  const freqBonus = Math.min(50, Math.round(Math.min(metrics.tx_frequency, 10) * 5));
  const consistency_score = Math.min(150, txBase + freqBonus);
  const account_age_score = Math.min(100, Math.round(metrics.account_age_days / 1460 * 100));

  const total_score = utxo_age_score + hodler_score + volume_score + consistency_score + account_age_score;

  let tier, collateral_bps;
  if (total_score >= 900) { tier = "Diamond"; collateral_bps = 10000; }
  else if (total_score >= 700) { tier = "Gold"; collateral_bps = 11000; }
  else if (total_score >= 500) { tier = "Silver"; collateral_bps = 12500; }
  else if (total_score >= 300) { tier = "Bronze"; collateral_bps = 14000; }
  else { tier = "Unrated"; collateral_bps = 15000; }

  return { total_score, tier, collateral_bps, utxo_age_score, hodler_score, volume_score, consistency_score, account_age_score };
}

async function hashAddress(address) {
  const data = new TextEncoder().encode(address);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 62);
}

export function tierToNumber(tierName) {
  return { Diamond: 4, Gold: 3, Silver: 2, Bronze: 1, Unrated: 0 }[tierName] || 0;
}
