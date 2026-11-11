import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import yargs from 'yargs';
import { Account, JsonRpcProvider, KeyPair, actions, baseEncode, DeterministicStateInit, UniversalStateInit, encodeTransaction, createTransaction } from 'near-api-js';
import deploy from '../dist/src/commands/contract/deploy.js';
import { useGlobalCommand } from '../dist/src/commands/contract/global.js';
import viewCode from '../dist/src/commands/contract/code.js';
import addKey from '../dist/src/commands/keys/add.js';
import { fundGasKeyCommand, withdrawGasKeyCommand } from '../dist/src/commands/keys/gas.js';
import create from '../dist/src/commands/account/create.js';
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

test('global deployment and gas-key operations use both credential sources and serializable SDK actions', async t => {
  const { key } = fixture(t);
  const publicKey = key.getPublicKey().toString();
  const explicit = KeyPair.fromRandom('ed25519');
  let expectedKey = key;
  const transactions = [];
  t.mock.method(Account.prototype, 'signAndSendTransaction', async function (transaction) {
    assert.equal((await this.getSigner().getPublicKey()).toString(), expectedKey.getPublicKey().toString());
    assert(encodeTransaction(createTransaction(this.accountId, key.getPublicKey(), transaction.receiverId, 1n, transaction.actions, new Uint8Array(32))).length > 0);
    transactions.push(transaction);
    return { status: { SuccessValue: '' } };
  });
  const hash = baseEncode(new Uint8Array(32).fill(34));
  const cases = [
    [deploy, ['deploy', 'owner.testnet', 'test/res/guest_book.wasm', '--global', 'codeHash']],
    [deploy, ['deploy', 'owner.testnet', 'test/res/guest_book.wasm', '--global', 'accountId']],
    [useGlobalCommand, ['use-global-contract', 'owner.testnet', '--codeHash', hash, '--force']],
    [useGlobalCommand, ['use-global-contract', 'owner.testnet', '--globalAccountId', 'publisher.testnet', '--force']],
    [addKey, ['add-key', 'owner.testnet', publicKey, '--gasKey', '--numNonces', '2']],
    [addKey, ['add-key', 'owner.testnet', publicKey, '--gasKey', '--contractId', 'contract.testnet', '--methodNames', 'first', 'second']],
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
  assert.deepEqual(transactions[0].actions, [actions.deployGlobalContract(fs.readFileSync('test/res/guest_book.wasm'), 'codeHash')]);
  assert.deepEqual(transactions[2].actions, [actions.deployGlobalContract(fs.readFileSync('test/res/guest_book.wasm'), 'accountId')]);
  assert.deepEqual(transactions[4].actions, [actions.useGlobalContract({ codeHash: hash })]);
  assert.deepEqual(transactions[8].actions, [actions.addFullAccessGasKey(key.getPublicKey(), 2)]);
  assert.deepEqual(transactions[10].actions, [actions.addFunctionCallGasKey(key.getPublicKey(), 'contract.testnet', ['first', 'second'], 1)]);
  assert.equal(transactions[12].receiverId, 'receiver.testnet');
  assert.equal(transactions[12].actions[0].transferToGasKey.deposit, 5n * 10n ** 23n);
  assert.equal(transactions[14].actions[0].withdrawFromGasKey.amount, 25n * 10n ** 22n);
});

test('local deployment preserves its default initialization gas and deposit', async t => {
  fixture(t);
  t.mock.method(Account.prototype, 'getState', async () => ({ codeHash: '11111111111111111111111111111111' }));
  const submit = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({}));
  await run(deploy, ['deploy', 'owner.testnet', 'test/res/guest_book.wasm', '--initFunction', 'new', '--initArgs', '{}']);
  assert.deepEqual(submit.mock.calls[0].arguments[0].actions, [
    actions.deployContract(fs.readFileSync('test/res/guest_book.wasm')),
    actions.functionCall('new', {}, 30000000000000n, 0n),
  ]);
});

test('create-account derives state-init IDs internally and prints the destination for both schemes', async t => {
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
    const args = ['create-account', '--stateInit', file, '--scheme', scheme, '--dataEncoding', 'utf8', '--useAccount', 'owner.testnet', '--storageDeposit', '0.1'];
    await run(create, args);
    assert(output.includes(`Creating state-derived account ${accountId}`));
    const tx = submit.mock.calls.at(-1).arguments[0];
    assert.equal(tx.receiverId, accountId);
    assert.deepEqual(tx.actions, [scheme === 'universal' ? actions.universalStateInit(state.encode(), 10n ** 23n) : actions.deterministicStateInit(state, 10n ** 23n)]);
    await run(create, [...args, '--privateKey', key.toString()]);
    assert.deepEqual(submit.mock.calls.at(-1).arguments[0], tx);
  }
});

test('state creation uses equivalent base64 and UTF-8 data and rejects malformed input before submission', async t => {
  const { dir, key } = fixture(t);
  const file = path.join(dir, 'state.json');
  const code = { accountId: 'publisher.testnet' };
  const submit = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({}));
  for (const scheme of ['deterministic', 'universal']) {
    const accessKeys = scheme === 'universal' ? [key.getPublicKey().toString()] : undefined;
    const args = ['create-account', '--stateInit', file, '--scheme', scheme, '--useAccount', 'owner.testnet'];
    fs.writeFileSync(file, JSON.stringify({ code, accessKeys, data: { a2V5: 'dmFsdWU=' } }));
    await run(create, args);
    const base64Transaction = submit.mock.calls.at(-1).arguments[0];
    fs.writeFileSync(file, JSON.stringify({ code, accessKeys, data: { key: 'value' } }));
    await run(create, [...args, '--dataEncoding', 'utf8']);
    assert.deepEqual(submit.mock.calls.at(-1).arguments[0], base64Transaction);
  }
  fs.writeFileSync(file, JSON.stringify({ code, data: { a2V5: '!!!' } }));
  await assert.rejects(run(create, ['create-account', '--stateInit', file, '--useAccount', 'owner.testnet']), /valid base64/);
  assert.equal(submit.mock.callCount(), 4);
});

test('view-code selects deployed account code or global code by account ID or hash', async t => {
  const { output } = fixture(t);
  const local = t.mock.method(JsonRpcProvider.prototype, 'viewContractCode', async options => {
    assert.deepEqual(options, { contractId: 'consumer.testnet' });
    return { hash: 'local-hash', code: [1] };
  });
  const global = t.mock.method(JsonRpcProvider.prototype, 'viewGlobalContractCode', async options => ({ hash: 'global-hash', identifier: options.identifier }));
  await run(viewCode, ['view-code', 'consumer.testnet']);
  assert.equal(local.mock.callCount(), 1);
  assert.equal(global.mock.callCount(), 0);
  assert.equal(JSON.parse(output.at(-1)).hash, 'local-hash');
  await run(viewCode, ['view-code', '--globalAccountId', 'publisher.testnet']);
  assert.deepEqual(global.mock.calls[0].arguments[0], { identifier: { accountId: 'publisher.testnet' } });
  await run(viewCode, ['view-code', '--codeHash', 'hash']);
  assert.deepEqual(global.mock.calls[1].arguments[0], { identifier: { codeHash: 'hash' } });
});

test('list-keys preserves the opaque cursor and requests 100 keys by default', async t => {
  fixture(t);
  const listing = t.mock.method(JsonRpcProvider.prototype, 'viewAccessKeyList', async () => ({ keys: [] }));
  await run(listKeys, ['list-keys', 'owner.testnet']);
  assert.deepEqual(listing.mock.calls[0].arguments[0], { accountId: 'owner.testnet', afterKey: undefined, limit: 100 });
  await run(listKeys, ['list-keys', 'owner.testnet', '--limit', '10', '--afterKey', 'opaque-hashed-key-handle']);
  assert.deepEqual(listing.mock.calls[1].arguments[0], { accountId: 'owner.testnet', afterKey: 'opaque-hashed-key-handle', limit: 10 });
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

test('consolidated command relationships fail in yargs before execution', async () => {
  const key = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  await assert.rejects(run(useGlobalCommand, ['use-global-contract', 'owner.testnet']), /Provide --codeHash or --globalAccountId/);
  await assert.rejects(run(viewCode, ['view-code']), /Provide an accountId/);
  for (const args of [
    ['view-code', 'consumer.testnet', '--codeHash', 'hash'],
    ['view-code', 'consumer.testnet', '--globalAccountId', 'publisher.testnet'],
    ['view-code', '--codeHash', 'hash', '--globalAccountId', 'publisher.testnet'],
  ]) await assert.rejects(run(viewCode, args), /mutually exclusive/);
  const add = ['add-key', 'owner.testnet', key];
  await assert.rejects(run(addKey, [...add, '--gasKey', '--methodNames', 'method']), /Implications failed/);
  await assert.rejects(run(addKey, [...add, '--numNonces', '2']), /Implications failed/);
  await assert.rejects(run(addKey, [...add, '--gasKey', '--contractId', 'contract.testnet', '--allowance', '1']), /mutually exclusive/);
  await assert.rejects(run(addKey, ['add-key', 'owner.testnet', key.split(':')[1], '--gasKey']), /must include its curve prefix/);
  await assert.rejects(run(deploy, ['deploy', 'owner.testnet', 'file.wasm', '--global', 'codeHash', '--initFunction', 'new', '--initArgs', '{}']), /mutually exclusive/);
  for (const flag of ['initGas', 'initDeposit'])
    await assert.rejects(run(deploy, ['deploy', 'owner.testnet', 'file.wasm', '--global', 'codeHash', `--${flag}`, '0']), /mutually exclusive/);
  const state = ['create-account', '--stateInit', 'state.json', '--useAccount', 'owner.testnet'];
  for (const flags of [['--useFaucet'], ['--publicKey', key], ['--initialBalance', '1'], ['named.testnet']])
    await assert.rejects(run(create, [...state, ...flags]), /mutually exclusive/);
  await assert.rejects(run(create, ['create-account', '--stateInit', 'state.json']), /Implications failed/);
  await assert.rejects(run(create, ['create-account', 'named.testnet', '--useAccount', 'owner.testnet', '--scheme', 'universal']), /Implications failed/);
});

test('removed low-level commands are absent from help and rejected by the executable', () => {
  const help = spawnSync(process.execPath, ['bin/nlite.js', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  for (const name of ['derive-state-account', 'create-state-account', 'sign-meta-call', 'relay-meta-transaction', 'gas-key-nonces', 'add-gas-key', 'deploy-global-contract', 'view-global-contract']) {
    assert(!help.stdout.includes(`nlite ${name}`));
    const result = spawnSync(process.execPath, ['bin/nlite.js', name], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1, `${name}: ${result.stderr}`);
  }
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
  for (const curve of ['secp256k1', 'ml-dsa-65'])
    await assert.rejects(run(generate, ['generate-key', '--curve', curve, '--saveImplicit']), /requires --curve ed25519/);
});
