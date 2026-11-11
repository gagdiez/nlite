import fs from 'node:fs';
import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { confirmAll } from '../../confirm.js';
import { printResult, protocolAccount, type SigningOptions, type NetworkOptions } from '../../protocol.js';
import { privateKeyOption } from '../../validation.js';

type IdentifierOptions = { codeHash?: string; globalAccountId?: string };
type DeployOptions = SigningOptions & { accountId: string; wasmFile: string; mode: 'codeHash' | 'accountId' };
type UseOptions = SigningOptions & IdentifierOptions & { accountId: string; force: boolean };
type ViewOptions = NetworkOptions & IdentifierOptions;

function checkIdentifier(options: IdentifierOptions): true {
  if (!options.codeHash && !options.globalAccountId) throw new Error('Provide --codeHash or --globalAccountId.');
  return true;
}

export const deployGlobalCommand: CommandModule<object, DeployOptions> = {
  command: 'deploy-global-contract <accountId> <wasmFile>',
  describe: 'Publish reusable contract code by immutable hash or updatable publisher account',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('wasmFile', { type: 'string', demandOption: true })
    .option('mode', { choices: ['codeHash', 'accountId'] as const, default: 'codeHash' as const, desc: 'codeHash is immutable; accountId lets the publisher update code for every consumer' })
    .option('privateKey', privateKeyOption)
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const code = fs.readFileSync(options.wasmFile);
    const account = await protocolAccount(options.accountId, options);
    printResult(await account.deployGlobalContract(code, options.mode));
  }
};

export const useGlobalCommand: CommandModule<object, UseOptions> = {
  command: 'use-global-contract <accountId>',
  describe: 'Attach an existing global contract to an account',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .option('codeHash', { type: 'string', desc: 'Immutable global contract hash (base58, as returned by RPC)' })
    .option('globalAccountId', { type: 'string', desc: 'Publisher of an updatable global contract' })
    .conflicts('codeHash', 'globalAccountId').check(checkIdentifier)
    .option('force', { type: 'boolean', default: false, desc: 'Skip the contract replacement confirmation' })
    .option('privateKey', privateKeyOption)
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    if (!options.force && !(await confirmAll([`Replace the contract used by ${options.accountId} with this global contract?`]))) return;
    const account = await protocolAccount(options.accountId, options);
    printResult(await account.useGlobalContract(options.codeHash ? { codeHash: options.codeHash } : { accountId: options.globalAccountId! }));
  }
};

export const viewGlobalCommand: CommandModule<object, ViewOptions> = {
  command: 'view-global-contract',
  describe: 'Query global contract code and its hash',
  builder: yargs => yargs
    .option('codeHash', { type: 'string' }).option('globalAccountId', { type: 'string' })
    .conflicts('codeHash', 'globalAccountId').check(checkIdentifier)
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const provider = getProvider(options.networkId);
    const identifier = options.codeHash ? { codeHash: options.codeHash } : { accountId: options.globalAccountId! };
    printResult(await provider.viewGlobalContractCode({ identifier }));
  }
};
