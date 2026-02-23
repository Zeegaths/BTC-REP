export const CONTRACTS = {
  ORACLE: import.meta.env.VITE_ORACLE_ADDRESS || "0x038899417224c5fea5c2ad8798fdd575b6fb2b8e9d52addef0f4629dcc7db409",
  SBT: import.meta.env.VITE_SBT_ADDRESS || "0x05f728ddc6fee078828cd6c0526c80b2c178442849ac71cd5533f77ba78f74a8",
  ADAPTER: import.meta.env.VITE_ADAPTER_ADDRESS || "0x01a10d5ab014176751f7362e7a7b605b6f14c283f46163fd07069ee80188a671",
};

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8080";

export const ORACLE_ABI = [
  {
    name: "get_reputation",
    type: "function",
    inputs: [{ name: "address", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "(core::integer::u16, core::integer::u8, core::integer::u32, core::integer::u16, core::integer::u16, core::integer::u16, core::integer::u16, core::integer::u64, core::felt252)" }],
    state_mutability: "view",
  },
  {
    name: "get_credit_tier",
    type: "function",
    inputs: [{ name: "address", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u8" }],
    state_mutability: "view",
  },
  {
    name: "get_collateral_requirement",
    type: "function",
    inputs: [{ name: "address", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u16" }],
    state_mutability: "view",
  },
  {
    name: "has_reputation",
    type: "function",
    inputs: [{ name: "address", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
  {
    name: "submit_reputation",
    type: "function",
    inputs: [
      { name: "proof", type: "(core::integer::u16, core::felt252, core::felt252, core::felt252)" },
      { name: "starknet_address", type: "core::starknet::contract_address::ContractAddress" },
    ],
    outputs: [],
    state_mutability: "external",
  },
];

export const SBT_ABI = [
  {
    name: "mint_credit_sbt",
    type: "function",
    inputs: [
      { name: "to", type: "core::starknet::contract_address::ContractAddress" },
      { name: "score", type: "core::integer::u16" },
      { name: "tier", type: "core::integer::u8" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "has_sbt",
    type: "function",
    inputs: [{ name: "owner", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::bool" }],
    state_mutability: "view",
  },
  {
    name: "total_supply",
    type: "function",
    inputs: [],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
];

export const TIER_MAP = { 0: "Unrated", 1: "Bronze", 2: "Silver", 3: "Gold", 4: "Diamond" };
export const COLLATERAL_MAP = { 0: 15000, 1: 14000, 2: 12500, 3: 11000, 4: 10000 };
