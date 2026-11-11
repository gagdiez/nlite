import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK } from '../../../config.js';
import { confirmAll } from '../../confirm.js';
import { printResult, protocolAccount, type SigningOptions } from '../../protocol.js';
import { privateKeyOption } from '../../validation.js';

type IdentifierOptions = { codeHash?: string; globalAccountId?: string };
type UseOptions = SigningOptions & IdentifierOptions & { accountId: string; force: boolean };

function checkIdentifier(options: IdentifierOptions): true {
  if (!options.codeHash && !options.globalAccountId) throw new Error('Provide --codeHash or --globalAccountId.');
  return true;
}

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
