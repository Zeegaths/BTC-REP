#!/bin/bash
# Deploy BTCRep contracts to Starknet
# Usage: ./deploy.sh [network]
# Networks: sepolia (default), mainnet

set -e

NETWORK=${1:-sepolia}
echo "🚀 Deploying BTCRep to Starknet $NETWORK..."

# Build contracts
echo "📦 Building contracts..."
cd ../contracts
scarb build

# Check if account is configured
if [ -z "$STARKNET_ACCOUNT" ]; then
    echo "⚠️  STARKNET_ACCOUNT not set. Using default account."
    echo "   Set up with: sncast account create --name btcrep-deployer"
fi

# Declare contracts
echo ""
echo "📝 Declaring ReputationOracle..."
ORACLE_CLASS=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    declare --contract-name ReputationOracle 2>&1 | grep "class_hash" | awk '{print $2}')
echo "   Class hash: $ORACLE_CLASS"

echo "📝 Declaring BTCRepSBT..."
SBT_CLASS=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    declare --contract-name BTCRepSBT 2>&1 | grep "class_hash" | awk '{print $2}')
echo "   Class hash: $SBT_CLASS"

echo "📝 Declaring LendingAdapter..."
ADAPTER_CLASS=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    declare --contract-name LendingAdapter 2>&1 | grep "class_hash" | awk '{print $2}')
echo "   Class hash: $ADAPTER_CLASS"

# Deploy contracts
echo ""
echo "🏗  Deploying ReputationOracle..."
OWNER=$STARKNET_ACCOUNT
PROVER=$STARKNET_ACCOUNT  # For testnet, use same account as prover

ORACLE_ADDR=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    deploy --class-hash $ORACLE_CLASS --constructor-calldata $OWNER $PROVER 2>&1 | grep "contract_address" | awk '{print $2}')
echo "   Address: $ORACLE_ADDR"

echo "🏗  Deploying BTCRepSBT..."
SBT_ADDR=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    deploy --class-hash $SBT_CLASS --constructor-calldata $OWNER $ORACLE_ADDR 2>&1 | grep "contract_address" | awk '{print $2}')
echo "   Address: $SBT_ADDR"

echo "🏗  Deploying LendingAdapter..."
ADAPTER_ADDR=$(sncast --account $STARKNET_ACCOUNT --url "https://starknet-$NETWORK.g.alchemy.com/v2/demo" \
    deploy --class-hash $ADAPTER_CLASS --constructor-calldata $OWNER $ORACLE_ADDR $SBT_ADDR 2>&1 | grep "contract_address" | awk '{print $2}')
echo "   Address: $ADAPTER_ADDR"

# Output summary
echo ""
echo "============================================"
echo "✅ BTCRep deployed to Starknet $NETWORK!"
echo "============================================"
echo ""
echo "Contracts:"
echo "  ReputationOracle: $ORACLE_ADDR"
echo "  BTCRepSBT:        $SBT_ADDR"
echo "  LendingAdapter:   $ADAPTER_ADDR"
echo ""
echo "Explorer:"
echo "  https://sepolia.starkscan.co/contract/$ORACLE_ADDR"
echo "  https://sepolia.starkscan.co/contract/$SBT_ADDR"
echo "  https://sepolia.starkscan.co/contract/$ADAPTER_ADDR"
echo ""
echo "Next steps:"
echo "  1. Update frontend/src/config.js with contract addresses"
echo "  2. Start backend: cd backend && cargo run"
echo "  3. Start frontend: cd frontend && npm run dev"