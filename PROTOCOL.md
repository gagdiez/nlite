# Protocol coverage

Uses published **near-api-js 7.5.1** and wire formats from released nearcore
**2.14.0**, protocol **88**. The CLI integration suite runs against local Sandbox
2.14.0; it does not require a linked SDK checkout or public-network accounts.

The API belongs in `near-api-js`; these commands exercise that API. No near-kit
client or near-cli interactive workflows were imported.

| Capability | Published SDK API used | nlite entry points |
| --- | --- | --- |
| Global contracts (NEP-591) | Deploy, attach, query, and global references in `Account.getState()` | `deploy --global`, `use-global-contract`, `view-code` |
| Gas keys (NEP-611) | Add/fund/withdraw, automatic V1 signing and nonce lanes | `add-key --gasKey`, `fund-gas-key`, `withdraw-gas-key`; existing signing commands also accept gas keys |
| Deterministic accounts (NEP-616, `0s…`) | `DeterministicStateInit`, `Account.createDeterministicAccount()` | `create-account --stateInit` |
| Universal accounts (`0u…`) | `UniversalStateInit`, `Account.createUniversalAccount()`, self-bootstrap nonce handling | `create-account --stateInit --scheme universal` |
| Ed25519, secp256k1, ML-DSA-65 keys | Crypto, signing, canonical state init and `PublicKey.toHandle()` | `generate-key --curve …`; `--saveUniversal` stores key-only universal credentials |
| Access-key pagination | `viewAccessKeyList({ afterKey, limit })`, `last_key` response | `list-keys --limit … --afterKey …` |
| Staking | Implemented | Omitted as previously requested |
| Delegate V2 (tag 14) | Unavailable: removed by protocol 87 | None |

`DelegateV2` remains reserved in the Borsh action enum so tag 15 stays correct.
Do not infer availability from nearcore having a historical action struct.
Contract host functions (yield/resume, cryptographic verification, etc.) execute
inside WASM; they are not additional client transaction actions.

Standalone address derivation, transaction signing/relaying, and nonce-lane
inspection remain SDK workflows. Account creation derives the destination
internally and prints it; there is no separate derive or initialize command.

## Global contracts

```sh
nlite deploy publisher.testnet contract.wasm --global codeHash
nlite deploy publisher.testnet contract.wasm --global accountId
nlite view-code --globalAccountId publisher.testnet
nlite view-code consumer.testnet
nlite use-global-contract consumer.testnet --globalAccountId publisher.testnet
# Or use --codeHash with the immutable base58 hash returned by RPC.
```

Hash deployment is immutable. Account-ID deployment lets the publisher update
code for every consumer. Global publication does not replace the publisher's
own deployed code and cannot be combined with initialization options.
`use-global-contract` prompts before replacing a contract;
`--force` bypasses that prompt. Global code distribution can lag publication.

## Gas keys

```sh
nlite add-key owner.testnet ed25519:PUBLIC_KEY --gasKey --numNonces 2
nlite fund-gas-key owner.testnet ed25519:PUBLIC_KEY 0.5 --useAccount payer.testnet
nlite send-near owner.testnet receiver.testnet 0.1 --privateKey ed25519:GAS_PRIVATE_KEY
nlite withdraw-gas-key owner.testnet ed25519:PUBLIC_KEY 0.1
```

Add `--contractId contract.testnet --methodNames methodOne methodTwo` for a
function-call gas key. `--numNonces` requires `--gasKey`, and gas keys do not accept
`--allowance`. A gas key starts unfunded. The SDK selects nonce lanes;
ordinary transaction deposits still come from the account balance. Gas-key
withdrawals return funds to the owning account. Full-access gas keys count as
full-access keys in deletion confirmations, including across paginated listings. ML-DSA deletion matches the full public key
to its hashed on-trie handle.

## State-derived accounts

Choose `ed25519`, `secp256k1`, or `ml-dsa-65` with `generate-key --curve`.
Adding `--saveUniversal` saves credentials under the key-only universal ID. This
stores a key; it does not create or fund the account. `--saveImplicit` is limited to Ed25519: the published SDK's
`keyToImplicitAddress()` helper does not support Ethereum implicit-ID derivation.

Both schemes accept a JSON file. Default storage encoding is base64. For readable
fixtures, pass `--dataEncoding utf8`:

```json
{
  "code": { "accountId": "publisher.testnet" },
  "data": { "key": "value" }
}
```

`code` can instead be `{ "codeHash": "BASE58_HASH" }`. Deterministic accounts
require code and have no protocol access keys; authorization belongs in their
contract state. Universal accounts can omit code and add `accessKeys` containing
prefixed public keys. Storage and key handles are canonically ordered by the SDK.

```sh
nlite create-account --stateInit state.json --dataEncoding utf8 --useAccount payer.testnet --storageDeposit 1
nlite create-account --stateInit universal.json --scheme universal --useAccount payer.testnet --storageDeposit 1
```

**The state-init deposit pays only storage staking. Excess is refunded; it does
not become spending balance.** Use `send-near` to fund the derived ID separately.
Reapplying state init preserves existing state; it does not reset the account.

`--stateInit` requires `--useAccount`; it cannot be combined with a named account
ID, `--useFaucet`, `--publicKey`, `--seedPhrase`, or `--initialBalance`. Put the
code, storage and access keys in the JSON file. `--scheme`, `--dataEncoding` and
`--storageDeposit` only apply to state-derived creation.

A universal account may also receive funds before initialization. Then use its
own derived ID as `--useAccount` with a private key committed in `accessKeys`.
The SDK reads `bootstrap_nonce` from `view_account`, uses exactly that nonce plus
one for each signing attempt, and resumes ordinary access-key nonces afterward.
`state` exposes initialization status and the bootstrap nonce through RPC.

All signing commands accept `--privateKey` or use existing local credentials.
All keys require their curve prefix. Amounts and gas limits are left to the SDK
and protocol; command option relationships are checked by yargs.

## Access-key pagination

`nlite list-keys owner.testnet` returns up to 100 keys. Pass `--limit` to choose a
page size and `--afterKey` with the returned `last_key` to continue. The cursor is
opaque; do not remove or change its prefix. Key deletion follows the pages before
checking whether the selected key is the last full-access key.

## Verification

- SDK unit tests compare canonical encodings and account IDs against upstream
  vectors, including ML-DSA handle domain separation.
- SDK integration tests run Sandbox 2.14.0: global publication, deterministic and
  universal contract storage, universal signing on all three curves, prefunded
  self-bootstrap.
- CLI tests use real SDK action construction, Borsh serialization and signatures
  with mocked submission; they verify argument relationships and both credential
  sources. `npm run test:unit` runs these without public RPC or faucet calls.
- `npm run test:protocol` builds nlite and invokes its actual executable against
  Sandbox 2.14.0, checking gas-key spending, state-init storage, prefunded ML-DSA
  self-bootstrap and contract calls through global code. Its `near-sandbox`
  dev dependency is installed with this project; the SDK comes from npm.
- The public-network bash suite was not run for this work. No faucet requests or
  public-network transactions were used for verification.

## Sources

- [nearcore 2.14.0 actions](https://github.com/near/nearcore/blob/2.14.0/core/primitives/src/action/mod.rs)
- [Protocol feature activation](https://github.com/near/nearcore/blob/2.14.0/core/primitives-core/src/version.rs)
- [Released RPC specification](https://github.com/near/nearcore/blob/2.14.0/chain/jsonrpc/openapi/openapi.json)
- [State-init storage deposit settlement](https://github.com/near/nearcore/blob/2.14.0/runtime/runtime/src/deterministic_account_id.rs)
- [Universal initialization and access-key installation](https://github.com/near/nearcore/blob/2.14.0/runtime/runtime/src/universal_account_id.rs)
- [ML-DSA public-key hash domain](https://github.com/near/nearcore/blob/2.14.0/core/crypto/src/hash_domain.rs)
- [near-cli-rs dependencies](https://github.com/near/near-cli-rs/blob/main/Cargo.toml): uses near-primitives and near-jsonrpc-client directly, rather than near-api-rs or near-kit.
- [Rust near-kit](https://github.com/r-near/near-kit-rs) and [TypeScript near-kit](https://github.com/r-near/near-kit) were comparison points; released nearcore defines the wire format and activation rules.
