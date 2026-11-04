import { yoctoToNear } from 'near-api-js';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
const stateCommand = {
    command: 'state <accountId>',
    describe: "View account's state (balance, storage usage, code hash, etc)",
    builder: (yargs) => yargs
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
    handler: (argv) => viewAccountState(argv)
};
async function viewAccountState(options) {
    const provider = getProvider(options.networkId);
    const state = await provider.viewAccount({ accountId: options.accountId });
    const enrichedState = { ...state };
    enrichedState.formattedAmount = yoctoToNear(state.amount);
    console.log(`Account ${options.accountId}`);
    console.log(JSON.stringify(enrichedState, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
export default stateCommand;
