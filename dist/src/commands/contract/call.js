import { Account, JsonRpcProvider, nearToYocto, teraToGas, yoctoToNear } from 'near-api-js';
import { DEFAULT_NETWORK, getConfig } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
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
        .option('signWithLedger', {
        alias: ['useLedgerKey'],
        desc: 'Use Ledger for signing',
        type: 'boolean',
        default: false
    })
        .option('ledgerPath', {
        desc: 'HD key path',
        type: 'string',
        default: "44'/397'/0'/0'/1'"
    })
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    })
        .option('gas', {
        desc: 'Max amount of gas this call can use (in gas units)',
        type: 'string',
        default: teraToGas(30).toString(),
    })
        .option('deposit', {
        desc: 'Number of tokens to attach (in NEAR) to a function call',
        type: 'string',
        default: '0',
        alias: 'amount'
    })
        .option('depositYocto', {
        desc: 'Number of tokens to attach (in yocto NEAR) to a function call',
        type: 'string',
        default: null,
    })
        .option('privateKey', {
        desc: 'AccessKey to use in the call',
        type: 'string',
        default: null
    }),
    handler: callFunction
};
async function callFunction(options) {
    let provider = new JsonRpcProvider({ url: getConfig(options.networkId).nodeUrl });
    let signer = await signerFromOpts(options);
    const account = new Account(options.useAccount, provider, signer);
    const deposit = options.depositYocto != null ? options.depositYocto : nearToYocto(options.deposit);
    if (!options.quiet) {
        console.log(`Calling function: ${options.contract}.${options.method}(${options.args || ''})` +
            (deposit && deposit != '0' ? ` with attached ${yoctoToNear(deposit)} NEAR` : ''));
    }
    const parsedArgs = JSON.parse(options.args || '{}');
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
        throw error;
    }
}
export default callCommand;
