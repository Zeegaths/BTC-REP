import { useState, useCallback, useEffect } from "react";
import { analyzeBtcAddress, tierToNumber } from "./bitcoinAnalyzer";
import { hasSBT, getTotalSupply, mintCreditSBT, getExplorerTxUrl, getExplorerContractUrl } from "./starknetService";
import { CONTRACTS } from "./contracts";

const TIERS = {
  Diamond: { color: "#60A5FA", emoji: "💎", bg: "bg-blue-900/30", border: "border-blue-500" },
  Gold:    { color: "#FBBF24", emoji: "🥇", bg: "bg-yellow-900/30", border: "border-yellow-500" },
  Silver:  { color: "#9CA3AF", emoji: "🥈", bg: "bg-gray-700/30",   border: "border-gray-400" },
  Bronze:  { color: "#D97706", emoji: "🥉", bg: "bg-orange-900/30", border: "border-orange-500" },
  Unrated: { color: "#6B7280", emoji: "⚪", bg: "bg-gray-800/30",   border: "border-gray-600" },
};

const getXverseProvider = () => {
  if (typeof window !== "undefined" && window.XverseProviders?.BitcoinProvider) return window.XverseProviders.BitcoinProvider;
  if (typeof window !== "undefined" && window.BitcoinProvider) return window.BitcoinProvider;
  return null;
};

const getStarknetWallet = () => {
  if (typeof window !== "undefined") return window.starknet_argentX || window.starknet_braavos || window.starknet || null;
  return null;
};

// Basic BTC address validation
const isValidBtcAddress = (addr) => {
  if (!addr) return false;
  const trimmed = addr.trim();
  // P2PKH (1...), P2SH (3...), Bech32 (bc1...)
  return /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-zAC-HJ-NP-Z02-9]{6,87}|tb1[ac-hj-np-zAC-HJ-NP-Z02-9]{6,87}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(trimmed);
};

function mockAnalyze(profile) {
  const p = {
    diamond_hodler: { score: { total_score: 952, tier: "Diamond", utxo_age_score: 280, hodler_score: 240, volume_score: 165, consistency_score: 147, account_age_score: 100, collateral_bps: 10000 }, metrics: { avg_utxo_age_days: 730, hodl_percentage: 95, total_volume_btc: 5.0, tx_count: 150, account_age_days: 1460, balance_btc: 4.5 } },
    gold_user:      { score: { total_score: 745, tier: "Gold",    utxo_age_score: 220, hodler_score: 170, volume_score: 120, consistency_score: 130, account_age_score: 50,  collateral_bps: 11000 }, metrics: { avg_utxo_age_days: 365, hodl_percentage: 70, total_volume_btc: 1.0, tx_count: 50,  account_age_days: 730,  balance_btc: 0.7  } },
    silver_user:    { score: { total_score: 540, tier: "Silver",  utxo_age_score: 150, hodler_score: 120, volume_score: 90,  consistency_score: 100, account_age_score: 30,  collateral_bps: 12500 }, metrics: { avg_utxo_age_days: 180, hodl_percentage: 50, total_volume_btc: 0.3, tx_count: 25,  account_age_days: 365,  balance_btc: 0.15 } },
    new_user:       { score: { total_score: 185, tier: "Unrated", utxo_age_score: 50,  hodler_score: 30,  volume_score: 40,  consistency_score: 45,  account_age_score: 5,   collateral_bps: 15000 }, metrics: { avg_utxo_age_days: 30,  hodl_percentage: 0,  total_volume_btc: 0.05, tx_count: 5,   account_age_days: 30,   balance_btc: 0.04 } },
  };
  return p[profile] || p.new_user;
}

function ScoreBar({ label, value, max, color }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-mono">{value}/{max}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div className="h-2.5 rounded-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ScoreCircle({ score, tier }) {
  const t = TIERS[tier] || TIERS.Unrated;
  const c = 2 * Math.PI * 70, o = c - (score / 1000) * c;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="70" fill="none" stroke="#374151" strokeWidth="12" />
        <circle cx="90" cy="90" r="70" fill="none" stroke={t.color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={o} transform="rotate(-90 90 90)"
          style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold text-white">{score}</span>
        <span className="text-sm" style={{ color: t.color }}>{t.emoji} {tier}</span>
      </div>
    </div>
  );
}

function WalletBadge({ label, address, icon, connected, color, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${connected ? `${color} border-current/20` : "text-gray-500 border-gray-700 hover:border-gray-500"}`}>
      <span>{icon}</span>
      {connected ? <span className="font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span> : <span>{label}</span>}
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-gray-600"}`} />
    </button>
  );
}

// ── Lookup-only banner shown when viewing a pasted address ──────────────────
function ReadOnlyBanner({ address }) {
  return (
    <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 mb-4 text-sm text-yellow-300">
      <span>👁</span>
      <span>
        Viewing <span className="font-mono">{address.slice(0, 10)}...{address.slice(-6)}</span> —{" "}
        <strong>read-only</strong>. Connect your own wallet to mint an SBT.
      </span>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState("connect");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");

  const [btcWallet, setBtcWallet] = useState({ connected: false, address: "" });
  const [snWallet, setSnWallet] = useState({ connected: false, address: "" });
  const [snWalletObj, setSnWalletObj] = useState(null);

  const [demoMode, setDemoMode] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState("diamond_hodler");

  // ── Paste-address state ──────────────────────────────────────────────────
  const [pasteAddress, setPasteAddress] = useState("");
  const [pasteAddressError, setPasteAddressError] = useState("");
  const [lookupMode, setLookupMode] = useState(false); // true = viewing a pasted address

  const [result, setResult] = useState(null);
  const [addressHash, setAddressHash] = useState("");
  const [mintTxHash, setMintTxHash] = useState("");
  const [totalSBTs, setTotalSBTs] = useState(0);
  const [userHasSBT, setUserHasSBT] = useState(false);

  useEffect(() => { getTotalSupply().then(setTotalSBTs); }, []);
  useEffect(() => { if (snWallet.connected) hasSBT(snWallet.address).then(setUserHasSBT); }, [snWallet.address, snWallet.connected]);

  const connectBtcWallet = useCallback(async () => {
    setError("");
    const p = getXverseProvider();
    if (!p) { setError("Xverse wallet not found. Install from xverse.app"); return; }
    try {
      const res = await p.request("getAccounts", { purposes: ["payment"], message: "BTCRep: connect your Bitcoin wallet" });
      if (res.result?.length > 0) setBtcWallet({ connected: true, address: res.result[0].address });
    } catch (err) { setError("BTC connection failed: " + (err.message || "Rejected")); }
  }, []);

  const connectStarknetWallet = useCallback(async () => {
    setError("");
    const w = getStarknetWallet();
    if (!w) { setError("Install ArgentX or Braavos wallet"); return; }
    try {
      await w.enable();
      const addr = w.selectedAddress || w.account?.address;
      if (addr) { setSnWallet({ connected: true, address: addr }); setSnWalletObj(w); }
    } catch (err) { setError("Starknet connection failed: " + (err.message || "Rejected")); }
  }, []);

  // ── ANALYZE (own wallet or demo) ─────────────────────────────────────────
  const handleAnalyze = async () => {
    setLoading(true);
    setError("");
    setLookupMode(false);
    try {
      if (demoMode) {
        setLoadingMsg("Running demo analysis...");
        await new Promise(r => setTimeout(r, 1500));
        const d = mockAnalyze(selectedProfile);
        setResult({ score: d.score, metrics: d.metrics });
        setAddressHash("demo_hash");
      } else {
        if (!btcWallet.connected) { setError("Connect your Bitcoin wallet first"); setLoading(false); return; }
        setLoadingMsg("Fetching UTXO data from Bitcoin blockchain...");
        const { score, metrics, addressHash: hash } = await analyzeBtcAddress(btcWallet.address);
        setResult({ score, metrics });
        setAddressHash(hash);
      }
      setStep("results");
    } catch (err) {
      setError("Analysis failed: " + err.message);
    }
    setLoading(false);
    setLoadingMsg("");
  };

  // ── LOOKUP (pasted address, read-only) ───────────────────────────────────
  const handleLookup = async () => {
    setPasteAddressError("");
    const addr = pasteAddress.trim();
    if (!isValidBtcAddress(addr)) {
      setPasteAddressError("Invalid Bitcoin address. Supported formats: P2PKH (1…), P2SH (3…), Bech32 (bc1…).");
      return;
    }
    setLoading(true);
    setError("");
    setLookupMode(true);
    try {
      setLoadingMsg("Fetching UTXO data for pasted address...");
      const { score, metrics, addressHash: hash } = await analyzeBtcAddress(addr);
      setResult({ score, metrics });
      setAddressHash(hash);
      setStep("results");
    } catch (err) {
      setError("Lookup failed: " + err.message);
      setLookupMode(false);
    }
    setLoading(false);
    setLoadingMsg("");
  };

  // ── MINT (FIX: single call, not multicall) ────────────────────────────────
  // Argent's multicall fails when there's only one tx bundled as an array in
  // some SDK versions. We pass a single object via account.execute() directly.
  const handleMintSBT = async () => {
    if (!snWallet.connected) { setError("Connect Starknet wallet to mint"); return; }
    if (lookupMode) { setError("You can only mint an SBT for your own connected wallet."); return; }
    setLoading(true);
    setError("");
    try {
      if (demoMode) {
        setLoadingMsg("Simulating mint...");
        await new Promise(r => setTimeout(r, 2000));
        setMintTxHash("0xdemo");
      } else {
        setLoadingMsg("Minting SBT on Starknet — confirm in wallet...");
        const tier = tierToNumber(result.score.tier);

        // ── FIX: call mintCreditSBT which must use a SINGLE call object, not
        //    an array, to avoid "Argent multicall failed".
        //    If you control starknetService.js, make sure mintCreditSBT calls:
        //      account.execute({ contractAddress, entrypoint, calldata })
        //    NOT:
        //      account.execute([{ contractAddress, entrypoint, calldata }])
        //
        //    The patch below wraps the call defensively:
        const { txHash } = await mintCreditSBT(
          snWalletObj,
          snWallet.address,
          result.score.total_score,
          tier,
          { singleCall: true }  // pass hint to starknetService to use single-call mode
        );
        setMintTxHash(txHash);
        setUserHasSBT(true);
      }
      setStep("minted");
    } catch (err) {
      if (err.message?.includes("ALREADY_HAS_SBT")) {
        setError("You already have a BTCRep SBT!");
        setUserHasSBT(true);
      } else {
        setError("Minting failed: " + err.message);
      }
    }
    setLoading(false);
    setLoadingMsg("");
  };

  const resetFlow = () => {
    setStep(btcWallet.connected || snWallet.connected ? "input" : "connect");
    setResult(null);
    setMintTxHash("");
    setError("");
    setLookupMode(false);
    setPasteAddress("");
    setPasteAddressError("");
    if (demoMode) setDemoMode(false);
  };
  const enterDemoMode = () => { setDemoMode(true); setStep("input"); };

  const tierKey = result?.score?.tier || "Unrated";
  const tier = TIERS[tierKey] || TIERS.Unrated;

  // Whether the current result view is read-only (no mint)
  const isReadOnly = lookupMode;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── NAV ── */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/replogo.png" alt="BTCRep" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-bold">BTCRep</span>
            {/* <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">RE{"{DEFINE}"} Hackathon</span> */}
          </div>
          <div className="flex gap-2">
            {totalSBTs > 0 && <span className="text-xs text-gray-600 self-center mr-2">{totalSBTs} SBTs</span>}
            <WalletBadge label="Bitcoin"  address={btcWallet.address} icon="₿" connected={btcWallet.connected} color="text-orange-400" onClick={btcWallet.connected ? undefined : connectBtcWallet} />
            <WalletBadge label="Starknet" address={snWallet.address}  icon="⬡" connected={snWallet.connected}  color="text-blue-400"   onClick={snWallet.connected  ? undefined : connectStarknetWallet} />
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* ── GLOBAL ERROR ── */}
        {error && (
          <div className="mb-6 bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-red-300">{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-white text-sm ml-4">✕</button>
          </div>
        )}
        {/* ── LOADING ── */}
        {loading && loadingMsg && (
          <div className="mb-6 bg-orange-900/20 border border-orange-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <svg className="animate-spin h-4 w-4 text-orange-400 shrink-0" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-orange-300">{loadingMsg}</span>
          </div>
        )}

        {/* ══════════════════════════ CONNECT ══════════════════════════════ */}
        {step === "connect" && (
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">Bitcoin Reputation for <span className="text-orange-400">DeFi Credit</span></h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10">
              Connect your wallets to score &amp; mint — or paste any BTC address to check its reputation.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md mx-auto mb-8">
              <h3 className="text-sm text-gray-400 mb-6 uppercase tracking-wide">Connect Wallets</h3>

              <div className="space-y-3 mb-6">
                <button onClick={connectBtcWallet} disabled={btcWallet.connected}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg border transition text-left ${btcWallet.connected ? "border-green-500/50 bg-green-500/5" : "border-gray-700 bg-gray-800 hover:border-orange-500"}`}>
                  <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center text-xl shrink-0">₿</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{btcWallet.connected ? "Bitcoin Connected" : "Connect Bitcoin (Xverse)"}</div>
                    <div className="text-xs text-gray-500 truncate">{btcWallet.connected ? <span className="font-mono text-green-400">{btcWallet.address.slice(0, 14)}...{btcWallet.address.slice(-6)}</span> : "Your BTC address will be analyzed"}</div>
                  </div>
                  {btcWallet.connected && <span className="text-green-500">✓</span>}
                </button>

                <button onClick={connectStarknetWallet} disabled={snWallet.connected}
                  className={`w-full flex items-center gap-4 p-4 rounded-lg border transition text-left ${snWallet.connected ? "border-green-500/50 bg-green-500/5" : "border-gray-700 bg-gray-800 hover:border-blue-500"}`}>
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center text-xl shrink-0">⬡</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{snWallet.connected ? "Starknet Connected" : "Connect Starknet (ArgentX / Braavos)"}</div>
                    <div className="text-xs text-gray-500 truncate">{snWallet.connected ? <span className="font-mono text-green-400">{snWallet.address.slice(0, 10)}...{snWallet.address.slice(-6)}</span> : "Required to mint your SBT on-chain"}</div>
                  </div>
                  {snWallet.connected && <span className="text-green-500">✓</span>}
                </button>
              </div>

              {(btcWallet.connected || snWallet.connected) && (
                <button onClick={() => setStep("input")} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 rounded-lg transition mb-3">
                  Continue →
                </button>
              )}

              {/* ── OR divider ── */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-gray-800" />
                <span className="text-xs text-gray-600">OR</span>
                <div className="flex-1 border-t border-gray-800" />
              </div>

              {/* ── PASTE ADDRESS LOOKUP ── */}
              <div className="mb-4">
                <label className="text-xs text-gray-400 mb-2 block uppercase tracking-wide">Look up any BTC address</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pasteAddress}
                    onChange={e => { setPasteAddress(e.target.value); setPasteAddressError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleLookup()}
                    placeholder="bc1q… / 1… / 3…"
                    className="flex-1 bg-gray-800 border border-gray-700 focus:border-orange-500 outline-none rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 transition"
                  />
                  <button
                    onClick={handleLookup}
                    disabled={loading || !pasteAddress.trim()}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition whitespace-nowrap"
                  >
                    {loading && lookupMode ? "..." : "Look up"}
                  </button>
                </div>
                {pasteAddressError && <p className="text-xs text-red-400 mt-1">{pasteAddressError}</p>}
                <p className="text-xs text-gray-600 mt-1">Score is read-only. Connect your wallet to mint an SBT.</p>
              </div>

              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 border-t border-gray-800" />
                <span className="text-xs text-gray-600">OR</span>
                <div className="flex-1 border-t border-gray-800" />
              </div>
              <button onClick={enterDemoMode} className="w-full text-sm text-gray-500 hover:text-gray-300 py-2 transition">🧪 Demo Mode</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              {[
                { icon: "🔍", title: "Analyze",  desc: "Real-time UTXO analysis from the Bitcoin blockchain via Blockstream API" },
                { icon: "🔐", title: "Prove",    desc: "Your BTC address is SHA-256 hashed — never stored on-chain in plaintext" },
                { icon: "🏦", title: "Borrow",   desc: "Mint a soulbound credit NFT for better collateral rates in DeFi" },
              ].map((s, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                  <div className="text-3xl mb-3">{s.icon}</div>
                  <h3 className="font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════ INPUT ════════════════════════════════ */}
        {step === "input" && (
          <div className="text-center mb-12">
            {!demoMode && btcWallet.connected && (
              <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-full px-4 py-2 mb-6">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm text-green-400 font-mono">{btcWallet.address.slice(0, 10)}...{btcWallet.address.slice(-6)}</span>
              </div>
            )}
            {demoMode && (
              <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-4 py-2 mb-6">
                <span className="text-sm text-yellow-400">🧪 Demo Mode</span>
              </div>
            )}

            <h2 className="text-3xl font-bold mb-3">{demoMode ? "Select a Demo Profile" : "Ready to Analyze"}</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              {demoMode
                ? "Choose a profile to see how Bitcoin behavior maps to credit scores."
                : "We'll fetch your UTXO data directly from the Bitcoin blockchain and compute your reputation score in real-time."}
            </p>

            {demoMode ? (
              <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto mb-8">
                {[
                  { id: "diamond_hodler", label: "💎 Diamond HODLer", desc: "4yr, 4.5 BTC, 95% HODLed" },
                  { id: "gold_user",      label: "🥇 Gold User",      desc: "2yr, 0.7 BTC, regular txs" },
                  { id: "silver_user",    label: "🥈 Silver User",    desc: "1yr, 0.15 BTC, moderate" },
                  { id: "new_user",       label: "⚪ New User",       desc: "30d, 0.04 BTC, few txs" },
                ].map(p => (
                  <button key={p.id} onClick={() => setSelectedProfile(p.id)}
                    className={`p-4 rounded-lg border text-left transition ${selectedProfile === p.id ? "border-orange-500 bg-orange-500/10" : "border-gray-700 bg-gray-800 hover:border-gray-600"}`}>
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
                  </button>
                ))}
              </div>
            ) : !btcWallet.connected ? (
              <div className="max-w-md mx-auto mb-8">
                <button onClick={connectBtcWallet} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-4 rounded-lg transition">
                  Connect Bitcoin Wallet to Analyze
                </button>
              </div>
            ) : null}

            {/* ── Paste lookup also available on the input step ── */}
            {!demoMode && (
              <div className="max-w-md mx-auto mb-6">
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 border-t border-gray-800" />
                  <span className="text-xs text-gray-600">OR look up any address</span>
                  <div className="flex-1 border-t border-gray-800" />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pasteAddress}
                    onChange={e => { setPasteAddress(e.target.value); setPasteAddressError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleLookup()}
                    placeholder="Paste BTC address…"
                    className="flex-1 bg-gray-800 border border-gray-700 focus:border-orange-500 outline-none rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 transition"
                  />
                  <button
                    onClick={handleLookup}
                    disabled={loading || !pasteAddress.trim()}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition"
                  >
                    {loading && lookupMode ? "..." : "Look up"}
                  </button>
                </div>
                {pasteAddressError && <p className="text-xs text-red-400 mt-1">{pasteAddressError}</p>}
                <p className="text-xs text-gray-600 mt-1">Score check only — minting requires your connected wallet.</p>
              </div>
            )}

            {(demoMode || btcWallet.connected) && (
              <button onClick={handleAnalyze} disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-medium px-8 py-4 rounded-lg transition inline-flex items-center gap-2">
                {loading ? (
                  <><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analyzing...</>
                ) : "🔍 Analyze Bitcoin Reputation"}
              </button>
            )}

            <button onClick={() => { setDemoMode(false); setStep("connect"); }} className="block mx-auto mt-4 text-sm text-gray-500 hover:text-gray-300 transition">← Back</button>
          </div>
        )}

        {/* ══════════════════════════ RESULTS ══════════════════════════════ */}
        {step === "results" && result && (
          <div>
            <div className="flex gap-3 mb-6"><button onClick={resetFlow} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition">← Back</button></div>

            {/* Read-only banner when viewing a pasted address */}
            {isReadOnly && <ReadOnlyBanner address={pasteAddress} />}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* ── Left: score card ── */}
              <div className={`lg:col-span-1 ${tier.bg} border ${tier.border} rounded-xl p-6 text-center`}>
                <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-4">Credit Score</h2>
                <ScoreCircle score={result.score.total_score} tier={result.score.tier} />

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Collateral Required</span>
                    <span className="font-bold" style={{ color: tier.color }}>{(result.score.collateral_bps / 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Savings vs Standard</span>
                    <span className="text-green-400 font-bold">{((15000 - result.score.collateral_bps) / 100).toFixed(0)}%</span>
                  </div>
                </div>

                {/* ── MINT BUTTON LOGIC ── */}
                {isReadOnly ? (
                  // Pasted address: never allow mint
                  <div className="mt-6 space-y-2">
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-300">
                      👁 Read-only — connect your wallet to mint
                    </div>
                    {!snWallet.connected && (
                      <button onClick={connectStarknetWallet} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition text-sm">
                        Connect Starknet Wallet
                      </button>
                    )}
                  </div>
                ) : userHasSBT ? (
                  <div className="mt-6 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <span className="text-sm text-green-400">✓ SBT Already Minted</span>
                  </div>
                ) : !snWallet.connected ? (
                  <button onClick={async () => { const w = window.starknet_argentX || window.starknet_braavos || window.starknet; if (!w) { setError("Install ArgentX or Braavos"); return; } try { await w.enable(); const a = w.selectedAddress || w.account?.address; if (a) { setSnWallet({ connected: true, address: a }); setSnWalletObj(w); } } catch(e) { setError("Connection failed: " + e.message); } }} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition">
                    Connect Starknet to Mint SBT
                  </button>
                ) : (
                  <button onClick={handleMintSBT} disabled={loading} className="w-full mt-6 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 text-white font-medium py-3 rounded-lg transition">
                    {loading ? "Minting..." : `Mint ${result.score.tier} Credit SBT`}
                  </button>
                )}
              </div>

              {/* ── Right: breakdown ── */}
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-sm text-gray-400 uppercase tracking-wide mb-4">Score Breakdown</h2>
                <ScoreBar label="UTXO Age (30%)"       value={result.score.utxo_age_score}     max={300} color="#F97316" />
                <ScoreBar label="HODLer Score (25%)"   value={result.score.hodler_score}        max={250} color="#FBBF24" />
                <ScoreBar label="Volume (20%)"          value={result.score.volume_score}        max={200} color="#60A5FA" />
                <ScoreBar label="Consistency (15%)"     value={result.score.consistency_score}   max={150} color="#A78BFA" />
                <ScoreBar label="Account Age (10%)"     value={result.score.account_age_score}   max={100} color="#34D399" />
                <div className="mt-6 grid grid-cols-3 gap-4">
                  {[
                    { label: "Avg UTXO Age", value: `${Math.round(result.metrics.avg_utxo_age_days)}d` },
                    { label: "HODL %",        value: `${Math.round(result.metrics.hodl_percentage)}%` },
                    { label: "Volume",        value: `${result.metrics.total_volume_btc.toFixed(2)} BTC` },
                    { label: "Transactions",  value: result.metrics.tx_count },
                    { label: "Account Age",   value: `${(result.metrics.account_age_days / 365).toFixed(1)}yr` },
                    { label: "Balance",       value: `${result.metrics.balance_btc.toFixed(4)} BTC` },
                  ].map((m, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-3">
                      <div className="text-xs text-gray-500">{m.label}</div>
                      <div className="text-lg font-bold">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <span className="text-xl">🔐</span>
                <div>
                  <h3 className="font-semibold mb-1 text-sm">Privacy Preserved</h3>
                  <p className="text-xs text-gray-400">Your Bitcoin address is SHA-256 hashed before any on-chain interaction. A STARK proof verifies the score without revealing which address was analyzed.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════ MINTED ═══════════════════════════════ */}
        {step === "minted" && result && (
          <div className="text-center max-w-lg mx-auto">
            <div className="text-6xl mb-6">{tier.emoji}</div>
            <h1 className="text-3xl font-bold mb-3">Credit SBT Minted!</h1>
            <p className="text-gray-400 mb-8">Your {result.score.tier} tier soulbound token is live on Starknet Sepolia.</p>
            <div className={`${tier.bg} border ${tier.border} rounded-xl p-6 mb-6`}>
              <div className="text-sm text-gray-400 mb-2">BTCRep Credit Score</div>
              <div className="text-5xl font-bold mb-1">{result.score.total_score}</div>
              <div className="text-lg" style={{ color: tier.color }}>{tier.emoji} {result.score.tier} Tier</div>
              <div className="mt-4 text-sm text-gray-400">Collateral: <span className="text-white font-bold">{(result.score.collateral_bps / 100).toFixed(0)}%</span> (vs 150% standard)</div>
              <div className="mt-1 text-xs text-gray-500 font-mono">Non-transferable • Soulbound • On-chain</div>
            </div>
            {mintTxHash && mintTxHash !== "0xdemo" && (
              <a href={getExplorerTxUrl(mintTxHash)} target="_blank" rel="noopener noreferrer"
                className="inline-block text-sm text-blue-400 hover:text-blue-300 mb-6 underline">
                View transaction on Starkscan →
              </a>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={resetFlow} className="bg-gray-800 hover:bg-gray-700 px-6 py-3 rounded-lg transition">Analyze Another</button>
              {!demoMode && (
                <a href={getExplorerContractUrl(CONTRACTS.SBT)} target="_blank" rel="noopener noreferrer"
                  className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg transition inline-block">
                  View Contract →
                </a>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800 px-6 py-6 mt-20">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between text-sm text-gray-500 gap-2">
          <span>BTCRep </span>
          <div className="flex gap-4">
            <span>Built with Cairo + STARK proofs</span>
            <span>•</span>
            <span>₿ Bitcoin + 🔒 Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}