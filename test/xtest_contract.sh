#!/bin/bash
set -e

timestamp=$(date +%s)
contract=test-contract-$timestamp-c.testnet
testaccount=test-contract-$timestamp-t.testnet

echo Creating account
./bin/nlite.js create $contract --useFaucet
./bin/nlite.js create $testaccount --useFaucet

echo Deploying contract
./bin/nlite.js deploy $contract ./test/res/guest_book.wasm

echo Calling functions
./bin/nlite.js call $contract addMessage '{"text":"TEST"}' --accountId $testaccount > /dev/null

RESULT=$(./bin/nlite.js view $contract getMessages '{}')
TEXT=$RESULT
EXPECTED='TEST'
if [[ ! $TEXT =~ .*$EXPECTED.* ]]; then
    echo FAILURE Unexpected output from near call: $RESULT
    exit 1
fi

# base64-encoded '{"message":"BASE64ROCKS"}'
./bin/nlite.js call $contract addMessage --base64 'eyJ0ZXh0IjoiVEVTVCJ9' --accountId $testaccount > /dev/null

RESULT=$(./bin/nlite.js view $contract getMessages '{}')
# TODO: Refactor asserts
TEXT=$RESULT
echo $RESULT
EXPECTED="[ { premium: false, sender: 'test.near', text: 'TEST' }, { premium: false, sender: 'test.near', text: 'TEST' } ]"
if [[ ! $TEXT =~ .*$EXPECTED.* ]]; then
    echo FAILURE Unexpected output from near call: $RESULT
    exit 1
fi
