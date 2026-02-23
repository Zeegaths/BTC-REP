/// ReputationOracle: Verifies ZK proofs of Bitcoin reputation and stores scores
///
/// This contract acts as the source of truth for Bitcoin reputation scores.
/// It verifies STARK proofs submitted by the backend service, ensuring that
/// reputation scores are computed correctly without revealing Bitcoin addresses.

use starknet::ContractAddress;
use super::types::{ReputationData, ReputationProof};

#[starknet::interface]
pub trait IReputationOracle<TContractState> {
    /// Submit a reputation proof and store the verified score
    fn submit_reputation(ref self: TContractState, proof: ReputationProof, starknet_address: ContractAddress);

    /// Get reputation data for a Starknet address
    fn get_reputation(self: @TContractState, address: ContractAddress) -> ReputationData;

    /// Get the credit tier for an address (used by lending protocols)
    fn get_credit_tier(self: @TContractState, address: ContractAddress) -> u8;

    /// Get the collateral requirement for an address (in basis points)
    fn get_collateral_requirement(self: @TContractState, address: ContractAddress) -> u16;

    /// Check if an address has a verified reputation
    fn has_reputation(self: @TContractState, address: ContractAddress) -> bool;

    /// Update the authorized prover address (owner only)
    fn set_authorized_prover(ref self: TContractState, prover: ContractAddress);

    /// Get the authorized prover address
    fn get_authorized_prover(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod ReputationOracle {
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_access::ownable::OwnableComponent;
    use super::super::types::{
        ReputationData, ReputationProof, CreditTier,
        score_to_tier, tier_to_collateral,
    };

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        /// Mapping from Starknet address to reputation data
        reputations: Map<ContractAddress, ReputationData>,
        /// Whether an address has a reputation record
        has_reputation_map: Map<ContractAddress, bool>,
        /// Authorized prover backend address
        authorized_prover: ContractAddress,
        /// Used nonces to prevent replay attacks
        used_nonces: Map<felt252, bool>,
        /// Total number of reputations stored
        total_reputations: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        ReputationSubmitted: ReputationSubmitted,
        ProverUpdated: ProverUpdated,
    }

    #[derive(Drop, starknet::Event)]
    struct ReputationSubmitted {
        #[key]
        starknet_address: ContractAddress,
        score: u16,
        tier: u8,
        btc_address_hash: felt252,
    }

    #[derive(Drop, starknet::Event)]
    struct ProverUpdated {
        old_prover: ContractAddress,
        new_prover: ContractAddress,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        authorized_prover: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.authorized_prover.write(authorized_prover);
        self.total_reputations.write(0);
    }

    #[abi(embed_v0)]
    impl ReputationOracleImpl of super::IReputationOracle<ContractState> {
        fn submit_reputation(
            ref self: ContractState,
            proof: ReputationProof,
            starknet_address: ContractAddress,
        ) {
            // Only authorized prover can submit reputations
            let caller = get_caller_address();
            let prover = self.authorized_prover.read();
            assert(caller == prover, 'Only authorized prover');

            // Validate score range
            assert(proof.score <= 1000, 'Score must be <= 1000');

            // Prevent replay attacks
            assert(!self.used_nonces.read(proof.nonce), 'Nonce already used');
            self.used_nonces.write(proof.nonce, true);

            // Verify proof commitment (simplified — in production this would
            // verify a full STARK proof using Garaga or similar)
            self.verify_proof_commitment(proof.proof_commitment, proof.score, proof.btc_address_hash);

            // Compute tier from score
            let tier = score_to_tier(proof.score);

            // Store reputation data
            let timestamp = get_block_timestamp();
            let reputation = ReputationData {
                score: proof.score,
                tier,
                utxo_age_days: 0, // Set by detailed proof
                hodler_score: 0,
                volume_score: 0,
                consistency_score: 0,
                account_age_score: 0,
                computed_at: timestamp,
                btc_address_hash: proof.btc_address_hash,
            };

            self.reputations.write(starknet_address, reputation);

            if !self.has_reputation_map.read(starknet_address) {
                self.has_reputation_map.write(starknet_address, true);
                let total = self.total_reputations.read();
                self.total_reputations.write(total + 1);
            }

            // Emit event
            self.emit(ReputationSubmitted {
                starknet_address,
                score: proof.score,
                tier,
                btc_address_hash: proof.btc_address_hash,
            });
        }

        fn get_reputation(self: @ContractState, address: ContractAddress) -> ReputationData {
            assert(self.has_reputation_map.read(address), 'No reputation found');
            self.reputations.read(address)
        }

        fn get_credit_tier(self: @ContractState, address: ContractAddress) -> u8 {
            if !self.has_reputation_map.read(address) {
                return CreditTier::UNRATED;
            }
            let rep = self.reputations.read(address);
            rep.tier
        }

        fn get_collateral_requirement(self: @ContractState, address: ContractAddress) -> u16 {
            let tier = self.get_credit_tier(address);
            tier_to_collateral(tier)
        }

        fn has_reputation(self: @ContractState, address: ContractAddress) -> bool {
            self.has_reputation_map.read(address)
        }

        fn set_authorized_prover(ref self: ContractState, prover: ContractAddress) {
            self.ownable.assert_only_owner();
            let old_prover = self.authorized_prover.read();
            self.authorized_prover.write(prover);
            self.emit(ProverUpdated { old_prover, new_prover: prover });
        }

        fn get_authorized_prover(self: @ContractState) -> ContractAddress {
            self.authorized_prover.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Simplified proof verification
        /// In production, this would verify a full STARK proof
        fn verify_proof_commitment(
            self: @ContractState,
            commitment: felt252,
            score: u16,
            btc_address_hash: felt252,
        ) {
            // Simplified verification: check commitment is non-zero
            // In production: use Garaga SDK to verify STARK/Groth16 proof
            assert(commitment != 0, 'Invalid proof commitment');
        }
    }
}
