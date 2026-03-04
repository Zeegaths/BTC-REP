import { CONTRACTS } from "./contracts";

// Skip RPC read calls for now — they cause CORS issues
// The wallet handles its own RPC connection for transactions

export async function hasSBT() {
  return false; // Will check on-chain later
}

export async function getTotalSupply() {
  return 0; // Will read on-chain later
}

export async function mintCreditSBT(wallet, toAddress, score, tier) {
  const account = wallet.account;

  const tx = await account.execute([
    {
      contractAddress: CONTRACTS.SBT,
      entrypoint: "mint_credit_sbt",
      calldata: [toAddress, String(score), String(tier)],
    }
  ]);

  await account.waitForTransaction(tx.transaction_hash);
  return { txHash: tx.transaction_hash };
}

export function getExplorerTxUrl(txHash) {
  return "https://sepolia.starkscan.co/tx/" + txHash;
}

export function getExplorerContractUrl(address) {
  return "https://sepolia.starkscan.co/contract/" + address;
}
