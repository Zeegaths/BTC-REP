/// BTCRepSBT: Soulbound Credit NFT for Bitcoin Reputation
///
/// This contract issues non-transferable ERC721 tokens representing
/// a user's Bitcoin credit score. The token metadata includes the
/// credit tier and score, enabling DeFi protocols to query creditworthiness.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IBTCRepSBT<TContractState> {
    /// Mint a soulbound credit NFT for a user (oracle only)
    fn mint_credit_sbt(
        ref self: TContractState,
        to: ContractAddress,
        score: u16,
        tier: u8,
    );

    /// Update the score on an existing SBT (oracle only)
    fn update_score(
        ref self: TContractState,
        token_id: u256,
        new_score: u16,
        new_tier: u8,
    );

    /// Burn own SBT (only token holder can burn)
    fn burn(ref self: TContractState, token_id: u256);

    /// Get the credit score for a token
    fn get_token_score(self: @TContractState, token_id: u256) -> u16;

    /// Get the credit tier for a token
    fn get_token_tier(self: @TContractState, token_id: u256) -> u8;

    /// Get token ID for an address (returns 0 if none)
    fn get_token_of(self: @TContractState, owner: ContractAddress) -> u256;

    /// Check if address has an SBT
    fn has_sbt(self: @TContractState, owner: ContractAddress) -> bool;

    /// Get the reputation oracle address
    fn get_oracle(self: @TContractState) -> ContractAddress;

    /// Set the reputation oracle address (owner only)
    fn set_oracle(ref self: TContractState, oracle: ContractAddress);

    /// Get total supply
    fn total_supply(self: @TContractState) -> u256;
}

#[starknet::contract]
pub mod BTCRepSBT {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use openzeppelin_token::erc721::ERC721Component;
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_introspection::src5::SRC5Component;

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    // ERC721
    #[abi(embed_v0)]
    impl ERC721MixinImpl = ERC721Component::ERC721MixinImpl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;

    // Ownable
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
  
    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        /// Reputation oracle contract address
        oracle: ContractAddress,
        /// Next token ID to mint
        next_token_id: u256,
        /// Total supply of SBTs
        supply: u256,
        /// Token ID => credit score
        token_scores: Map<u256, u16>,
        /// Token ID => credit tier
        token_tiers: Map<u256, u8>,
        /// Address => token ID (0 if none)
        address_to_token: Map<ContractAddress, u256>,
        /// Whether address has an SBT
        has_sbt_map: Map<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        CreditSBTMinted: CreditSBTMinted,
        ScoreUpdated: ScoreUpdated,
        SBTBurned: SBTBurned,
    }

    #[derive(Drop, starknet::Event)]
    struct CreditSBTMinted {
        #[key]
        to: ContractAddress,
        token_id: u256,
        score: u16,
        tier: u8,
    }

    #[derive(Drop, starknet::Event)]
    struct ScoreUpdated {
        #[key]
        token_id: u256,
        old_score: u16,
        new_score: u16,
        new_tier: u8,
    }

    #[derive(Drop, starknet::Event)]
    struct SBTBurned {
        #[key]
        token_id: u256,
        owner: ContractAddress,
    }

    pub mod Errors {
        pub const UNAUTHORIZED: felt252 = 'Only oracle can mint/update';
        pub const ALREADY_HAS_SBT: felt252 = 'Address already has SBT';
        pub const NO_SBT: felt252 = 'Address has no SBT';
        pub const NOT_TOKEN_OWNER: felt252 = 'Only token owner can burn';
        pub const TRANSFER_BLOCKED: felt252 = 'SBT: transfers are blocked';
        pub const INVALID_SCORE: felt252 = 'Score must be <= 1000';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        oracle: ContractAddress,
    ) {
        let name = "BTCRep Credit Score";
        let symbol = "BTCREP";
        let base_uri = "https://btcrep.xyz/metadata/";

        self.erc721.initializer(name, symbol, base_uri);
        self.ownable.initializer(owner);
        self.oracle.write(oracle);
        self.next_token_id.write(1); // Start from 1
        self.supply.write(0);
    }

    #[abi(embed_v0)]
    impl BTCRepSBTImpl of super::IBTCRepSBT<ContractState> {
        fn mint_credit_sbt(
            ref self: ContractState,
            to: ContractAddress,
            score: u16,
            tier: u8,
        ) {
            // Only the oracle can mint
            let caller = get_caller_address();
            assert(caller == self.oracle.read(), Errors::UNAUTHORIZED);
            assert(score <= 1000, Errors::INVALID_SCORE);
            assert(!self.has_sbt_map.read(to), Errors::ALREADY_HAS_SBT);

            // Mint the token
            let token_id = self.next_token_id.read();
            self.erc721.mint(to, token_id);

            // Store metadata
            self.token_scores.write(token_id, score);
            self.token_tiers.write(token_id, tier);
            self.address_to_token.write(to, token_id);
            self.has_sbt_map.write(to, true);

            // Increment counters
            self.next_token_id.write(token_id + 1);
            self.supply.write(self.supply.read() + 1);

            // Emit event
            self.emit(CreditSBTMinted { to, token_id, score, tier });
        }

        fn update_score(
            ref self: ContractState,
            token_id: u256,
            new_score: u16,
            new_tier: u8,
        ) {
            let caller = get_caller_address();
            assert(caller == self.oracle.read(), Errors::UNAUTHORIZED);
            assert(new_score <= 1000, Errors::INVALID_SCORE);

            let old_score = self.token_scores.read(token_id);
            self.token_scores.write(token_id, new_score);
            self.token_tiers.write(token_id, new_tier);

            self.emit(ScoreUpdated { token_id, old_score, new_score, new_tier });
        }

        fn burn(ref self: ContractState, token_id: u256) {
            let caller = get_caller_address();
            let owner = self.erc721.owner_of(token_id);
            assert(caller == owner, Errors::NOT_TOKEN_OWNER);

            // Clean up metadata
            self.token_scores.write(token_id, 0);
            self.token_tiers.write(token_id, 0);
            self.address_to_token.write(owner, 0);
            self.has_sbt_map.write(owner, false);
            self.supply.write(self.supply.read() - 1);

            // Burn the token
            self.erc721.burn(token_id);

            self.emit(SBTBurned { token_id, owner });
        }

        fn get_token_score(self: @ContractState, token_id: u256) -> u16 {
            self.token_scores.read(token_id)
        }

        fn get_token_tier(self: @ContractState, token_id: u256) -> u8 {
            self.token_tiers.read(token_id)
        }

        fn get_token_of(self: @ContractState, owner: ContractAddress) -> u256 {
            self.address_to_token.read(owner)
        }

        fn has_sbt(self: @ContractState, owner: ContractAddress) -> bool {
            self.has_sbt_map.read(owner)
        }

        fn get_oracle(self: @ContractState) -> ContractAddress {
            self.oracle.read()
        }

        fn set_oracle(ref self: ContractState, oracle: ContractAddress) {
            self.ownable.assert_only_owner();
            self.oracle.write(oracle);
        }

        fn total_supply(self: @ContractState) -> u256 {
            self.supply.read()
        }
    }

    /// Hook to block all transfers — making tokens soulbound
    /// Override the ERC721 transfer checks
    impl ERC721HooksImpl of ERC721Component::ERC721HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            let zero_address: ContractAddress = 0.try_into().unwrap();
            let current_owner = self.ERC721_owners.read(token_id);

            // Allow minting (from == zero) and burning (to == zero)
            // Block all other transfers
            let is_mint = current_owner == zero_address;
            let is_burn = to == zero_address;

            assert(is_mint || is_burn, 'SBT: transfers are blocked');
        }

        fn after_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            // No-op
        }
    }
}
