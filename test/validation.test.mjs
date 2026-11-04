import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KeyPair } from 'near-api-js';
import yargs from 'yargs';
import addKey from '../dist/src/commands/keys/add.js';
import deleteKey from '../dist/src/commands/keys/delete.js';
import create from '../dist/src/commands/account/create.js';
import deleteAccount from '../dist/src/commands/account/delete.js';
import call from '../dist/src/commands/contract/call.js';
import deploy from '../dist/src/commands/contract/deploy.js';
import storage from '../dist/src/commands/contract/storage.js';
import send from '../dist/src/commands/transactions/send.js';
import credentials from '../dist/src/commands/credentials/add.js';

const pair = KeyPair.fromRandom('ed25519');
const publicKey = pair.getPublicKey().toString();
const privateKey = pair.toString();
const seedPhrase = 'crisp clump stay mean dynamic become fashion mail bike disorder chronic sight';
const oneYocto = '0.000000000000000000000001';

async function parse(command, args) {
  let parsed;
  const parser = yargs([]).strict().exitProcess(false).showHelpOnFail(false)
    .fail((message, error) => { throw error ?? new Error(message); })
    .command({ ...command, handler: argv => { parsed = argv; } });
  await parser.parseAsync(args);
  assert(parsed, 'Valid input should reach the handler');
  return parsed;
}

test('yargs requires a contract for access-key restrictions without changing full-access defaults', async () => {
  const args = ['add-key', 'example.testnet', publicKey];
  for (const flags of [['--methodNames', 'method'], ['--allowance', '0'], ['--allowance', '1']]) {
    await assert.rejects(parse(addKey, [...args, ...flags]), /Implications failed/);
  }
  await parse(addKey, args);
  const restricted = await parse(addKey, [...args, '--contractId', 'contract.testnet', '--methodNames', 'one', 'two', '--allowance', '1']);
  assert.deepEqual(restricted.methodNames, ['one', 'two']);
});

test('public keys require a prefix and are never normalized', async () => {
  for (const [command, args] of [
    [addKey, ['add-key', 'example.testnet']],
    [deleteKey, ['delete-key', 'example.testnet']],
    [create, ['create-account', 'new.testnet', '--useFaucet', '--publicKey']]
  ]) {
    await assert.rejects(parse(command, [...args, publicKey.split(':')[1]]), /must include its curve prefix/);
    await assert.rejects(parse(command, [...args, 'ed25519:!']), /Invalid public key/);
    await assert.rejects(parse(command, [...args, publicKey.replace('ed25519:', 'ED25519:')]), /Invalid public key/);
    const result = await parse(command, [...args, publicKey]);
    assert.equal(result.publicKey ?? result.accessKey, publicKey);
  }
});

test('all signing commands validate explicit private keys through yargs', async () => {
  for (const [command, args] of [
    [addKey, ['add-key', 'example.testnet', publicKey]],
    [deleteKey, ['delete-key', 'example.testnet', publicKey]],
    [create, ['create-account', 'new.testnet', '--useAccount', 'example.testnet']],
    [deleteAccount, ['delete-account', 'example.testnet', 'beneficiary.testnet']],
    [call, ['call', 'contract.testnet', 'method', '--accountId', 'example.testnet']],
    [deploy, ['deploy', 'example.testnet', 'contract.wasm']],
    [send, ['send-near', 'example.testnet', 'receiver.testnet', '1']]
  ]) {
    await assert.rejects(parse(command, [...args, '--privateKey', privateKey.split(':')[1]]), /must include its curve prefix/);
    await assert.rejects(parse(command, [...args, '--privateKey', 'ed25519:!']), /Invalid private key/);
    assert.equal((await parse(command, [...args, '--privateKey', privateKey])).privateKey, privateKey);
  }
  await assert.rejects(parse(credentials, ['add-credentials', 'example.testnet', '--secretKey', privateKey.split(':')[1]]), /must include its curve prefix/);
});

test('creation conflicts and funding requirements fail during argument parsing', async () => {
  await assert.rejects(parse(create, ['create-account', 'new.testnet']), /either --useFaucet or --useAccount/);
  for (const alias of ['useAccount', 'accountId', 'masterAccount']) {
    await assert.rejects(parse(create, ['create-account', 'new.testnet', '--useFaucet', `--${alias}`, 'fund.testnet']), /mutually exclusive/);
  }
  await assert.rejects(parse(create, ['create-account', 'new.testnet', '--useFaucet', '--publicKey', publicKey, '--seedPhrase', seedPhrase]), /mutually exclusive/);
  await assert.rejects(parse(create, ['create-account', 'new.near', '--useFaucet', '--networkId', 'mainnet']), /not possible on mainnet/);
  await assert.rejects(parse(credentials, ['add-credentials', 'example.testnet']), /Provide --secretKey or --seedPhrase/);
});

test('amounts and gas remain strings, leaving limits to the SDK and protocol', async () => {
  const args = ['call', 'contract.testnet', 'method', '--accountId', 'example.testnet'];
  for (const value of ['0', '-1', '340282366920939']) {
    assert.equal((await parse(send, ['send-near', 'sender.testnet', 'receiver.testnet', value])).amount, value);
    assert.equal((await parse(call, [...args, '--gas', value])).gas, value);
    assert.equal((await parse(call, [...args, '--depositYocto', value])).depositYocto, value);
  }
  assert.equal((await parse(send, ['send-near', 'sender.testnet', 'receiver.testnet', oneYocto])).amount, oneYocto);
  assert.equal((await parse(create, ['create-account', 'zero.testnet', '--useAccount', 'fund.testnet', '--initialBalance', '0'])).initialBalance, '0');
  for (const name of ['deposit', 'amount']) {
    await assert.rejects(parse(call, [...args, `--${name}`, '0', '--depositYocto', '0']), /mutually exclusive/);
  }
});

test('malformed base64 and incomplete initialization options are rejected', async () => {
  const args = ['call', 'contract.testnet', 'method'];
  for (const value of ['!!!', 'A', 'Zh==', 'Zg=']) {
    await assert.rejects(parse(call, [...args, value, '--base64', '--accountId', 'example.testnet']), /valid base64/);
  }
  await assert.rejects(parse(call, [...args, '--base64', '--accountId', 'example.testnet']), /requires arguments/);
  for (const value of ['AAE=', 'AAE', '/4ABAA==']) await parse(call, [...args, value, '--base64', '--accountId', 'example.testnet']);
  await assert.rejects(parse(deploy, ['deploy', 'example.testnet', 'contract.wasm', '--initFunction', 'new']), /Implications failed/);
  await assert.rejects(parse(deploy, ['deploy', 'example.testnet', 'contract.wasm', '--initArgs', '{}']), /Implications failed/);
});

test('block zero counts as a supplied block ID', async () => {
  assert.equal((await parse(storage, ['storage', 'example.testnet', '--blockId', '0'])).blockId, 0);
  await assert.rejects(parse(storage, ['storage', 'example.testnet']), /Must provide/);
  await assert.rejects(parse(storage, ['storage', 'example.testnet', '--blockId', '0', '--finality', 'final']), /mutually exclusive/);
});
