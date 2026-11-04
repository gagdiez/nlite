import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Account, JsonRpcProvider, KeyPair } from 'near-api-js';
import { AccountDoesNotExistError, NotEnoughBalanceError } from 'near-api-js/rpc-errors';
import yargs from 'yargs';
import addKey from '../dist/src/commands/keys/add.js';
import deleteKey from '../dist/src/commands/keys/delete.js';
import create from '../dist/src/commands/account/create.js';
import deleteAccount from '../dist/src/commands/account/delete.js';
import call from '../dist/src/commands/contract/call.js';
import view from '../dist/src/commands/contract/view.js';
import deploy from '../dist/src/commands/contract/deploy.js';
import send from '../dist/src/commands/transactions/send.js';
import storage from '../dist/src/commands/contract/storage.js';
import { storeCredentials } from '../dist/src/utils.js';

async function run(command, args) {
  return yargs([]).strict().exitProcess(false).showHelpOnFail(false)
    .fail((message, error) => { throw error ?? new Error(message); })
    .command(command).parseAsync(args);
}

test('all seven signing commands use local credentials or the explicit key with identical transaction actions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-signing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => root);
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const local = KeyPair.fromRandom('ed25519');
  const explicit = KeyPair.fromRandom('ed25519');
  const target = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  storeCredentials('signer.testnet', 'testnet', local);
  t.mock.method(JsonRpcProvider.prototype, 'viewAccount', async ({ accountId }) => {
    if (accountId === 'new.signer.testnet') throw new AccountDoesNotExistError(accountId, 'block', 123);
    return {};
  });
  t.mock.method(JsonRpcProvider.prototype, 'viewAccessKeyList', async () => ({ keys: [{ public_key: target, access_key: { permission: 'FullAccess' } }] }));
  t.mock.method(Account.prototype, 'getState', async () => ({ codeHash: '11111111111111111111111111111111' }));

  let expectedPair;
  const transactions = [];
  t.mock.method(Account.prototype, 'signAndSendTransaction', async function (transaction) {
    const signer = this.getSigner();
    assert.equal((await signer.getPublicKey()).toString(), expectedPair.getPublicKey().toString());
    // Verify the selected signer can actually produce a signature, not just expose its key.
    const message = { message: 'test', recipient: 'nlite', nonce: new Uint8Array(32) };
    const signed = await signer.signNep413Message(this.accountId, message);
    assert.equal(signed.signature.length, 64);
    transactions.push(transaction);
    return { status: { SuccessValue: '' } };
  });

  const cases = [
    [addKey, ['add-key', 'signer.testnet', target]],
    [addKey, ['add-key', 'signer.testnet', target, '--contractId', 'contract.testnet', '--methodNames', 'one', 'two', '--allowance', '1']],
    [deleteKey, ['delete-key', 'signer.testnet', target, '--force']],
    [create, ['create-account', 'new.signer.testnet', '--useAccount', 'signer.testnet', '--publicKey', target]],
    [deleteAccount, ['delete-account', 'signer.testnet', 'beneficiary.testnet', '--force']],
    [call, ['call', 'contract.testnet', 'method', '{"value":"test"}', '--accountId', 'signer.testnet', '--depositYocto', '1']],
    [call, ['call', 'contract.testnet', 'method', '/4ABAA==', '--base64', '--accountId', 'signer.testnet']],
    [deploy, ['deploy', 'signer.testnet', 'test/res/guest_book.wasm']],
    [send, ['send-near', 'signer.testnet', 'receiver.testnet', '0.000000000000000000000001']]
  ];
  for (const [command, args] of cases) {
    const results = [];
    for (const pair of [local, explicit]) {
      expectedPair = pair;
      const previousCount = transactions.length;
      await run(command, pair === explicit ? [...args, '--privateKey', pair.toString()] : args);
      assert.equal(transactions.length, previousCount + 1);
      results.push(transactions.at(-1));
    }
    assert.deepEqual(results[0], results[1]);
  }

  const restrictedKey = transactions[2].actions[0].addKey.accessKey.permission.functionCall;
  assert.deepEqual(restrictedKey.methodNames, ['one', 'two']);
  assert.equal(restrictedKey.allowance, 10n ** 24n);
  const callAction = transactions[10].actions[0].functionCall;
  assert.equal(callAction.deposit, 1n);
  assert.deepEqual(Buffer.from(transactions[12].actions[0].functionCall.args), Buffer.from([255, 128, 1, 0]));
  assert.equal(transactions.at(-1).actions[0].transfer.deposit, 1n);

  // An explicit key must also work when the account has no credential file at all.
  fs.unlinkSync(path.join(root, '.near-credentials', 'testnet', 'signer.testnet.json'));
  expectedPair = explicit;
  for (const [command, args] of cases) await run(command, [...args, '--privateKey', explicit.toString()]);
});

test('insufficient balance including fees is reported with its original cause', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  const error = new NotEnoughBalanceError(1n, 2n, 'sender.testnet', 'transaction', 'block');
  t.mock.method(Account.prototype, 'signAndSendTransaction', async () => { throw error; });
  await assert.rejects(
    run(send, ['send-near', 'sender.testnet', 'receiver.testnet', '0.000000000000000000000001', '--privateKey', KeyPair.fromRandom('ed25519').toString()]),
    result => result.cause === error && /does not have enough balance/.test(result.message)
  );
});

test('storage sends block zero and decodes UTF-8 values', async (t) => {
  let query;
  const output = [];
  t.mock.method(console, 'log', message => output.push(message));
  t.mock.method(JsonRpcProvider.prototype, 'viewContractState', async options => {
    query = options;
    return { values: [{ key: Buffer.from('key').toString('base64'), value: Buffer.from('value').toString('base64') }] };
  });
  await run(storage, ['storage', 'contract.testnet', '--blockId', '0', '--utf8']);
  assert.deepEqual(query.blockQuery, { blockId: 0 });
  assert.deepEqual(JSON.parse(output[0]), [{ key: 'key', value: 'value' }]);
});

test('JSON.parse reports malformed JSON without submitting a transaction', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  t.mock.method(Account.prototype, 'getState', async () => ({ codeHash: '11111111111111111111111111111111' }));
  const submissions = t.mock.method(Account.prototype, 'signAndSendTransaction', async () => ({}));
  const options = { accountId: 'signer.testnet', networkId: 'testnet', privateKey: KeyPair.fromRandom('ed25519').toString() };
  await assert.rejects(call.handler({ ...options, useAccount: options.accountId, contract: 'contract.testnet', method: 'method', args: '{bad' }), SyntaxError);
  await assert.rejects(view.handler({ ...options, contractName: 'contract.testnet', methodName: 'method', args: '{bad' }), SyntaxError);
  await assert.rejects(deploy.handler({ ...options, wasmFile: 'test/res/guest_book.wasm', initFunction: 'new', initArgs: '{bad' }), SyntaxError);
  assert.equal(submissions.mock.callCount(), 0);
});
