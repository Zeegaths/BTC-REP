/// LendingAdapter: Interface for DeFi lending protocols to query BTCRep credit scores
///
/// This contract provides a standardized way for lending protocols (like Nostra,
/// zkLend, etc.) to check a borrower's Bitcoin-based creditworthiness and adjust
/// collateral requirements accordingly.

use starknet::ContractAddress;

#[starknet::interface]
pub trait ILendingAdapter<TContractState> {
    /// Get the required collateral ratio for a borrower (in basis points)
    /// Returns 15000 (150%) for unrated users, down to 10000 (100%) for Diamond tier
    fn get_required_collateral_bps(self: @TContractState, borrower: ContractAddress) -> u16;

    /// Check if a borrower qualifies for undercollateralized loans
    fn qualifies_for_undercollateralized(self: @TContractState, borrower: ContractAddress) -> bool;

    /// Get the maximum loan-to-value ratio for a borrower (in basis points)
    fn get_max_ltv_bps(self: @TContractState, borrower: ContractAddress) -> u16;

    /// Get the credit tier name as a felt252
    fn get_tier_name(self: @TContractState, borrower: ContractAddress) -> felt252;

    /// Get the oracle contract address
    fn get_oracle(self: @TContractState) -> ContractAddress;

    /// Get the SBT contract address
    fn get_sbt_contract(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
pub mod LendingAdapter {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_access::ownable::OwnableComponent;
    use super::super::types::{CreditTier, CollateralRequirement, tier_to_collateral};

    // Import interfaces for cross-contract calls
    use super::super::reputation_oracle::{
        IReputationOracleDispatcher, IReputationOracleDispatcherTrait,
    };
    use super::super::btc_rep_sbt::{
        IBTCRepSBTDispatcher, IBTCRepSBTDispatcherTrait,
    };

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        /// Address of the ReputationOracle contract
        oracle_address: ContractAddress,
        /// Address of the BTCRepSBT contract
        sbt_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        oracle_address: ContractAddress,
        sbt_address: ContractAddress,
    ) {
        self.ownable.initializer(owner);
        self.oracle_address.write(oracle_address);
        self.sbt_address.write(sbt_address);
    }

    #[abi(embed_v0)]
    impl LendingAdapterImpl of super::ILendingAdapter<ContractState> {
        fn get_required_collateral_bps(self: @ContractState, borrower: ContractAddress) -> u16 {
            let oracle = IReputationOracleDispatcher {
                contract_address: self.oracle_address.read(),
            };

            if !oracle.has_reputation(borrower) {
                return CollateralRequirement::UNRATED;
            }

            oracle.get_collateral_requirement(borrower)
        }

        fn qualifies_for_undercollateralized(
            self: @ContractState,
            borrower: ContractAddress,
        ) -> bool {
            let oracle = IReputationOracleDispatcher {
                contract_address: self.oracle_address.read(),
            };

            if !oracle.has_reputation(borrower) {
                return false;
            }

            let tier = oracle.get_credit_tier(borrower);
            // Only Diamond tier qualifies for undercollateralized (100%)
            tier == CreditTier::DIAMOND
        }

        fn get_max_ltv_bps(self: @ContractState, borrower: ContractAddress) -> u16 {
            let collateral_bps = self.get_required_collateral_bps(borrower);
            // LTV = 1 / collateral_ratio * 10000
            // e.g., 150% collateral = 66.67% LTV = 6667 bps
            // e.g., 100% collateral = 100% LTV = 10000 bps
            10000 * 10000 / collateral_bps
        }

        fn get_tier_name(self: @ContractState, borrower: ContractAddress) -> felt252 {
            let oracle = IReputationOracleDispatcher {
                contract_address: self.oracle_address.read(),
            };

            if !oracle.has_reputation(borrower) {
                return 'Unrated';
            }

            let tier = oracle.get_credit_tier(borrower);
            if tier == CreditTier::DIAMOND {
                'Diamond'
            } else if tier == CreditTier::GOLD {
                'Gold'
            } else if tier == CreditTier::SILVER {
                'Silver'
            } else if tier == CreditTier::BRONZE {
                'Bronze'
            } else {
                'Unrated'
            }
        }

        fn get_oracle(self: @ContractState) -> ContractAddress {
            self.oracle_address.read()
        }

        fn get_sbt_contract(self: @ContractState) -> ContractAddress {
            self.sbt_address.read()
        }
    }
}
