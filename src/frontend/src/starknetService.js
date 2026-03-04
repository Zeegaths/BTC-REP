import { Contract, RpcProvider, CallData } from "starknet";
import { CONTRACTS, ORACLE_ABI, SBT_ABI, TIER_MAP } from "./contracts";

const SEPOLIA_RPC = "https://alpha-sepolia.starknet.io";
export const provider = new RpcProvider({ nodeUrl: SEPOLIA_RPC });

export async function hasSBT(starknetAddress) {
  try {
    const sbt = new Contract(SBT_ABI, CONTRACTS.SBT, provider);
    return await sbt.has_sbt(starknetAddress);
  } catch { return false; }
}

export async function getTotalSupply() {
  try {
    const sbt = new Contract(SBT_ABI, CONTRACTS.SBT, provider);
    return Number(await sbt.total_supply());
  } catch { return 0; }
}

export async function mintCreditSBT(wallet, toAddress, score, tier) {
  const account = wallet.account;

  const calldata = CallData.compile({
    to: toAddress,
    score: score,
    tier: tier,
  });

  const tx = await account.execute([
    {
      contractAddress: CONTRACTS.SBT,
      entrypoint: "mint_credit_sbt",
      calldata: calldata,
    }
  ]);

  const receipt = await provider.waitForTransaction(tx.transaction_hash);
  return { txHash: tx.transaction_hash, receipt };
}

export function getExplorerTxUrl(txHash) {
  return "https://sepolia.starkscan.co/tx/" + txHash;
}

export function getExplorerContractUrl(address) {
  return "https://sepolia.starkscan.co/contract/" + address;
}
