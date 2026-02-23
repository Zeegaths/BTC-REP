use snforge_std::{
    ContractClassTrait, DeclareResultTrait,
    declare, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::{ContractAddress, contract_address_const};

use btc_reputation::types::{
    ReputationProof, CreditTier, CollateralRequirement,
    score_to_tier, tier_to_collateral,
};
use btc_reputation::reputation_oracle::{
    IReputationOracleDispatcher, IReputationOracleDispatcherTrait,
};
use btc_reputation::btc_rep_sbt::{
    IBTCRepSBTDispatcher, IBTCRepSBTDispatcherTrait,
};
use btc_reputation::lending_adapter::{
    ILendingAdapterDispatcher, ILendingAdapterDispatcherTrait,
};

// ============================================
// Helper functions
// ============================================

fn OWNER() -> ContractAddress {
    contract_address_const::<'OWNER'>()
}

fn PROVER() -> ContractAddress {
    contract_address_const::<'PROVER'>()
}

fn USER1() -> ContractAddress {
    contract_address_const::<'USER1'>()
}

fn USER2() -> ContractAddress {
    contract_address_const::<'USER2'>()
}

fn deploy_oracle() -> IReputationOracleDispatcher {
    let contract = declare("ReputationOracle").unwrap().contract_class();
    let mut calldata = array![];
    OWNER().serialize(ref calldata);
    PROVER().serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    IReputationOracleDispatcher { contract_address: address }
}

fn deploy_sbt(oracle_address: ContractAddress) -> IBTCRepSBTDispatcher {
    let contract = declare("BTCRepSBT").unwrap().contract_class();
    let mut calldata = array![];
    OWNER().serialize(ref calldata);
    oracle_address.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    IBTCRepSBTDispatcher { contract_address: address }
}

fn deploy_lending_adapter(
    oracle_address: ContractAddress,
    sbt_address: ContractAddress,
) -> ILendingAdapterDispatcher {
    let contract = declare("LendingAdapter").unwrap().contract_class();
    let mut calldata = array![];
    OWNER().serialize(ref calldata);
    oracle_address.serialize(ref calldata);
    sbt_address.serialize(ref calldata);
    let (address, _) = contract.deploy(@calldata).unwrap();
    ILendingAdapterDispatcher { contract_address: address }
}

fn make_proof(score: u16, nonce: felt252) -> ReputationProof {
    ReputationProof {
        score,
        btc_address_hash: 'btc_hash_12345',
        proof_commitment: 'valid_commitment',
        nonce,
    }
}

// ============================================
// Type utility tests
// ============================================

#[test]
fn test_score_to_tier_diamond() {
    assert(score_to_tier(950) == CreditTier::DIAMOND, 'Should be Diamond');
    assert(score_to_tier(900) == CreditTier::DIAMOND, 'Should be Diamond at 900');
    assert(score_to_tier(1000) == CreditTier::DIAMOND, 'Should be Diamond at 1000');
}

#[test]
fn test_score_to_tier_gold() {
    assert(score_to_tier(700) == CreditTier::GOLD, 'Should be Gold at 700');
    assert(score_to_tier(899) == CreditTier::GOLD, 'Should be Gold at 899');
}

#[test]
fn test_score_to_tier_silver() {
    assert(score_to_tier(500) == CreditTier::SILVER, 'Should be Silver at 500');
    assert(score_to_tier(699) == CreditTier::SILVER, 'Should be Silver at 699');
}

#[test]
fn test_score_to_tier_bronze() {
    assert(score_to_tier(300) == CreditTier::BRONZE, 'Should be Bronze at 300');
    assert(score_to_tier(499) == CreditTier::BRONZE, 'Should be Bronze at 499');
}

#[test]
fn test_score_to_tier_unrated() {
    assert(score_to_tier(0) == CreditTier::UNRATED, 'Should be Unrated at 0');
    assert(score_to_tier(299) == CreditTier::UNRATED, 'Should be Unrated at 299');
}

#[test]
fn test_tier_to_collateral() {
    assert(tier_to_collateral(CreditTier::DIAMOND) == 10000, 'Diamond = 100%');
    assert(tier_to_collateral(CreditTier::GOLD) == 11000, 'Gold = 110%');
    assert(tier_to_collateral(CreditTier::SILVER) == 12500, 'Silver = 125%');
    assert(tier_to_collateral(CreditTier::BRONZE) == 14000, 'Bronze = 140%');
    assert(tier_to_collateral(CreditTier::UNRATED) == 15000, 'Unrated = 150%');
}

// ============================================
// ReputationOracle tests
// ============================================

#[test]
fn test_oracle_submit_reputation() {
    let oracle = deploy_oracle();
    let proof = make_proof(850, 'nonce_1');

    // Submit as authorized prover
    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
    stop_cheat_caller_address(oracle.contract_address);

    // Verify
    assert(oracle.has_reputation(USER1()), 'Should have reputation');
    let rep = oracle.get_reputation(USER1());
    assert(rep.score == 850, 'Score should be 850');
    assert(rep.tier == CreditTier::GOLD, 'Should be Gold tier');
}

#[test]
fn test_oracle_credit_tier_query() {
    let oracle = deploy_oracle();

    // No reputation yet
    assert(oracle.get_credit_tier(USER1()) == CreditTier::UNRATED, 'Should be unrated');

    // Submit Diamond score
    let proof = make_proof(950, 'nonce_2');
    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
    stop_cheat_caller_address(oracle.contract_address);

    assert(oracle.get_credit_tier(USER1()) == CreditTier::DIAMOND, 'Should be Diamond');
}

#[test]
fn test_oracle_collateral_requirement() {
    let oracle = deploy_oracle();

    // Unrated user gets 150%
    assert(oracle.get_collateral_requirement(USER1()) == 15000, 'Unrated = 150%');

    // Submit Gold score
    let proof = make_proof(750, 'nonce_3');
    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
    stop_cheat_caller_address(oracle.contract_address);

    assert(oracle.get_collateral_requirement(USER1()) == 11000, 'Gold = 110%');
}

#[test]
#[should_panic(expected: 'Only authorized prover')]
fn test_oracle_unauthorized_submit() {
    let oracle = deploy_oracle();
    let proof = make_proof(500, 'nonce_4');

    // Try to submit as random user (not prover)
    start_cheat_caller_address(oracle.contract_address, USER1());
    oracle.submit_reputation(proof, USER1());
}

#[test]
#[should_panic(expected: 'Score must be <= 1000')]
fn test_oracle_invalid_score() {
    let oracle = deploy_oracle();
    let proof = ReputationProof {
        score: 1500,
        btc_address_hash: 'hash',
        proof_commitment: 'commitment',
        nonce: 'nonce_5',
    };

    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
}

#[test]
#[should_panic(expected: 'Nonce already used')]
fn test_oracle_replay_protection() {
    let oracle = deploy_oracle();
    let proof = make_proof(600, 'same_nonce');

    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());

    // Try to replay with same nonce
    let proof2 = make_proof(600, 'same_nonce');
    oracle.submit_reputation(proof2, USER2());
}

#[test]
fn test_oracle_set_prover() {
    let oracle = deploy_oracle();
    let new_prover = contract_address_const::<'NEW_PROVER'>();

    start_cheat_caller_address(oracle.contract_address, OWNER());
    oracle.set_authorized_prover(new_prover);
    stop_cheat_caller_address(oracle.contract_address);

    assert(oracle.get_authorized_prover() == new_prover, 'Prover should be updated');
}

// ============================================
// BTCRepSBT tests
// ============================================

#[test]
fn test_sbt_mint() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);

    // Mint as oracle
    start_cheat_caller_address(sbt.contract_address, oracle.contract_address);
    sbt.mint_credit_sbt(USER1(), 800, CreditTier::GOLD);
    stop_cheat_caller_address(sbt.contract_address);

    assert(sbt.has_sbt(USER1()), 'Should have SBT');
    assert(sbt.get_token_score(1) == 800, 'Score should be 800');
    assert(sbt.get_token_tier(1) == CreditTier::GOLD, 'Should be Gold');
    assert(sbt.total_supply() == 1, 'Supply should be 1');
}

#[test]
fn test_sbt_update_score() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);

    // Mint
    start_cheat_caller_address(sbt.contract_address, oracle.contract_address);
    sbt.mint_credit_sbt(USER1(), 500, CreditTier::SILVER);

    // Update
    sbt.update_score(1, 900, CreditTier::DIAMOND);
    stop_cheat_caller_address(sbt.contract_address);

    assert(sbt.get_token_score(1) == 900, 'Score should be 900');
    assert(sbt.get_token_tier(1) == CreditTier::DIAMOND, 'Should be Diamond');
}

#[test]
fn test_sbt_burn() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);

    // Mint
    start_cheat_caller_address(sbt.contract_address, oracle.contract_address);
    sbt.mint_credit_sbt(USER1(), 700, CreditTier::GOLD);
    stop_cheat_caller_address(sbt.contract_address);

    // Burn as owner
    start_cheat_caller_address(sbt.contract_address, USER1());
    sbt.burn(1);
    stop_cheat_caller_address(sbt.contract_address);

    assert(!sbt.has_sbt(USER1()), 'Should not have SBT');
    assert(sbt.total_supply() == 0, 'Supply should be 0');
}

#[test]
#[should_panic(expected: 'Only oracle can mint/update')]
fn test_sbt_unauthorized_mint() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);

    // Try to mint as random user
    start_cheat_caller_address(sbt.contract_address, USER1());
    sbt.mint_credit_sbt(USER1(), 500, CreditTier::SILVER);
}

#[test]
#[should_panic(expected: 'Address already has SBT')]
fn test_sbt_double_mint() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);

    start_cheat_caller_address(sbt.contract_address, oracle.contract_address);
    sbt.mint_credit_sbt(USER1(), 500, CreditTier::SILVER);
    sbt.mint_credit_sbt(USER1(), 600, CreditTier::SILVER); // Should panic
}

// ============================================
// LendingAdapter tests
// ============================================

#[test]
fn test_lending_adapter_unrated_user() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);
    let adapter = deploy_lending_adapter(oracle.contract_address, sbt.contract_address);

    // Unrated user should get 150% collateral
    let collateral = adapter.get_required_collateral_bps(USER1());
    assert(collateral == 15000, 'Unrated = 150%');
    assert(!adapter.qualifies_for_undercollateralized(USER1()), 'Should not qualify');
}

#[test]
fn test_lending_adapter_diamond_user() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);
    let adapter = deploy_lending_adapter(oracle.contract_address, sbt.contract_address);

    // Submit Diamond reputation
    let proof = make_proof(950, 'nonce_lending');
    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
    stop_cheat_caller_address(oracle.contract_address);

    // Diamond user gets 100% collateral
    let collateral = adapter.get_required_collateral_bps(USER1());
    assert(collateral == 10000, 'Diamond = 100%');
    assert(adapter.qualifies_for_undercollateralized(USER1()), 'Should qualify');
}

#[test]
fn test_lending_adapter_tier_names() {
    let oracle = deploy_oracle();
    let sbt = deploy_sbt(oracle.contract_address);
    let adapter = deploy_lending_adapter(oracle.contract_address, sbt.contract_address);

    // Unrated
    assert(adapter.get_tier_name(USER1()) == 'Unrated', 'Should be Unrated');

    // Submit Gold reputation
    let proof = make_proof(750, 'nonce_tier');
    start_cheat_caller_address(oracle.contract_address, PROVER());
    oracle.submit_reputation(proof, USER1());
    stop_cheat_caller_address(oracle.contract_address);

    assert(adapter.get_tier_name(USER1()) == 'Gold', 'Should be Gold');
}
