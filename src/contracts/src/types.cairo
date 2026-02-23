// Shared types for BTCRep protocol

use starknet::ContractAddress;

/// Reputation score data for a Bitcoin HODLer
#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct ReputationData {
    /// Overall reputation score (0-1000)
    pub score: u16,
    /// Credit tier: 0=Unrated, 1=Bronze, 2=Silver, 3=Gold, 4=Diamond
    pub tier: u8,
    /// Average UTXO age in days
    pub utxo_age_days: u32,
    /// HODLer score component (0-250)
    pub hodler_score: u16,
    /// Transaction volume score component (0-200)
    pub volume_score: u16,
    /// Consistency score component (0-150)
    pub consistency_score: u16,
    /// Account age score component (0-100)
    pub account_age_score: u16,
    /// Timestamp when score was computed
    pub computed_at: u64,
    /// Hash of the Bitcoin address (for privacy — not the actual address)
    pub btc_address_hash: felt252,
}

/// Proof submission for ZK verification
#[derive(Drop, Serde, Copy)]
pub struct ReputationProof {
    /// The computed reputation score
    pub score: u16,
    /// Hash of the Bitcoin address
    pub btc_address_hash: felt252,
    /// STARK proof commitment
    pub proof_commitment: felt252,
    /// Proof nonce to prevent replay
    pub nonce: felt252,
}

/// Credit tier thresholds
pub mod CreditTier {
    pub const UNRATED: u8 = 0;
    pub const BRONZE: u8 = 1;
    pub const SILVER: u8 = 2;
    pub const GOLD: u8 = 3;
    pub const DIAMOND: u8 = 4;

    pub const BRONZE_THRESHOLD: u16 = 300;
    pub const SILVER_THRESHOLD: u16 = 500;
    pub const GOLD_THRESHOLD: u16 = 700;
    pub const DIAMOND_THRESHOLD: u16 = 900;
}

/// Collateral requirements per tier (in basis points, e.g., 15000 = 150%)
pub mod CollateralRequirement {
    pub const UNRATED: u16 = 15000;  // 150%
    pub const BRONZE: u16 = 14000;   // 140%
    pub const SILVER: u16 = 12500;   // 125%
    pub const GOLD: u16 = 11000;     // 110%
    pub const DIAMOND: u16 = 10000;  // 100%
}

/// Compute credit tier from reputation score
pub fn score_to_tier(score: u16) -> u8 {
    if score >= CreditTier::DIAMOND_THRESHOLD {
        CreditTier::DIAMOND
    } else if score >= CreditTier::GOLD_THRESHOLD {
        CreditTier::GOLD
    } else if score >= CreditTier::SILVER_THRESHOLD {
        CreditTier::SILVER
    } else if score >= CreditTier::BRONZE_THRESHOLD {
        CreditTier::BRONZE
    } else {
        CreditTier::UNRATED
    }
}

/// Get collateral requirement for a given tier
pub fn tier_to_collateral(tier: u8) -> u16 {
    if tier == CreditTier::DIAMOND {
        CollateralRequirement::DIAMOND
    } else if tier == CreditTier::GOLD {
        CollateralRequirement::GOLD
    } else if tier == CreditTier::SILVER {
        CollateralRequirement::SILVER
    } else if tier == CreditTier::BRONZE {
        CollateralRequirement::BRONZE
    } else {
        CollateralRequirement::UNRATED
    }
}
