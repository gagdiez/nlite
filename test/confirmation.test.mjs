import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const script = `
import { Account, JsonRpcProvider, KeyPair } from 'near-api-js';
import deleteKey from './dist/src/commands/keys/delete.js';
import deleteAccount from './dist/src/commands/account/delete.js';
import deploy from './dist/src/commands/contract/deploy.js';
const pair = KeyPair.fromRandom('ed25519');
const publicKey = pair.getPublicKey().toString();
globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
JsonRpcProvider.prototype.viewAccessKeyList = async () => ({keys:[{public_key:publicKey,access_key:{permission:'FullAccess'}}]});
JsonRpcProvider.prototype.viewAccount = async () => ({});
Account.prototype.getState = async () => ({ codeHash:'already-deployed' });
Account.prototype.signAndSendTransaction = async () => { console.log('TRANSACTION_SUBMITTED'); return {}; };
const options = {accountId:'example.testnet', networkId:'testnet', privateKey:pair.toString(), force:process.argv[2] === 'force'};
if (process.argv[1] === 'key') await deleteKey.handler({...options, accessKey:publicKey});
if (process.argv[1] === 'account') await deleteAccount.handler({...options, beneficiaryId:'beneficiary.testnet'});
if (process.argv[1] === 'deploy') await deploy.handler({...options, wasmFile:'test/res/guest_book.wasm'});
`;

function run(command, input, force = false) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, command, force ? 'force' : ''], { input, encoding: 'utf8', timeout: 5000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.includes('TRANSACTION_SUBMITTED');
}

test('last-key deletion accepts both piped confirmations and submits once', () => {
  assert.equal(run('key', 'y\ny\n'), true);
});

test('last-key deletion cancels on either refusal, missing second answer, or EOF', () => {
  for (const input of ['n\n', 'y\nn\n', 'y\n', '']) assert.equal(run('key', input), false);
});

test('declining account deletion or contract replacement never submits a transaction', () => {
  for (const command of ['account', 'deploy']) {
    assert.equal(run(command, 'n\n'), false);
    assert.equal(run(command, ''), false);
    assert.equal(run(command, 'yes\n'), true);
  }
});

test('--force bypasses confirmation without reading stdin', () => {
  for (const command of ['key', 'account', 'deploy']) assert.equal(run(command, '', true), true);
});
