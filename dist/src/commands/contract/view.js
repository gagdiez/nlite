import { AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
const viewCommand = {
    command: 'view <contractName> <methodName> [args]',
    describe: 'Call a read-only method in a contract',
    builder: (yargs) => yargs
        .positional('contractName', {
        desc: 'The account name of the contract',
        type: 'string',
        demandOption: true
    })
        .positional('methodName', {
        desc: 'The view method to call',
        type: 'string',
        demandOption: true
    })
        .option('args', {
        desc: 'Arguments to the view call, in JSON format (e.g. {"param_a":"value"})',
        type: 'string',
        default: null
    })
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    }),
    handler: (argv) => callViewFunction(argv)
};
async function callViewFunction(options) {
    const provider = getProvider(options.networkId);
    try {
        if (!options.quiet) {
            console.log(`View call: ${options.contractName}.${options.methodName}(${options.args || ''})`);
        }
        const response = await provider.callFunction({
            contractId: options.contractName,
            method: options.methodName,
            args: options.args ? JSON.parse(options.args) : {}
        });
        console.log(JSON.stringify(response));
    }
    catch (error) {
        if (error instanceof AccountDoesNotExistError) {
            console.error(`\nAccount ${options.contractName} was not found in ${options.networkId}.`);
            console.error('Check if the contract account is correct, and if you chose the right --networkId.');
            process.exit(1);
        }
        throw error;
    }
}
export default viewCommand;
