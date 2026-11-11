import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import {
    Account,
    JsonRpcProvider,
    KeyPair,
    nearToYocto,
    PublicKey,
    yoctoToNear,
} from 'near-api-js';
import { parseSeedPhrase } from 'near-api-js/seed-phrase';
import { AccountDoesNotExistError, CreateAccountNotAllowedActionError, CreateAccountOnlyByRegistrarActionError, NotEnoughBalanceError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider, getConfig } from '../../../config.js';
import { signerFromOpts, prepareAccountCredentials } from '../../utils.js';
import { publicKey, privateKeyOption, seedPhrase } from '../../validation.js';
import chalk from 'chalk';
import { createStateAccount } from './state-init.js';

const network2TLA: Record<string, string> = { testnet: 'testnet', mainnet: 'near' };

type CreateOptions = {
    newAccountId?: string;
    useFaucet?: boolean;
    useAccount?: string;
    initialBalance?: string;
    stateInit?: string;
    scheme?: 'deterministic' | 'universal';
    dataEncoding?: 'base64' | 'utf8';
    storageDeposit?: string;
    quiet?: boolean;
    publicKey?: string;
    seedPhrase?: string;
    networkId: string;
    privateKey?: string | null;
};

const createCommand: CommandModule<object, CreateOptions> = {
    command: 'create-account [newAccountId]',
    aliases: ['create'],
    describe: 'Create a new account',
    builder: (yargs) =>
        yargs
            .positional('newAccountId', {
                desc: 'Account to create (e.g. bob.testnet, sub.bob.testnet)',
                type: 'string',
            })
            .option('useFaucet', {
                desc: 'Pre-fund and create through helper service (testnet only)',
                type: 'boolean',
            })
            .option('useAccount', {
                alias: ['accountId', 'masterAccount'],
                desc: 'Account that funds and signs account creation',
                type: 'string'
            })
            .option('initialBalance', {
                desc: 'Number of tokens to transfer to a named account in NEAR (default: 1)',
                type: 'string',
            })
            .option('stateInit', { type: 'string', desc: 'Create a state-derived account from a JSON file; the SDK derives its ID' })
            .option('scheme', { choices: ['deterministic', 'universal'] as const, desc: 'State-init account scheme (default: deterministic)' })
            .option('dataEncoding', { choices: ['base64', 'utf8'] as const, desc: 'Storage key/value encoding in the state-init file (default: base64)' })
            .option('storageDeposit', { type: 'string', desc: 'Maximum state-init storage deposit in NEAR (default: 1); unused funds are refunded' })
            .option('publicKey', {
                desc: 'Public key to initialize the account with',
                type: 'string',
                coerce: publicKey
            })
            .option('seedPhrase', {
                desc: "Seed phrase from which to derive the account's key",
                type: 'string',
                coerce: seedPhrase
            })
            .option('privateKey', privateKeyOption)
            .option('networkId', {
                desc: 'Which network to use. Supports: mainnet, testnet, custom',
                type: 'string',
                default: DEFAULT_NETWORK
            })
            .conflicts('publicKey', 'seedPhrase')
            .conflicts('useFaucet', 'useAccount')
            .conflicts('stateInit', ['newAccountId', 'useFaucet', 'publicKey', 'seedPhrase', 'initialBalance'])
            .implies('stateInit', 'useAccount')
            .implies('scheme', 'stateInit').implies('dataEncoding', 'stateInit').implies('storageDeposit', 'stateInit')
            .check(argv => {
                if (!argv.newAccountId && !argv.stateInit) throw new Error('Provide a newAccountId or --stateInit.');
                if (!argv.useFaucet && !argv.useAccount) throw new Error('Please specify either --useFaucet or --useAccount');
                if (argv.useFaucet && argv.networkId === 'mainnet') throw new Error('Pre-funding accounts is not possible on mainnet');
                return true;
            }),
    handler: (argv: ArgumentsCamelCase<CreateOptions>) => createAccount(argv)
};

async function assertAccountDoesNotExist(accountId: string, provider: JsonRpcProvider): Promise<void> {
    try {
        await provider.viewAccount({ accountId });
        throw new Error(`Sorry, account '${accountId}' already exists.`);
    } catch (error) {
        if (error instanceof AccountDoesNotExistError) {
            return;
        }

        throw error;
    }
}

async function createWithFaucet(options: CreateOptions, publicKey: string) {
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

async function createAccount(options: CreateOptions): Promise<void> {
    if (options.stateInit) {
        return createStateAccount({
            ...options,
            stateInit: options.stateInit,
            useAccount: options.useAccount!,
            scheme: options.scheme ?? 'deterministic',
            dataEncoding: options.dataEncoding ?? 'base64',
            storageDeposit: options.storageDeposit ?? '1',
        });
    }
    if (!options.newAccountId) throw new Error('Provide a newAccountId or --stateInit.');
    const provider = getProvider(options.networkId);

    if (!options.useFaucet && !options.useAccount) {
        throw new Error('Please specify either --useFaucet or --useAccount');
    }

    await assertAccountDoesNotExist(options.newAccountId, provider);

    let generatedKeyPair: KeyPair | null = null;
    let accountPublicKey = options.publicKey;

    if (options.seedPhrase) {
        const parsed = parseSeedPhrase(options.seedPhrase);
        generatedKeyPair = parsed;
        accountPublicKey = generatedKeyPair.getPublicKey().toString();
    }

    if (!accountPublicKey) {
        generatedKeyPair = KeyPair.fromRandom('ed25519');
        accountPublicKey = generatedKeyPair.getPublicKey().toString();
    }

    const signer = options.useFaucet ? undefined : await signerFromOpts({ ...options, useAccount: options.useAccount! });
    // Save a recovery copy before sending anything. A timeout does not mean creation failed on-chain.
    const pending = generatedKeyPair ? prepareAccountCredentials(options.newAccountId, options.networkId, generatedKeyPair) : undefined;

    try {
        if (options.useFaucet) {
            await createWithFaucet(options, accountPublicKey);
        } else {
            const account = new Account(options.useAccount!, provider, signer);
            await account.createAccount({
                newAccountId: options.newAccountId,
                publicKey: PublicKey.from(accountPublicKey),
                nearToTransfer: nearToYocto((options.initialBalance ?? '1') as `${number}`),
            });
        }

        if (pending) {
            pending.commit();
        } else {
            console.log('Public key was provided, so we are not storing credentials (since we don\'t have the private key)');
            console.log('If you have the private key, you can import it using `near add-credentials`');
        }

        if (options.useFaucet) {
            await provider.viewAccount({ accountId: options.newAccountId });
        }
    } catch (error) {
        if (pending && !pending.committed) {
            console.error(`The key for this creation attempt is preserved at ${pending.path}. Keep it until you confirm the account's status.`);
        }
        if (error instanceof CreateAccountNotAllowedActionError) {
            console.error(chalk`${options.useAccount} can only create sub-accounts of itself, or .${network2TLA[options.networkId]} accounts.\n`);
            process.exit(1);
        }
        if (error instanceof AccountDoesNotExistError) {
            console.error(chalk`\nThe faucet reported {bold.white no errors}, but we {bold.red cannot} find ${options.newAccountId}. Check if it exists with "near state ${options.newAccountId} --networkId ${options.networkId}".\n`);
            process.exit(1);
        }
        if (error instanceof NotEnoughBalanceError) {
            console.error(chalk`\n{red.bold Error:} ${options.useAccount} does not have enough balance.`);
            console.error(`Transaction hash: ${error.txHash}`);
            console.error(`Signer: ${error.signerId}`);
            console.error(`Balance: ${yoctoToNear(error.balance)}`);
            console.error(`Required balance: ${yoctoToNear(error.cost)}`);
            process.exit(1);
        }
        if (error instanceof CreateAccountOnlyByRegistrarActionError) {
            console.error(chalk`\nYou cannot create Top Level Accounts.`);
            process.exit(1);
        }
        throw error;
    }
            
}

export default createCommand;
