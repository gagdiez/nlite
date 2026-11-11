import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Sandbox, DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from 'near-sandbox';
import { Account, JsonRpcProvider, KeyPair, DeterministicStateInit, UniversalStateInit, nearToYocto } from 'near-api-js';

const cliDir = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), 'nlite-protocol-smoke-'));
const sandbox = await Sandbox.start({ version: '2.14.0' });
const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
const send = provider.sendTransactionUntil.bind(provider);
provider.sendTransactionUntil = transaction => send(transaction, 'FINAL');
const root = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);
const counts = new Map();

function cli(args, privateKey) {
  const output = execFileSync(process.execPath, ['bin/nlite.js', ...args, '--networkId', 'custom', ...(privateKey ? ['--privateKey', privateKey] : [])], {
    cwd: cliDir,
    env: { ...process.env, NEAR_CUSTOM_RPC: sandbox.rpcUrl, NEAR_RPC_API_KEY: '' },
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 4 * 1024 * 1024,
  });
  counts.set(args[0], (counts.get(args[0]) ?? 0) + 1);
  return output.trim();
}

async function waitForGlobal(identifier) {
  for (let i = 0; i < 30; i++) {
    try { return await provider.viewGlobalContractCode({ identifier }); }
    catch (error) {
      if (i === 29) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

try {
  cli(['deploy', root.accountId, 'test/res/guest_book.wasm', '--global', 'accountId'], DEFAULT_PRIVATE_KEY);
  await waitForGlobal({ accountId: root.accountId });
  const globalCode = JSON.parse(cli(['view-code', '--globalAccountId', root.accountId]));
  cli(['use-global-contract', root.accountId, '--globalAccountId', root.accountId, '--force'], DEFAULT_PRIVATE_KEY);
  assert.equal((await provider.viewAccount({ accountId: root.accountId })).global_contract_account_id, root.accountId);
  assert.equal(JSON.parse(cli(['view-code', root.accountId])).hash, globalCode.hash);

  const deterministicFile = path.join(dir, 'deterministic.json');
  writeFileSync(deterministicFile, JSON.stringify({ code: { accountId: root.accountId }, data: { key: 'value' } }));
  const deterministicId = new DeterministicStateInit({ code: { accountId: root.accountId }, data: [[Buffer.from('key'), Buffer.from('value')]] }).deriveAccountId();
  const created = cli(['create-account', '--stateInit', deterministicFile, '--dataEncoding', 'utf8', '--useAccount', root.accountId], DEFAULT_PRIVATE_KEY);
  assert(created.includes(deterministicId));
  const data = await provider.viewContractState({ contractId: deterministicId });
  assert(data.values.some(value => value.key === 'a2V5' && value.value === 'dmFsdWU='));

  let universalId;
  for (const curve of ['ed25519', 'secp256k1', 'ml-dsa-65']) {
    const pair = KeyPair.fromRandom(curve);
    const accountId = new UniversalStateInit({ accessKeys: [pair.getPublicKey()] }).deriveAccountId();
    const stateFile = path.join(dir, `${curve}.json`);
    writeFileSync(stateFile, JSON.stringify({ accessKeys: [pair.getPublicKey().toString()] }));
    const bootstrap = curve === 'ml-dsa-65';
    if (bootstrap) await root.transfer({ receiverId: accountId, amount: nearToYocto('1') });
    const result = cli(['create-account', '--stateInit', stateFile, '--scheme', 'universal', '--useAccount', bootstrap ? accountId : root.accountId,
      ...(bootstrap ? ['--storageDeposit', '0'] : [])], bootstrap ? pair.toString() : DEFAULT_PRIVATE_KEY);
    assert(result.includes(accountId));
    if (!bootstrap) await root.transfer({ receiverId: accountId, amount: nearToYocto('1') });
    assert.notEqual((await provider.viewAccount({ accountId })).state, 'uninitialized');
    cli(['send-near', accountId, root.accountId, '0.01'], pair.toString());
    if (bootstrap) {
      cli(['delete-key', accountId, pair.getPublicKey().toString(), '--force'], pair.toString());
      assert.equal((await provider.viewAccessKeyList({ accountId })).keys.length, 0);
    } else universalId = accountId;
  }

  const gasPair = KeyPair.fromRandom('ed25519');
  const gasKey = gasPair.getPublicKey().toString();
  cli(['add-key', root.accountId, gasKey, '--gasKey', '--numNonces', '2'], DEFAULT_PRIVATE_KEY);
  cli(['fund-gas-key', root.accountId, gasKey, '0.5', '--useAccount', root.accountId], DEFAULT_PRIVATE_KEY);
  assert.equal((await provider.viewGasKeyNonces({ accountId: root.accountId, publicKey: gasKey })).nonces.length, 2);
  cli(['send-near', root.accountId, universalId, '0.01'], gasPair.toString());
  cli(['withdraw-gas-key', root.accountId, gasKey, '0.1'], DEFAULT_PRIVATE_KEY);

  cli(['call', root.accountId, 'addMessage', '{"text":"CLI protocol smoke"}', '--accountId', root.accountId], DEFAULT_PRIVATE_KEY);
  const messages = await provider.callFunction({ contractId: root.accountId, method: 'getMessages', args: {} });
  assert.equal(messages.at(-1).text, 'CLI protocol smoke');

  cli(['deploy', root.accountId, 'test/res/guest_book.wasm', '--global', 'codeHash'], DEFAULT_PRIVATE_KEY);
  await waitForGlobal({ codeHash: globalCode.hash });
  assert.equal(JSON.parse(cli(['view-code', '--codeHash', globalCode.hash])).hash, globalCode.hash);
  cli(['use-global-contract', root.accountId, '--codeHash', globalCode.hash, '--force'], DEFAULT_PRIVATE_KEY);
  assert.deepEqual((await root.getState()).globalContract, { codeHash: globalCode.hash });
  console.log(JSON.stringify({ status: 'passed', commands: Object.fromEntries(counts) }, null, 2));
} finally {
  await sandbox.tearDown();
  rmSync(dir, { recursive: true, force: true });
}
