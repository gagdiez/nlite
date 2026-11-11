import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Sandbox, DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { Account, JsonRpcProvider, KeyPair, nearToYocto } from "near-api-js";
const cliDir = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(path.join(tmpdir(), "nlite-protocol-smoke-"));
const sandbox = await Sandbox.start({ version: "2.14.0" });
const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
const send = provider.sendTransactionUntil.bind(provider);
provider.sendTransactionUntil = (transaction) => send(transaction, "FINAL");
const root = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);
const counts = new Map();
function cli(args, privateKey) {
  const flags = [
    ...(args[0] === "derive-state-account" ? [] : ["--networkId", "custom"]),
    ...(privateKey ? ["--privateKey", privateKey] : []),
  ];
  const output = execFileSync(
    process.execPath,
    ["bin/nlite.js", ...args, ...flags],
    {
      cwd: cliDir,
      env: {
        ...process.env,
        NEAR_CUSTOM_RPC: sandbox.rpcUrl,
        NEAR_RPC_API_KEY: "",
      },
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  counts.set(args[0], (counts.get(args[0]) ?? 0) + 1);
  return output.trim();
}
try {
  cli(
    [
      "deploy-global-contract",
      root.accountId,
      "test/res/guest_book.wasm",
      "--mode",
      "accountId",
    ],
    DEFAULT_PRIVATE_KEY,
  );
  for (let i = 0; i < 30; i++) {
    try {
      await provider.viewGlobalContractCode({
        identifier: { accountId: root.accountId },
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const globalCode = JSON.parse(
    cli(["view-global-contract", "--globalAccountId", root.accountId]),
  );
  cli(
    [
      "use-global-contract",
      root.accountId,
      "--globalAccountId",
      root.accountId,
      "--force",
    ],
    DEFAULT_PRIVATE_KEY,
  );
  assert.equal(
    (await provider.viewAccount({ accountId: root.accountId }))
      .global_contract_account_id,
    root.accountId,
  );
  const deterministic = path.join(dir, "deterministic.json");
  writeFileSync(
    deterministic,
    JSON.stringify({
      code: { accountId: root.accountId },
      data: { key: "value" },
    }),
  );
  const deterministicId = cli([
    "derive-state-account",
    deterministic,
    "--dataEncoding",
    "utf8",
  ]);
  cli(
    [
      "create-state-account",
      deterministic,
      "--dataEncoding",
      "utf8",
      "--useAccount",
      root.accountId,
    ],
    DEFAULT_PRIVATE_KEY,
  );
  const data = await provider.viewContractState({
    contractId: deterministicId,
  });
  assert(data.values.some((v) => v.key === "a2V5" && v.value === "dmFsdWU="));
  const pair = KeyPair.fromRandom("ed25519");
  const universal = path.join(dir, "universal.json");
  writeFileSync(
    universal,
    JSON.stringify({ accessKeys: [pair.getPublicKey().toString()] }),
  );
  const universalId = cli([
    "derive-state-account",
    universal,
    "--scheme",
    "universal",
  ]);
  cli(
    [
      "create-state-account",
      universal,
      "--scheme",
      "universal",
      "--useAccount",
      root.accountId,
    ],
    DEFAULT_PRIVATE_KEY,
  );
  await root.transfer({ receiverId: universalId, amount: nearToYocto("1") });
  cli(["send-near", universalId, root.accountId, "0.01"], pair.toString());
  const secpPair = KeyPair.fromRandom("secp256k1");
  const secpState = path.join(dir, "secp-universal.json");
  writeFileSync(secpState, JSON.stringify({ accessKeys: [secpPair.getPublicKey().toString()] }));
  const secpId = cli(["derive-state-account", secpState, "--scheme", "universal"]);
  cli(["create-state-account", secpState, "--scheme", "universal", "--useAccount", root.accountId], DEFAULT_PRIVATE_KEY);
  await root.transfer({ receiverId: secpId, amount: nearToYocto("1") });
  cli(["send-near", secpId, root.accountId, "0.01"], secpPair.toString());
  const bootstrapPair = KeyPair.fromRandom("ml-dsa-65");
  const bootstrap = path.join(dir, "bootstrap.json");
  writeFileSync(
    bootstrap,
    JSON.stringify({ accessKeys: [bootstrapPair.getPublicKey().toString()] }),
  );
  const bootstrapId = cli([
    "derive-state-account",
    bootstrap,
    "--scheme",
    "universal",
  ]);
  await root.transfer({ receiverId: bootstrapId, amount: nearToYocto("1") });
  cli(
    [
      "create-state-account",
      bootstrap,
      "--scheme",
      "universal",
      "--useAccount",
      bootstrapId,
      "--storageDeposit",
      "0",
    ],
    bootstrapPair.toString(),
  );
  assert.notEqual(
    (await provider.viewAccount({ accountId: bootstrapId })).state,
    "uninitialized",
  );
  cli(["send-near", bootstrapId, root.accountId, "0.01"], bootstrapPair.toString());
  cli(
    [
      "delete-key",
      bootstrapId,
      bootstrapPair.getPublicKey().toString(),
      "--force",
    ],
    bootstrapPair.toString(),
  );
  assert.equal(
    (await provider.viewAccessKeyList({ accountId: bootstrapId })).keys.length,
    0,
  );
  const gasPair = KeyPair.fromRandom("ed25519");
  const gasKey = gasPair.getPublicKey().toString();
  cli(
    ["add-gas-key", root.accountId, gasKey, "--numNonces", "2"],
    DEFAULT_PRIVATE_KEY,
  );
  cli(
    [
      "fund-gas-key",
      root.accountId,
      gasKey,
      "0.5",
      "--useAccount",
      root.accountId,
    ],
    DEFAULT_PRIVATE_KEY,
  );
  const nonces = JSON.parse(cli(["gas-key-nonces", root.accountId, gasKey]));
  assert.equal(nonces.nonces.length, 2);
  cli(["send-near", root.accountId, universalId, "0.01"], gasPair.toString());
  cli(["withdraw-gas-key", root.accountId, gasKey, "0.1"], DEFAULT_PRIVATE_KEY);
  const signed = cli(
    [
      "sign-meta-call",
      universalId,
      root.accountId,
      "addMessage",
      '{"text":"CLI protocol smoke"}',
    ],
    pair.toString(),
  );
  const relayed = JSON.parse(
    cli(
      ["relay-meta-transaction", root.accountId, signed],
      DEFAULT_PRIVATE_KEY,
    ),
  );
  assert.deepEqual(relayed.status, { SuccessValue: "" });
  const messages = await provider.callFunction({
    contractId: root.accountId,
    method: "getMessages",
    args: {},
  });
  assert.equal(messages.at(-1).text, "CLI protocol smoke");
  cli(
    [
      "deploy-global-contract",
      root.accountId,
      "test/res/guest_book.wasm",
      "--mode",
      "codeHash",
    ],
    DEFAULT_PRIVATE_KEY,
  );
  for (let i = 0; i < 30; i++) {
    try {
      await provider.viewGlobalContractCode({
        identifier: { codeHash: globalCode.hash },
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  cli(
    [
      "use-global-contract",
      root.accountId,
      "--codeHash",
      globalCode.hash,
      "--force",
    ],
    DEFAULT_PRIVATE_KEY,
  );
  assert.deepEqual((await root.getState()).globalContract, {
    codeHash: globalCode.hash,
  });
  console.log(
    JSON.stringify(
      { status: "passed", commands: Object.fromEntries(counts) },
      null,
      2,
    ),
  );
} finally {
  await sandbox.tearDown();
  rmSync(dir, { recursive: true, force: true });
}
