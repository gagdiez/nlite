import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { JsonRpcProvider, KeyPair } from 'near-api-js';
import { AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import createCommand from '../dist/src/commands/account/create.js';
import { signerFromOpts, storeCredentials } from '../dist/src/utils.js';

test('recreating an account saves the new signing key only after successful creation', async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-account-create-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => temporaryRoot);

  const accountId = 'recreated.testnet';
  const credentialPath = path.join(temporaryRoot, '.near-credentials', 'testnet', `${accountId}.json`);
  let exists = false;
  let failCreation = false;
  let publicKey;
  t.mock.method(JsonRpcProvider.prototype, 'viewAccount', async () => {
    if (!exists) throw new AccountDoesNotExistError(accountId, 'block', 123);
    return {};
  });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert(url.endsWith('/account'));
    if (failCreation) return new Response('Creation failed', { status: 503 });
    publicKey = JSON.parse(options.body).newAccountPublicKey;
    exists = true;
    return new Response('{}');
  });
  const create = () => createCommand.handler({ newAccountId: accountId, networkId: 'testnet', useFaucet: true });

  await create();
  const originalCredentials = fs.readFileSync(credentialPath, 'utf8');
  exists = false; // The account was deleted on-chain; its credentials remain locally.
  await create();

  const currentCredentials = fs.readFileSync(credentialPath, 'utf8');
  assert.notEqual(currentCredentials, originalCredentials);
  const storedKey = KeyPair.fromString(JSON.parse(currentCredentials).private_key);
  assert.equal(storedKey.getPublicKey().toString(), publicKey);
  const signer = await signerFromOpts({ useAccount: accountId, networkId: 'testnet' });
  assert.equal((await signer.getPublicKey()).toString(), publicKey);

  await assert.rejects(create(), /already exists/);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(fs.readFileSync(credentialPath, 'utf8'), currentCredentials);

  exists = false;
  failCreation = true;
  await assert.rejects(create(), /Creation failed/);
  assert.equal(fs.readFileSync(credentialPath, 'utf8'), currentCredentials);
});

function recoveryFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-account-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => root);
  t.mock.method(console, 'log', () => {});
  const messages = [];
  t.mock.method(console, 'error', message => messages.push(message));
  const accountId = 'recovery.testnet';
  storeCredentials(accountId, 'testnet', KeyPair.fromRandom('ed25519'));
  const dir = path.join(root, '.near-credentials', 'testnet');
  const file = path.join(dir, `${accountId}.json`);
  const oldCredentials = fs.readFileSync(file, 'utf8');
  t.mock.method(JsonRpcProvider.prototype, 'viewAccount', async () => { throw new AccountDoesNotExistError(accountId, 'block', 123); });
  return {
    dir, file, oldCredentials, messages,
    create: () => createCommand.handler({ newAccountId: accountId, networkId: 'testnet', useFaucet: true }),
    pending: () => fs.readdirSync(dir).filter(name => name.startsWith('.pending-'))
  };
}

test('failure to persist a recovery key prevents account creation from being submitted', async (t) => {
  const fixture = recoveryFixture(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not submit'); });
  t.mock.method(fs, 'fsyncSync', () => { throw new Error('disk full'); });
  await assert.rejects(fixture.create(), /disk full/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.oldCredentials);
  assert.deepEqual(fixture.pending(), []);
});

test('a timeout after remote creation preserves its matching recovery key', async (t) => {
  const fixture = recoveryFixture(t);
  let publicKey;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    publicKey = JSON.parse(options.body).newAccountPublicKey;
    // The remote helper accepted the key, but its response never reached the caller.
    throw new Error('request timed out');
  });
  await assert.rejects(fixture.create(), /request timed out/);
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.oldCredentials);
  assert.equal(fixture.pending().length, 1);
  const recoveryPath = path.join(fixture.dir, fixture.pending()[0]);
  const payload = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
  assert.equal(KeyPair.fromString(payload.private_key).getPublicKey().toString(), publicKey);
  assert(fixture.messages.some(message => message.includes(recoveryPath)));
  assert.equal(fs.statSync(recoveryPath).mode & 0o777, 0o600);
});

test('failure to commit credentials after creation preserves both the old file and recovery key', async (t) => {
  const fixture = recoveryFixture(t);
  let publicKey;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    publicKey = JSON.parse(options.body).newAccountPublicKey;
    return new Response('{}');
  });
  t.mock.method(fs, 'renameSync', () => { throw new Error('permission denied'); });
  await assert.rejects(fixture.create(), /permission denied/);
  assert.equal(fs.readFileSync(fixture.file, 'utf8'), fixture.oldCredentials);
  assert.equal(fixture.pending().length, 1);
  const recoveryPath = path.join(fixture.dir, fixture.pending()[0]);
  const payload = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
  assert.equal(KeyPair.fromString(payload.private_key).getPublicKey().toString(), publicKey);
  assert(fixture.messages.some(message => message.includes(recoveryPath)));
});
