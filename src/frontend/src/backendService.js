import { BACKEND_URL } from "./contracts";

export async function analyzeAddress(btcAddress, signature, starknetAddress) {
  const response = await fetch(BACKEND_URL + "/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      btc_address: btcAddress,
      signature: signature,
      starknet_address: starknetAddress,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Backend error" }));
    throw new Error(err.error || "Backend returned " + response.status);
  }
  return response.json();
}

export async function generateProof(addressHash, starknetAddress) {
  const response = await fetch(BACKEND_URL + "/api/prove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address_hash: addressHash, starknet_address: starknetAddress }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Proof generation failed" }));
    throw new Error(err.error || "Backend returned " + response.status);
  }
  return response.json();
}

export async function checkBackendHealth() {
  try {
    const response = await fetch(BACKEND_URL + "/api/health");
    return response.ok;
  } catch { return false; }
}
