import { Account, actions, JsonRpcProvider, nearToYocto, teraToGas } from 'near-api-js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import fs from 'node:fs';
import { DEFAULT_NETWORK, getConfig } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
const deployCommand = {
    command: 'deploy <accountId> <wasmFile>',
    describe: 'Deploy a contract to an existing account (optionally initializing it)',
    builder: (yargs) => yargs
        .positional('accountId', {
        desc: 'Account to deploy the contract to',
        type: 'string',
        demandOption: true
    })
        .positional('wasmFile', {
        desc: 'Path to wasm file to deploy',
        type: 'string',
        demandOption: true
    })
        .option('initFunction', {
        desc: 'Initialization method',
        type: 'string'
    })
        .option('initArgs', {
        desc: 'Initialization arguments (JSON format)',
        type: 'string'
    })
        .option('initGas', {
        desc: 'Gas for initialization call (default: 30 TGas)',
        type: 'string',
        default: teraToGas('30').toString()
    })
        .option('initDeposit', {
        desc: 'Deposit in NEAR to send for initialization call (default: 0)',
        type: 'string',
        default: '0'
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
        .option('privateKey', {
        desc: 'Access key to use for signing',
        type: 'string',
        default: null
    })
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    })
        .option('force', {
        desc: 'Forcefully deploy the contract',
        type: 'boolean',
        default: false
    }),
    handler: (argv) => deployContract(argv)
};
async function askOverrideContract(prevCodeHash) {
    if (prevCodeHash !== '11111111111111111111111111111111') {
        const rl = createInterface({ input, output });
        try {
            const answer = await rl.question(`This account already has a deployed contract [ ${prevCodeHash} ]. Do you want to proceed? (y/n) `);
            return ['y', 'yes'].includes(answer.trim().toLowerCase());
        }
        finally {
            rl.close();
        }
    }
    return true;
}
async function deployContract(options) {
    const provider = new JsonRpcProvider({ url: getConfig(options.networkId).nodeUrl ?? '' });
    const signer = await signerFromOpts({
        useAccount: options.accountId,
        privateKey: options.privateKey,
        signWithLedger: options.signWithLedger,
        ledgerPath: options.ledgerPath,
        networkId: options.networkId
    });
    const account = new Account(options.accountId, provider, signer);
    const prevState = await account.getState();
    const prevCodeHash = prevState.codeHash;
    if (!options.force && !(await askOverrideContract(prevCodeHash))) {
        return;
    }
    console.log(`Deploying contract ${options.wasmFile} to ${options.accountId}`);
    // Validate init args/function combination
    if (options.initArgs && !options.initFunction) {
        console.error('Must add initialization function.');
        process.exit(1);
    }
    if (options.initFunction && !options.initArgs) {
        console.error('Must add initialization arguments.\nExample: near deploy near.testnet ./out/contract.wasm --initFunction "new" --initArgs \'{"key": "value"}\'');
        process.exit(1);
    }
    // Read WASM file
    const wasmBytes = fs.readFileSync(options.wasmFile);
    // Build actions
    const txActions = [actions.deployContract(wasmBytes)];
    if (options.initFunction) {
        const parsedArgs = JSON.parse(options.initArgs);
        txActions.push(actions.functionCall(options.initFunction, parsedArgs, BigInt(options.initGas), nearToYocto(options.initDeposit)));
    }
    const result = await account.signAndSendTransaction({
        receiverId: options.accountId,
        actions: txActions
    });
    console.log(`Done deploying ${options.initFunction ? 'and initializing' : 'to'} ${options.accountId}`);
    console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value));
}
export default deployCommand;
