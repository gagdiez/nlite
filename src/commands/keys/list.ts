import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';

type ListKeysOptions = {
  accountId: string;
  networkId: string;
  afterKey?: string;
  limit?: number;
};

const listKeysCommand: CommandModule<object, ListKeysOptions> = {
  command: 'list-keys <accountId>',
  aliases: ['keys'],
  describe: "Query one page of an account's public keys",
  builder: (yargs) =>
    yargs
      .positional('accountId', {
        desc: 'Account to query keys for',
        type: 'string',
        demandOption: true
      })
      .option('afterKey', { type: 'string', desc: 'Pagination cursor from last_key in the previous response' })
      .option('limit', { type: 'number', default: 100, desc: 'Maximum keys to return in this page' })
      .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
      }),
  handler: (argv: ArgumentsCamelCase<ListKeysOptions>) => viewAccessKeys(argv)
};

async function viewAccessKeys(options: ListKeysOptions): Promise<void> {
  const provider = getProvider(options.networkId);
  const accessKeys = await provider.viewAccessKeyList({ accountId: options.accountId, afterKey: options.afterKey, limit: options.limit });

  console.log(`Keys for account ${options.accountId}`);
  console.log(JSON.stringify(accessKeys, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

export default listKeysCommand;
