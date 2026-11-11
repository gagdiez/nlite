import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import yargs from 'yargs';
import { Account, JsonRpcProvider, KeyPair, actions, baseEncode, DeterministicStateInit, UniversalStateInit, encodeTransaction, createTransaction } from 'near-api-js';
import { deployGlobalCommand, useGlobalCommand, viewGlobalCommand } from '../dist/src/commands/contract/global.js';
import { addGasKeyCommand, fundGasKeyCommand, withdrawGasKeyCommand, gasKeyNoncesCommand } from '../dist/src/commands/keys/gas.js';
import { deriveStateAccountCommand, createStateAccountCommand } from '../dist/src/commands/account/state-init.js';
import listKeys from '../dist/src/commands/keys/list.js';
import deleteKey from '../dist/src/commands/keys/delete.js';
import { storeCredentials } from '../dist/src/utils.js';

async function run(command, args) {
  return yargs([]).strict().exitProcess(false).showHelpOnFail(false)
    .fail((message, error) => { throw error ?? new Error(message); }).command(command).parseAsync(args);
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-protocol-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => dir);
  const output = [];
  t.mock.method(console, 'log', message => output.push(message));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const key = KeyPair.fromRandom('ed25519');
  storeCredentials('owner.testnet', 'testnet', key);
  return { dir, output, key };
}

test('new signing commands use both credential sources and produce serializable protocol actions', async t => {
  const { key } = fixture(t);
  const publicKey = key.getPublicKey().toString();
  const explicit = KeyPair.fromRandom('ed25519');
  let expectedKey = key;
  const transactions = [];
  t.mock.method(Account.prototype, 'signAndSendTransaction', async function (transaction) {
    assert.equal((await this.getSigner().getPublicKey()).toString(), expectedKey.getPublicKey().toString());
    const encoded = encodeTransaction(createTransaction(this.accountId, key.getPublicKey(), transaction.receiverId, 1n, transaction.actions, new Uint8Array(32)));
    assert(encoded.length > 0);
    transactions.push(transaction);
    return { status: { SuccessValue: '' } };
  });
  const hash = baseEncode(new Uint8Array(32).fill(34));
  const cases = [
    [deployGlobalCommand, ['deploy-global-contract', 'owner.testnet', 'test/res/guest_book.wasm']],
    [deployGlobalCommand, ['deploy-global-contract', 'owner.testnet', 'test/res/guest_book.wasm', '--mode', 'accountId']],
    [useGlobalCommand, ['use-global-contract', 'owner.testnet', '--codeHash', hash, '--force']],
    [useGlobalCommand, ['use-global-contract', 'owner.testnet', '--globalAccountId', 'publisher.testnet', '--force']],
    [addGasKeyCommand, ['add-gas-key', 'owner.testnet', publicKey, '--numNonces', '2']],
    [addGasKeyCommand, ['add-gas-key', 'owner.testnet', publicKey, '--contractId', 'contract.testnet', '--methodNames', 'first', 'second']],
    [fundGasKeyCommand, ['fund-gas-key', 'receiver.testnet', publicKey, '0.5', '--useAccount', 'owner.testnet']],
    [withdrawGasKeyCommand, ['withdraw-gas-key', 'owner.testnet', publicKey, '0.25']]
  ];
  for (const [command, args] of cases) {
    expectedKey = key;
    await run(command, args);
    const local = transactions.at(-1);
    expectedKey = explicit;
    await run(command, [...args, '--privateKey', explicit.toString()]);
    assert.deepEqual(transactions.at(-1), local);
  }
  assert.deepEqual(transactions[4].actions, [actions.useGlobalContract({ codeHash: hash })]);
  assert.deepEqual(transactions[8].actions, [actions.addFullAccessGasKey(key.getPublicKey(), 2)]);
  assert.equal(transactions[12].receiverId, 'receiver.testnet');
  assert.equal(transactions[12].actions[0].transferToGasKey.deposit, 5n * 10n ** 23n);
  assert.equal(transactions[14].actions[0].withdrawFromGasKey.amount, 25n * 10n ** 22n);
});

test('state-init derivation and creation use the same bytes and receiver for each scheme', async t => {
  const { dir, output, key } = fixture(t);
  const file = path.join(dir, 'state.json');
  const code = { accountId: 'publisher.testnet' };
  const data = [[Buffer.from('key'), Buffer.from('value')]];
  const submit = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({ status: { SuccessValue: '' } }));
  for (const scheme of ['deterministic', 'universal']) {
    const accessKeys = scheme === 'universal' ? [key.getPublicKey().toString()] : undefined;
    fs.writeFileSync(file, JSON.stringify({ code, data: { key: 'value' }, accessKeys }));
    const state = scheme === 'universal' ? new UniversalStateInit({ code, data, accessKeys }) : new DeterministicStateInit({ code, data });
    const accountId = state.deriveAccountId();
    const args = [file, '--scheme', scheme, '--dataEncoding', 'utf8'];
    await run(deriveStateAccountCommand, ['derive-state-account', ...args]);
    assert.equal(output.at(-1), accountId);
    await run(createStateAccountCommand, ['create-state-account', ...args, '--useAccount', 'owner.testnet', '--storageDeposit', '0.1']);
    const tx = submit.mock.calls.at(-1).arguments[0];
    assert.equal(tx.receiverId, accountId);
    assert.deepEqual(tx.actions, [scheme === 'universal' ? actions.universalStateInit(state.encode(), 10n ** 23n) : actions.deterministicStateInit(state, 10n ** 23n)]);
    await run(createStateAccountCommand, ['create-state-account', ...args, '--useAccount', 'owner.testnet', '--storageDeposit', '0.1', '--privateKey', key.toString()]);
    assert.deepEqual(submit.mock.calls.at(-1).arguments[0], tx);
  }
});

test('base64 state storage derives the same ID as UTF-8 storage and malformed data fails offline', async t => {
  const { dir, output, key } = fixture(t);
  const file = path.join(dir, 'state.json');
  const code = { accountId: 'publisher.testnet' };
  for (const scheme of ['deterministic', 'universal']) {
    const accessKeys = scheme === 'universal' ? [key.getPublicKey().toString()] : undefined;
    fs.writeFileSync(file, JSON.stringify({ code, accessKeys, data: { a2V5: 'dmFsdWU=' } }));
    await run(deriveStateAccountCommand, ['derive-state-account', file, '--scheme', scheme]);
    const base64Id = output.at(-1);
    fs.writeFileSync(file, JSON.stringify({ code, accessKeys, data: { key: 'value' } }));
    await run(deriveStateAccountCommand, ['derive-state-account', file, '--scheme', scheme, '--dataEncoding', 'utf8']);
    assert.equal(output.at(-1), base64Id);
  }
  fs.writeFileSync(file, JSON.stringify({ code, data: { a2V5: '!!!' } }));
  await assert.rejects(run(deriveStateAccountCommand, ['derive-state-account', file]), /valid base64/);
});

test('protocol queries preserve identifier, key and pagination cursor', async t => {
  const { key } = fixture(t);
  const identifier = { accountId: 'publisher.testnet' };
  const global = t.mock.method(JsonRpcProvider.prototype, 'viewGlobalContractCode', async options => { assert.deepEqual(options, { identifier }); return {}; });
  await run(viewGlobalCommand, ['view-global-contract', '--globalAccountId', identifier.accountId]);
  assert.equal(global.mock.callCount(), 1);
  t.mock.method(JsonRpcProvider.prototype, 'viewGasKeyNonces', async options => {
    assert.deepEqual(options, { accountId: 'owner.testnet', publicKey: key.getPublicKey().toString() });
    return { nonces: [1n, 2n] };
  });
  await run(gasKeyNoncesCommand, ['gas-key-nonces', 'owner.testnet', key.getPublicKey().toString()]);
  t.mock.method(JsonRpcProvider.prototype, 'viewAccessKeyList', async options => {
    assert.deepEqual(options, { accountId: 'owner.testnet', afterKey: 'opaque-hashed-key-handle', limit: 10 });
    return { keys: [], last_key: null };
  });
  await run(listKeys, ['list-keys', 'owner.testnet', '--afterKey', 'opaque-hashed-key-handle', '--limit', '10']);
});

test('list-keys requests a bounded first page by default', async t => {
  fixture(t);
  const listing = t.mock.method(JsonRpcProvider.prototype, 'viewAccessKeyList', async () => ({ keys: [] }));
  await run(listKeys, ['list-keys', 'owner.testnet']);
  assert.deepEqual(listing.mock.calls[0].arguments[0], { accountId: 'owner.testnet', afterKey: undefined, limit: 100 });
});

test('deleting an ML-DSA key finds its hashed handle on a later key-list page', async t => {
  const { key } = fixture(t);
  const target = KeyPair.fromRandom('ml-dsa-65').getPublicKey();
  const listing = t.mock.method(JsonRpcProvider.prototype, 'viewAccessKeyList', async options => {
    assert.equal(options.accountId, 'owner.testnet');
    assert.equal(options.limit, 100);
    return options.afterKey
      ? { keys: [{ public_key: target.toHandle(), access_key: { permission: 'FullAccess' } }] }
      : { keys: [{ public_key: key.getPublicKey().toString(), access_key: { permission: { GasKeyFullAccess: { balance: '0', num_nonces: 1 } } } }], last_key: key.getPublicKey().toString() };
  });
  const submit = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({}));
  await run(deleteKey, ['delete-key', 'owner.testnet', target.toString(), '--force']);
  assert.equal(listing.mock.callCount(), 2);
  assert.equal(listing.mock.calls[1].arguments[0].afterKey, key.getPublicKey().toString());
  assert.equal(submit.mock.callCount(), 1);
  assert.deepEqual(submit.mock.calls[0].arguments[0].actions, [actions.deleteKey(target)]);
});

test('protocol command relationships and key prefixes fail in yargs before execution', async () => {
  const key = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  for (const command of [useGlobalCommand, viewGlobalCommand]) {
    const prefix = command === useGlobalCommand ? ['use-global-contract', 'owner.testnet'] : ['view-global-contract'];
    await assert.rejects(run(command, prefix), /Provide --codeHash or --globalAccountId/);
    await assert.rejects(run(command, [...prefix, '--codeHash', 'hash', '--globalAccountId', 'publisher.testnet']), /mutually exclusive/);
  }
  await assert.rejects(run(addGasKeyCommand, ['add-gas-key', 'owner.testnet', key, '--methodNames', 'method']), /Implications failed/);
  for (const command of [addGasKeyCommand, gasKeyNoncesCommand]) {
    const name = command.command.split(' ')[0];
    await assert.rejects(run(command, [name, 'owner.testnet', key.split(':')[1]]), /must include its curve prefix/);
  }
});

test('delegated calls sign the exact arguments and relay the transported Borsh payload', async t => {
  const { signMetaCallCommand, relayMetaCommand } = await import('../dist/src/commands/transactions/meta.js');
  const { decodeSignedDelegate, encodeSignedDelegate, encodeDelegateAction } = await import('near-api-js');
  const { key, output } = fixture(t);
  t.mock.method(JsonRpcProvider.prototype, 'viewAccessKey', async () => ({ nonce: 123n, permission: 'FullAccess' }));
  t.mock.method(JsonRpcProvider.prototype, 'viewBlock', async () => ({ header: { height: 1000 } }));
  await run(signMetaCallCommand, ['sign-meta-call', 'owner.testnet', 'contract.testnet', 'method', '/wA=', '--base64', '--depositYocto', '1']);
  const bytes = Buffer.from(output.at(-1), 'base64');
  const decoded = decodeSignedDelegate(bytes);
  assert.deepEqual(Buffer.from(encodeSignedDelegate(decoded)), bytes);
  assert.equal(decoded.delegateAction.publicKey.toString(), key.getPublicKey().toString());
  assert.equal(decoded.delegateAction.nonce, 124n);
  assert.equal(decoded.delegateAction.maxBlockHeight, 1200n);
  assert.deepEqual(Buffer.from(decoded.delegateAction.actions[0].functionCall.args), Buffer.from([255, 0]));
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(encodeDelegateAction(decoded.delegateAction)).digest();
  assert(key.verify(hash, Uint8Array.from(decoded.signature.ed25519Signature.data)));
  await run(signMetaCallCommand, ['sign-meta-call', 'owner.testnet', 'contract.testnet', 'method', '/wA=', '--base64', '--depositYocto', '1', '--privateKey', key.toString()]);
  assert.equal(output.at(-1), bytes.toString('base64'));
  const submit = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({}));
  await run(relayMetaCommand, ['relay-meta-transaction', 'owner.testnet', bytes.toString('base64')]);
  const tx = submit.mock.calls[0].arguments[0];
  assert.equal(tx.receiverId, 'owner.testnet');
  assert.deepEqual(Buffer.from(encodeSignedDelegate(tx.actions[0].signedDelegate)), bytes);
  await run(relayMetaCommand, ['relay-meta-transaction', 'owner.testnet', bytes.toString('base64'), '--privateKey', key.toString()]);
  assert.deepEqual(submit.mock.calls.at(-1).arguments[0], tx);
  await assert.rejects(run(relayMetaCommand, ['relay-meta-transaction', 'owner.testnet', Buffer.concat([bytes, Buffer.from([9])]).toString('base64')]), /canonical Borsh/);
  assert.equal(submit.mock.callCount(), 2);
});

test('key generation supports each protocol curve and saves usable universal credentials', async t => {
  const { default: generate } = await import('../dist/src/commands/credentials/generate.js');
  const { dir, output } = fixture(t);
  for (const curve of ['ed25519', 'secp256k1', 'ml-dsa-65']) {
    output.length = 0;
    await run(generate, ['generate-key', '--curve', curve, '--saveUniversal']);
    const accountId = output.find(line => line.startsWith('Universal account: ')).slice('Universal account: '.length);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, '.near-credentials', 'testnet', `${accountId}.json`), 'utf8'));
    const pair = KeyPair.fromString(stored.private_key);
    assert(pair.getPublicKey().toString().startsWith(`${curve}:`));
    assert.equal(accountId, new UniversalStateInit({ accessKeys: [pair.getPublicKey()] }).deriveAccountId());
    const implicit = output.find(line => line.startsWith('Implicit account: '));
    if (curve !== 'ed25519') assert.equal(implicit, undefined);
    else assert.match(implicit, /[0-9a-f]{64}$/);
  }
  for (const curve of ['secp256k1', 'ml-dsa-65']) {
    await assert.rejects(run(generate, ['generate-key', '--curve', curve, '--saveImplicit']), /requires --curve ed25519/);
  }
});
