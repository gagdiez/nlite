import { Account, JsonRpcProvider, KeyPair, nearToYocto, PublicKey, yoctoToNear, } from 'near-api-js';
import { parseSeedPhrase } from 'near-api-js/seed-phrase';
import { AccountDoesNotExistError, CreateAccountNotAllowedActionError, CreateAccountOnlyByRegistrarActionError, NotEnoughBalanceError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getConfig } from '../../../config.js';
import { LedgerSigner } from '../../signers/ledger.js';
import { signerFromOpts, storeCredentials } from '../../utils.js';
import chalk from 'chalk';
const network2TLA = { testnet: 'testnet', mainnet: 'near' };
const createCommand = {
    command: 'create-account <newAccountId>',
    aliases: ['create'],
    describe: 'Create a new account',
    builder: (yargs) => yargs
        .positional('newAccountId', {
        desc: 'Account to create (e.g. bob.testnet, sub.bob.testnet)',
        type: 'string',
        demandOption: true
    })
        .option('useFaucet', {
        desc: 'Pre-fund and create through helper service (testnet only)',
        type: 'boolean',
        default: false
    })
        .option('useAccount', {
        alias: ['accountId', 'masterAccount'],
        desc: 'Account that funds and signs account creation',
        type: 'string'
    })
        .option('initialBalance', {
        desc: 'Number of tokens to transfer to the new account (in NEAR)',
        type: 'string',
        default: '1'
    })
        .option('publicKey', {
        desc: 'Public key to initialize the account with',
        type: 'string'
    })
        .option('seedPhrase', {
        desc: "Seed phrase from which to derive the account's key",
        type: 'string'
    })
        .option('signWithLedger', {
        alias: ['useLedgerKey'],
        desc: 'Use Ledger for signing',
        type: 'boolean',
        default: false
    })
        .option('ledgerPath', {
        desc: 'Path to the Ledger key used for signing',
        type: 'string',
        default: "44'/397'/0'/0'/1'"
    })
        .option('useLedgerPK', {
        alias: ['newLedgerKey'],
        desc: 'Initialize the new account with a public key from Ledger',
        type: 'boolean',
        default: false
    })
        .option('PkLedgerPath', {
        desc: 'Path to the Ledger key that will be added to the new account',
        type: 'string',
        default: "44'/397'/0'/0'/1'"
    })
        .option('privateKey', {
        desc: 'Access key to use for signing with --useAccount',
        type: 'string',
        default: null
    })
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    }),
    handler: (argv) => createAccount(argv)
};
async function assertAccountDoesNotExist(accountId, provider) {
    try {
        await provider.viewAccount({ accountId });
        throw new Error(`Sorry, account '${accountId}' already exists.`);
    }
    catch (error) {
        if (error instanceof AccountDoesNotExistError) {
            return;
        }
        throw error;
    }
}
async function createWithFaucet(options, publicKey) {
    if (options.networkId === 'mainnet') {
        throw new Error('Pre-funding accounts is not possible on mainnet');
    }
    const helperUrl = getConfig(options.networkId).helperUrl;
    if (!helperUrl) {
        throw new Error(`No helperUrl configured for network '${options.networkId}'`);
    }
    const response = await fetch(`${helperUrl}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            newAccountId: options.newAccountId,
            newAccountPublicKey: publicKey
        })
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Faucet/helper account creation failed (${response.status}): ${body}`);
    }
    console.log(`Requested faucet to create ${options.newAccountId}`);
}
async function createAccount(options) {
    const provider = new JsonRpcProvider({ url: getConfig(options.networkId).nodeUrl ?? '' });
    if (!options.useFaucet && !options.useAccount) {
        throw new Error('Please specify either --useFaucet or --useAccount');
    }
    if (options.useLedgerPK && options.publicKey) {
        throw new Error('Please specify only one of --useLedgerPK or --publicKey');
    }
    await assertAccountDoesNotExist(options.newAccountId, provider);
    let generatedKeyPair = null;
    let accountPublicKey = options.publicKey;
    if (options.useLedgerPK) {
        const ledgerSigner = new LedgerSigner(options.PkLedgerPath);
        accountPublicKey = (await ledgerSigner.getPublicKey()).toString();
    }
    if (options.seedPhrase) {
        const parsed = parseSeedPhrase(options.seedPhrase);
        generatedKeyPair = parsed;
        accountPublicKey = generatedKeyPair.getPublicKey().toString();
    }
    if (!accountPublicKey) {
        generatedKeyPair = KeyPair.fromRandom('ed25519');
        accountPublicKey = generatedKeyPair.getPublicKey().toString();
    }
    let createPromise;
    if (options.useFaucet) {
        createPromise = createWithFaucet(options, accountPublicKey);
    }
    else {
        const signer = await signerFromOpts({ ...options, useAccount: options.useAccount });
        const account = new Account(options.useAccount, provider, signer);
        createPromise = account.createAccount({
            newAccountId: options.newAccountId,
            publicKey: PublicKey.from(accountPublicKey),
            nearToTransfer: nearToYocto(options.initialBalance),
        });
    }
    try {
        await createPromise;
        if (generatedKeyPair) {
            storeCredentials(options.newAccountId, options.networkId, generatedKeyPair);
        }
        else {
            console.log('Public key was provided, so we are not storing credentials (since we don\'t have the private key)');
            console.log('If you have the private key, you can import it using `near add-credentials`');
        }
        if (options.useFaucet) {
            await provider.viewAccount({ accountId: options.newAccountId });
        }
    }
    catch (error) {
        if (error instanceof CreateAccountNotAllowedActionError) {
            console.error(chalk `${options.useAccount} can only create sub-accounts of itself, or .${network2TLA[options.networkId]} accounts.\n`);
            process.exit(1);
        }
        if (error instanceof AccountDoesNotExistError) {
            console.error(chalk `\nThe faucet reported {bold.white no errors}, but we {bold.red cannot} find ${options.newAccountId}. Check if it exists with "near state ${options.newAccountId} --networkId ${options.networkId}".\n`);
            process.exit(1);
        }
        if (error instanceof NotEnoughBalanceError) {
            console.error(chalk `\n{red.bold Error:} ${options.useAccount} does not have enough balance.`);
            console.error(`Transaction hash: ${error.txHash}`);
            console.error(`Signer: ${error.signerId}`);
            console.error(`Balance: ${yoctoToNear(error.balance)}`);
            console.error(`Required balance: ${yoctoToNear(error.cost)}`);
            process.exit(1);
        }
        if (error instanceof CreateAccountOnlyByRegistrarActionError) {
            console.error(chalk `\nYou cannot create Top Level Accounts.`);
            process.exit(1);
        }
        throw error;
    }
}
export default createCommand;
