import { Account, nearToYocto, teraToGas, yoctoToNear } from 'near-api-js';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { TotalPrepaidGasExceededActionError } from 'near-api-js/rpc-errors';
import { privateKeyOption, base64Args } from '../../validation.js';
const callCommand = {
    command: 'call <contract> <method> [args]',
    describe: 'Call a method in a smart contract',
    builder: (yargs) => yargs
        .positional('contract', {
        desc: 'The account name of the contract',
        type: 'string',
        demandOption: true
    })
        .positional('method', {
        desc: 'The method to call',
        type: 'string',
        demandOption: true
    })
        .option('args', {
        desc: 'Arguments to the function call, in JSON format (e.g. {"param_a":"value"})',
        type: 'string',
        default: undefined
    })
        .option('useAccount', {
        required: true,
        alias: ['accountId'],
        desc: 'Account that will execute the actions',
        type: 'string'
    })
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    })
        .option('gas', {
        desc: 'Max amount of gas this call can use (in gas units)',
        type: 'string',
        default: teraToGas(30).toString()
    })
        .option('deposit', {
        desc: 'Number of tokens to attach (in NEAR) to a function call',
        type: 'string',
        alias: 'amount'
    })
        .option('depositYocto', {
        desc: 'Number of tokens to attach (in yocto NEAR) to a function call',
        type: 'string'
    })
        .option('base64', {
        desc: 'Treat arguments as a base64-encoded BLOB',
        type: 'boolean',
        default: false
    })
        .option('privateKey', privateKeyOption)
        .conflicts('deposit', 'depositYocto')
        .check(argv => { if (argv.base64)
        base64Args(argv.args); return true; }),
    handler: callFunction
};
async function callFunction(options) {
    const provider = getProvider(options.networkId);
    const signer = await signerFromOpts(options);
    const account = new Account(options.useAccount, provider, signer);
    const deposit = options.depositYocto != null ? options.depositYocto : nearToYocto((options.deposit ?? '0'));
    if (!options.quiet) {
        console.log(`Calling function: ${options.contract}.${options.method}(${options.args || ''})` +
            (deposit && deposit != '0' ? ` with attached ${yoctoToNear(deposit)} NEAR` : ''));
    }
    const parsedArgs = options.base64
        ? Buffer.from(options.args || '', 'base64')
        : JSON.parse(options.args || '{}');
    try {
        const result = await account.callFunction({
            contractId: options.contract,
            methodName: options.method,
            args: parsedArgs,
            gas: options.gas,
            deposit: deposit,
        });
        console.log(JSON.stringify(result));
    }
    catch (error) {
        if (error instanceof TotalPrepaidGasExceededActionError) {
            console.error(`\nTransaction ${error.transactionResult?.transaction_outcome.id} had ${options.gas} of attached gas but used ${error.transactionResult?.transaction_outcome.outcome.gas_burnt} of gas`);
            console.error('View this transaction in explorer:', `https://explorer.${options.networkId}.near.org/transactions/${error.txHash}`);
            process.exit(1);
        }
        throw error;
    }
}
export default callCommand;
