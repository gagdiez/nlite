import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { JsonRpcProvider, yoctoToNear } from 'near-api-js';
import { DEFAULT_NETWORK, getConfig } from '../../../config.js';

type StateOptions = {
  accountId: string;
  networkId: string;
};

const stateCommand: CommandModule<object, StateOptions> = {
  command: 'state <accountId>',
  describe: "View account's state (balance, storage usage, code hash, etc)",
  builder: (yargs) =>
    yargs
      .positional('accountId', {
        desc: 'The account name to query',
        type: 'string',
        demandOption: true
      })
      .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
      }),
  handler: (argv: ArgumentsCamelCase<StateOptions>) => viewAccountState(argv)
};

async function viewAccountState(options: StateOptions): Promise<void> {
  const provider = new JsonRpcProvider({ url: getConfig(options.networkId).nodeUrl ?? '' });
  const state = await provider.viewAccount({ accountId: options.accountId });
  const enrichedState: Record<string, unknown> = { ...state };
  enrichedState.formattedAmount = yoctoToNear(state.amount);

  console.log(`Account ${options.accountId}`);
  console.log(JSON.stringify(enrichedState, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

export default stateCommand;
