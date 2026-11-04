import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { KeyPair } from 'near-api-js';
import addCredentials from '../dist/src/commands/credentials/add.js';
import { storeCredentials, signerFromOpts } from '../dist/src/utils.js';

test('credential import reports success only when it stores the key', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-credentials-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => root);
  const messages = [];
  t.mock.method(console, 'log', message => messages.push(message));
  const original = KeyPair.fromRandom('ed25519');
  const replacement = KeyPair.fromRandom('ed25519');
  const options = { accountId: 'example.testnet', networkId: 'testnet', force: false };
  addCredentials.handler({ ...options, secretKey: original.toString() });
  const file = path.join(root, '.near-credentials', 'testnet', 'example.testnet.json');
  const before = fs.readFileSync(file, 'utf8');
  messages.length = 0;
  addCredentials.handler({ ...options, secretKey: replacement.toString() });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert(messages.some(message => message.includes('already has credentials')));
  assert(!messages.some(message => message.startsWith('Stored credentials')));
  messages.length = 0;
  addCredentials.handler({ ...options, secretKey: replacement.toString(), force: true });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).private_key, replacement.toString());
  assert(messages.some(message => message.startsWith('Stored credentials')));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('an interrupted credential write preserves the existing file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-credentials-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => root);
  storeCredentials('example.testnet', 'testnet', KeyPair.fromRandom('ed25519'));
  const dir = path.join(root, '.near-credentials', 'testnet');
  const file = path.join(dir, 'example.testnet.json');
  const before = fs.readFileSync(file, 'utf8');
  t.mock.method(fs, 'fsyncSync', () => { throw new Error('disk full'); });
  assert.throws(() => storeCredentials('example.testnet', 'testnet', KeyPair.fromRandom('ed25519'), true), /disk full/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(dir), ['example.testnet.json']);
});

test('an invalid explicit key never falls back to valid local credentials', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nlite-credentials-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(os, 'homedir', () => root);
  storeCredentials('example.testnet', 'testnet', KeyPair.fromRandom('ed25519'));
  for (const privateKey of ['', 'missing-prefix', 'ed25519:!']) {
    await assert.rejects(signerFromOpts({ useAccount: 'example.testnet', networkId: 'testnet', privateKey }), /prefix|Invalid private key/);
  }
});
