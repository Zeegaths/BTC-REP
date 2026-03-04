import { CONTRACTS } from "./contracts";

export async function hasSBT() {
  return false;
}

export async function getTotalSupply() {
  return 0;
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

  // Don't wait for confirmation — CORS blocks RPC calls
  // Just return the tx hash, user can check on explorer
  return { txHash: tx.transaction_hash };
}

export function getExplorerTxUrl(txHash) {
  return "https://sepolia.starkscan.co/tx/" + txHash;
}

export function getExplorerContractUrl(address) {
  return "https://sepolia.starkscan.co/contract/" + address;
}
