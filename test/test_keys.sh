#!/bin/bash
set -e

timestamp=$(date +%s)
testaccount=test-keys-${timestamp}.testnet

# Can create a pre-funded account
./bin/nlite.js create-account $testaccount --useFaucet

# Can create an account with a given public key
./bin/nlite.js add-key $testaccount "ed25519:78MziB9aTNsu19MHHVrfWy762S5mAqXgCB6Vgvrv9uGV"

# Add a function call key
./bin/nlite.js add-key $testaccount "ed25519:DReZmNmnGhpsYcCFFeYgPsJ9YCm9xH16GGujCPe3KQEq" --contractId multichain-testnet-2.testnet --allowance 1

RESULT=$(./bin/nlite.js list-keys $testaccount)
EXPECTED=".*78MziB9aTNsu19MHHVrfWy762S5mAqXgCB6Vgvrv9uGV.*"
if [[ ! "$RESULT" =~ $EXPECTED ]]; then
    echo FAILURE Unexpected output from near list-keys
    echo Got: $RESULT
    echo Expected: $EXPECTED
    exit 1
fi

# Error on adding a key that already exists
RESULT=$(./bin/nlite.js add-key $testaccount "ed25519:78MziB9aTNsu19MHHVrfWy762S5mAqXgCB6Vgvrv9uGV")
EXPECTED=".*already exists in account.*"
if [[ ! "$RESULT" =~ $EXPECTED ]]; then
    echo FAILURE Unexpected output from near add-key
    echo Got: $RESULT
    echo Expected: $EXPECTED
    exit 1
fi

printf 'y\n' | ./bin/nlite.js delete-key $testaccount "ed25519:78MziB9aTNsu19MHHVrfWy762S5mAqXgCB6Vgvrv9uGV"

./bin/nlite.js delete $testaccount influencer.testnet --force
