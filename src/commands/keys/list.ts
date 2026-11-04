import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';

type ListKeysOptions = {
  accountId: string;
  networkId: string;
};

const listKeysCommand: CommandModule<object, ListKeysOptions> = {
  command: 'list-keys <accountId>',
  aliases: ['keys'],
  describe: 'Query public keys of an account',
  builder: (yargs) =>
    yargs
      .positional('accountId', {
        desc: 'Account to query keys for',
        type: 'string',
        demandOption: true
      })
      .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
      }),
  handler: (argv: ArgumentsCamelCase<ListKeysOptions>) => viewAccessKeys(argv)
};

async function viewAccessKeys(options: ListKeysOptions): Promise<void> {
  const provider = getProvider(options.networkId);
  const accessKeys = await provider.viewAccessKeyList({ accountId: options.accountId });

  console.log(`Keys for account ${options.accountId}`);
  console.log(JSON.stringify(accessKeys, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

export default listKeysCommand;
