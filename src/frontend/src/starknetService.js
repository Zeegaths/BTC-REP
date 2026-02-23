import { Contract, RpcProvider } from "starknet";
import { CONTRACTS, ORACLE_ABI, SBT_ABI, TIER_MAP } from "./contracts";

const SEPOLIA_RPC = "https://starknet-sepolia.public.blastapi.io/rpc/v0_7";
export const provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });

export const getOracleContract = () => new Contract(ORACLE_ABI, CONTRACTS.ORACLE, provider);
export const getSbtContract = () => new Contract(SBT_ABI, CONTRACTS.SBT, provider);

export async function hasReputation(starknetAddress) {
  try {
    const oracle = getOracleContract();
    return await oracle.has_reputation(starknetAddress);
  } catch { return false; }
}

export async function getCreditTier(starknetAddress) {
  try {
    const oracle = getOracleContract();
    const tier = await oracle.get_credit_tier(starknetAddress);
    return { tier: Number(tier), tierName: TIER_MAP[Number(tier)] || "Unrated" };
  } catch { return { tier: 0, tierName: "Unrated" }; }
}

export async function getCollateralRequirement(starknetAddress) {
  try {
    const oracle = getOracleContract();
    return Number(await oracle.get_collateral_requirement(starknetAddress));
  } catch { return 15000; }
}

export async function hasSBT(starknetAddress) {
  try {
    const sbt = getSbtContract();
    return await sbt.has_sbt(starknetAddress);
  } catch { return false; }
}

export async function getTotalSupply() {
  try {
    const sbt = getSbtContract();
    return Number(await sbt.total_supply());
  } catch { return 0; }
}

export async function mintCreditSBT(wallet, toAddress, score, tier) {
  const account = wallet.account;
  const sbt = new Contract(SBT_ABI, CONTRACTS.SBT, account);
  const tx = await sbt.mint_credit_sbt(toAddress, score, tier);
  const receipt = await provider.waitForTransaction(tx.transaction_hash);
  return { txHash: tx.transaction_hash, receipt };
}

export function getExplorerTxUrl(txHash) {
  return "https://sepolia.starkscan.co/tx/" + txHash;
}

export function getExplorerContractUrl(address) {
  return "https://sepolia.starkscan.co/contract/" + address;
}
