# BTCRep — Bitcoin Reputation for DeFi Credit

> **RE{DEFINE} Hackathon** · Starknet · Bitcoin + Privacy Track

BTCRep lets you prove your Bitcoin financial behavior on Starknet — without ever revealing your address. Connect your BTC wallet, get a real-time credit score based on your UTXO history, and mint a soulbound NFT that DeFi protocols can use to offer you better loan terms.

---

## The Problem

DeFi lending is overcollateralized by default. Everyone borrows at 150% collateral regardless of their actual financial history. Bitcoin holders with years of responsible on-chain behavior have no way to prove their creditworthiness — their history is locked in a different chain, in a different format, with no privacy-preserving bridge.

## The Solution

BTCRep analyzes your Bitcoin UTXO history, computes a reputation score (0–1000), and mints a **Soulbound Token (SBT)** on Starknet. The SBT stores your tier and score — but never your Bitcoin address. DeFi protocols can query the SBT to offer reduced collateral requirements to verified, high-reputation borrowers.

---

## How It Works

```
1. Connect Xverse (BTC) + ArgentX / Braavos (Starknet)
2. Authorize UTXO analysis of your Bitcoin address
3. Score is computed from on-chain Bitcoin data (Blockstream API)
4. STARK proof attests: "address with hash H has score S"
5. Proof submitted to ReputationOracle on Starknet
6. BTCRepSBT mints your non-transferable credit NFT
7. DeFi protocols query LendingAdapter for your credit terms
```

Your Bitcoin address **never touches Starknet**. Only a SHA-256 hash, the score, and the proof are submitted on-chain.

---

## Credit Tiers

Your score (0–1000) maps to one of five tiers. Each tier unlocks a different collateral requirement when borrowing in DeFi.

| Tier | Score Range | Collateral | Savings vs Standard | Signal |
|------|-------------|------------|---------------------|--------|
| 💎 Diamond | 900–1000 | 100% | −50% | Long-term HODLer, high balance, years of consistent activity |
| 🥇 Gold | 700–899 | 110% | −40% | Regular user, significant holdings, multi-year account |
| 🥈 Silver | 500–699 | 125% | −25% | Moderate activity, some aged UTXOs, established account |
| 🥉 Bronze | 300–499 | 140% | −10% | New-ish account or mostly spent UTXOs, some history |
| ⚪ Unrated | 0–299 | 150% | — | Very new account, minimal activity, or fresh wallet |

Standard DeFi collateral is 150%. A Diamond borrower only needs 100% — meaning they can borrow the full value of their collateral rather than two-thirds of it.

---

## Scoring Algorithm

The reputation score is built from five weighted components, all derived from public Bitcoin on-chain data:

### 1. UTXO Age — 300 pts (30%)
Measures how long your unspent outputs have been sitting. Older UTXOs signal that you're not panic-selling. Uses logarithmic scaling so very old UTXOs are rewarded but there's no cliff.

```
score = 300 × (1 − e^(−avg_age_days / 365))
```

### 2. HODLer Score — 250 pts (25%)
What percentage of your UTXOs have been held for more than 6 months, combined with a balance bonus. Rewards conviction over trading.

```
score = (hodl_pct × 200) + min(50, log(1 + balance_btc) × 30)
```

### 3. Volume Score — 200 pts (20%)
Logarithmic scaling of your total historical BTC volume (sent + received). Rewards real economic activity without unfairly punishing smaller holders.

```
score = 200 × (1 − e^(−total_volume / 2))
```

### 4. Consistency Score — 150 pts (15%)
Transaction count combined with frequency regularity. A consistent pattern of activity scores better than a one-time large transfer.

```
score = min(100, log(1 + tx_count) × 25) + min(50, tx_per_month × 5)
```

### 5. Account Age — 100 pts (10%)
Linear scaling up to 4 years. A brand-new wallet starts at 0; a 4-year-old wallet earns the full 100 points.

```
score = min(100, account_age_days / 1460 × 100)
```

---

## Privacy Model

1. Bitcoin address is **never sent to Starknet**
2. Score is computed locally in your browser using the Blockstream public API
3. A STARK proof attests: *"the address with hash H has score S"*
4. Only the hash, score, and proof are submitted on-chain
5. The SBT stores your score and tier — **not** which Bitcoin address backed it

This means a lender can verify your score is real without knowing your Bitcoin address.

> **Note:** Full STARK proof generation (Stwo prover + Garaga SDK on-chain verification) is the post-hackathon roadmap item. The MVP uses a mock proof with the full verification architecture in place.

---

## Smart Contracts

### ReputationOracle
Source of truth for Bitcoin reputation scores on Starknet.
- `submit_reputation(address_hash, score, tier, proof)` — authorized prover submits scores
- `get_credit_tier(address)` — returns the tier for a given Starknet address
- `get_collateral_requirement(address)` — returns collateral BPS for lending protocols
- Nonce-based replay protection; only authorized prover can submit

### BTCRepSBT
Non-transferable ERC721 representing a user's credit score.
- One SBT per address, score is updatable
- Transfer hook blocks all transfers except mint/burn
- Metadata: score, tier, timestamp

### LendingAdapter
Standardized interface for DeFi protocol integration (Nostra, zkLend, etc.)
- Returns collateral requirements and LTV ratios
- Designed to be queried permissionlessly by any lending protocol

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Cairo (Starknet), OpenZeppelin Cairo |
| Contract Tests | Starknet Foundry (`snforge`) |
| Frontend | React + TailwindCSS |
| Bitcoin Data | Blockstream API (browser, no backend) |
| BTC Wallet | Xverse (via `BitcoinProvider`) |
| Starknet Wallet | ArgentX / Braavos |
| Proof System | STARK proofs — Stwo prover / Garaga SDK (roadmap) |
| Deployment | Starknet Sepolia testnet |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

No backend required. The scoring runs entirely in the browser via the Blockstream public API.

> **CORS note:** The Blockstream API blocks direct requests from `localhost` due to CORS. The app automatically falls back to a public CORS proxy during development. In production (any real domain), direct requests work fine.

---

## Project Structure

```
btcrep/
├── src/
│   ├── App.jsx               # Main UI, wallet connections, flow logic
│   ├── bitcoinAnalyzer.js    # UTXO fetch + scoring algorithm
│   ├── starknetService.js    # Contract calls (mint, hasSBT, totalSupply)
│   └── contracts.js          # Contract addresses
├── contracts/
│   ├── reputation_oracle/    # Cairo: score storage + proof verification
│   ├── btcrep_sbt/           # Cairo: soulbound NFT
│   └── lending_adapter/      # Cairo: DeFi integration interface
└── tests/
    └── *_test.cairo          # snforge test suite
```

---

## Lookup Mode

You can check the reputation score of **any** Bitcoin address without connecting a wallet — just paste the address into the lookup field. This is read-only: the mint button is disabled for pasted addresses. Only your own connected wallet can mint an SBT.

---

## Hackathon Scope

### MVP (Delivered)
- [x] Cairo smart contracts — Oracle, SBT, LendingAdapter
- [x] Contract tests with snforge
- [x] Bitcoin UTXO analysis (5-component scoring algorithm)
- [x] React frontend with wallet connections
- [x] Demo mode with preset profiles
- [x] Paste-address reputation lookup
- [x] Mock proof generation
- [x] Deployment to Starknet Sepolia

### Post-Hackathon Roadmap
- [ ] Full STARK proof generation with Stwo prover
- [ ] On-chain proof verification with Garaga SDK
- [ ] Integration with Nostra / zkLend for real loan terms
- [ ] Multi-address aggregation (prove you control multiple BTC addresses)
- [ ] Historical score tracking and refresh mechanism
- [ ] Score decay for inactive wallets
- [ ] Mainnet deployment

---

## Contract Addresses (Sepolia Testnet)

| Contract | Address |
|----------|---------|
| ReputationOracle | `TBD` |
| BTCRepSBT | `TBD` |
| LendingAdapter | `TBD` |

---

## License

MIT 