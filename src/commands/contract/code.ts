import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { printResult, type NetworkOptions } from '../../protocol.js';

type Options = NetworkOptions & { accountId?: string; codeHash?: string; globalAccountId?: string };

const command: CommandModule<object, Options> = {
  command: 'view-code [accountId]',
  describe: 'Query deployed account code or reusable global code',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', desc: 'Account whose deployed code to query' })
    .option('codeHash', { type: 'string', desc: 'Immutable global contract hash' })
    .option('globalAccountId', { type: 'string', desc: 'Publisher of updatable global code' })
    .conflicts('accountId', ['codeHash', 'globalAccountId']).conflicts('codeHash', 'globalAccountId')
    .check(options => {
      if (!options.accountId && !options.codeHash && !options.globalAccountId)
        throw new Error('Provide an accountId, --codeHash or --globalAccountId.');
      return true;
    })
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const provider = getProvider(options.networkId);
    printResult(options.accountId
      ? await provider.viewContractCode({ contractId: options.accountId })
      : await provider.viewGlobalContractCode({ identifier: options.codeHash ? { codeHash: options.codeHash } : { accountId: options.globalAccountId! } }));
  }
};

export default command;
