// Fetches real Bitcoin data from Blockstream API and computes reputation score
// Includes CORS proxy fallback for local/sandbox environments

const BLOCKSTREAM_API = "https://blockstream.info/api";

// Public CORS proxies — tried in order until one works
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://cors-anywhere.herokuapp.com/${url}`,
];

// Fetch with automatic CORS proxy fallback
async function fetchWithCorsProxy(url) {
  // 1. Try direct first (works in production / when CORS is allowed)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) return res;
  } catch (_) {
    // direct failed — fall through to proxies
  }

  // 2. Try each proxy in order
  for (const makeProxy of CORS_PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal: AbortSignal.timeout(10000) });
      if (res.ok) return res;
    } catch (_) {
      continue;
    }
  }

  throw new Error(`All fetch attempts failed for: ${url}`);
}

export async function analyzeBtcAddress(address) {
  // Validate address format before hitting the network
  if (!isValidBtcAddress(address)) {
    throw new Error("Invalid Bitcoin address format");
  }

  // Fetch address info
  let info;
  try {
    const infoRes = await fetchWithCorsProxy(`${BLOCKSTREAM_API}/address/${address}`);
    info = await infoRes.json();
  } catch (err) {
    throw new Error("Could not reach Bitcoin API. Check your network or try again. (" + err.message + ")");
  }

  // Fetch UTXOs
  let utxos = [];
  try {
    const utxoRes = await fetchWithCorsProxy(`${BLOCKSTREAM_API}/address/${address}/utxo`);
    utxos = await utxoRes.json();
  } catch (err) {
    // Non-fatal: we can still score without UTXOs (age/hodl scores will be 0)
    console.warn("UTXO fetch failed, scoring without UTXO data:", err.message);
  }

  // Fetch recent transactions (last 25)
  let txs = [];
  try {
    const txRes = await fetchWithCorsProxy(`${BLOCKSTREAM_API}/address/${address}/txs`);
    txs = await txRes.json();
  } catch (err) {
    console.warn("TX fetch failed, scoring without tx history:", err.message);
  }

  // Current block height (for UTXO age calculation)
  let currentHeight = 880000; // safe fallback
  try {
    const tipRes = await fetchWithCorsProxy(`${BLOCKSTREAM_API}/blocks/tip/height`);
    currentHeight = parseInt(await tipRes.text());
  } catch (_) {
    console.warn("Could not fetch block tip height, using fallback:", currentHeight);
  }

  const metrics = computeMetrics(info, utxos, txs, currentHeight);
  const score = computeScore(metrics);
  const addressHash = await hashAddress(address);

  return { score, metrics, addressHash };
}

function isValidBtcAddress(addr) {
  if (!addr) return false;
  return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-zAC-HJ-NP-Z02-9]{6,87})$/.test(addr.trim());
}

function computeMetrics(info, utxos, txs, currentHeight) {
  const totalBalance = (info.chain_stats?.funded_txo_sum - info.chain_stats?.spent_txo_sum) || 0;
  const balanceBtc = totalBalance / 1e8;
  const txCount = info.chain_stats?.tx_count || 0;
  const totalFunded = (info.chain_stats?.funded_txo_sum || 0) / 1e8;
  const totalSpent  = (info.chain_stats?.spent_txo_sum  || 0) / 1e8;
  const totalVolume = totalFunded + totalSpent;

  // UTXO age analysis
  let totalAge = 0;
  let oldUtxos = 0;
  const SIX_MONTHS_BLOCKS = 26280;

  for (const utxo of utxos) {
    if (utxo.status?.block_height) {
      const ageBlocks = currentHeight - utxo.status.block_height;
      const ageDays = (ageBlocks * 10) / 1440;
      totalAge += ageDays;
      if (ageBlocks > SIX_MONTHS_BLOCKS) oldUtxos++;
    }
  }

  const avgUtxoAgeDays  = utxos.length > 0 ? totalAge / utxos.length : 0;
  const hodlPercentage  = utxos.length > 0 ? (oldUtxos / utxos.length) * 100 : 0;

  // Account age from earliest tx in the fetched batch
  let accountAgeDays = 0;
  if (txs.length > 0) {
    const timestamps = txs.filter(t => t.status?.block_time).map(t => t.status.block_time);
    if (timestamps.length > 0) {
      const earliest = Math.min(...timestamps);
      accountAgeDays = (Date.now() / 1000 - earliest) / 86400;
    }
  }

  const monthsActive = Math.max(accountAgeDays / 30, 1);
  const txFrequency  = txCount / monthsActive;

  return {
    avg_utxo_age_days: avgUtxoAgeDays,
    hodl_percentage:   hodlPercentage,
    total_volume_btc:  totalVolume,
    tx_count:          txCount,
    account_age_days:  accountAgeDays,
    balance_btc:       balanceBtc,
    tx_frequency:      txFrequency,
    utxo_count:        utxos.length,
  };
}

function computeScore(metrics) {
  const utxo_age_score = Math.min(300, Math.round(
    300 * (1 - Math.exp(-metrics.avg_utxo_age_days / 365))
  ));

  const holdBase    = (metrics.hodl_percentage / 100) * 200;
  const balanceBonus = Math.min(50, Math.round(Math.log(1 + metrics.balance_btc) * 30));
  const hodler_score = Math.min(250, Math.round(holdBase + balanceBonus));

  const volume_score = Math.min(200, Math.round(
    200 * (1 - Math.exp(-metrics.total_volume_btc / 2))
  ));

  const txBase    = Math.min(100, Math.round(Math.log(1 + metrics.tx_count) * 25));
  const freqBonus = Math.min(50, Math.round(Math.min(metrics.tx_frequency, 10) * 5));
  const consistency_score = Math.min(150, txBase + freqBonus);

  const account_age_score = Math.min(100, Math.round(
    metrics.account_age_days / 1460 * 100
  ));

  const total_score = utxo_age_score + hodler_score + volume_score + consistency_score + account_age_score;

  let tier, collateral_bps;
  if      (total_score >= 900) { tier = "Diamond"; collateral_bps = 10000; }
  else if (total_score >= 700) { tier = "Gold";    collateral_bps = 11000; }
  else if (total_score >= 500) { tier = "Silver";  collateral_bps = 12500; }
  else if (total_score >= 300) { tier = "Bronze";  collateral_bps = 14000; }
  else                          { tier = "Unrated"; collateral_bps = 15000; }

  return {
    total_score, tier, collateral_bps,
    utxo_age_score, hodler_score, volume_score, consistency_score, account_age_score,
  };
}

async function hashAddress(address) {
  const encoder = new TextEncoder();
  const data = encoder.encode(address);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 62);
}

export function tierToNumber(tierName) {
  const map = { Diamond: 4, Gold: 3, Silver: 2, Bronze: 1, Unrated: 0 };
  return map[tierName] || 0;
}