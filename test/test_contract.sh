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

RESULT=$(./bin/nlite.js view $contract getMessages '{}' --quiet)
TEXT=$RESULT
EXPECTED='TEST'
if [[ ! $TEXT =~ .*$EXPECTED.* ]]; then
    echo FAILURE Unexpected output from near call: $RESULT
    exit 1
fi

# base64-encoded '{"text":"TEST"}'
./bin/nlite.js call $contract addMessage --base64 'eyJ0ZXh0IjoiVEVTVCJ9' --accountId $testaccount > /dev/null

RESULT=$(./bin/nlite.js view $contract getMessages '{}' --quiet)
echo "$RESULT" | node --input-type=module -e '
import assert from "node:assert/strict";
import fs from "node:fs";
const expected = { premium: false, sender: process.argv[1], text: "TEST" };
assert.deepEqual(JSON.parse(fs.readFileSync(0, "utf8")), [expected, expected]);
' "$testaccount"
