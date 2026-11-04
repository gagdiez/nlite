import { Account } from 'near-api-js';
import { AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { privateKeyOption } from '../../validation.js';
import { confirmAll } from '../../confirm.js';
const deleteCommand = {
    command: 'delete-account <accountId> <beneficiaryId>',
    aliases: ['delete'],
    describe: 'Delete account, sending remaining NEAR to a beneficiary',
    builder: (yargs) => yargs
        .positional('accountId', {
        desc: 'Account to delete',
        type: 'string',
        demandOption: true
    })
        .positional('beneficiaryId', {
        desc: 'Beneficiary account that receives remaining NEAR',
        type: 'string',
        demandOption: true
    })
        .option('privateKey', privateKeyOption)
        .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
    })
        .option('force', {
        desc: 'Forcefully delete account even if it is unsafe to do so',
        type: 'boolean',
        default: false
    }),
    handler: (argv) => deleteAccount(argv)
};
async function confirmDelete(accountId, beneficiaryId) {
    return confirmAll([
        `This will delete ${accountId}, transferring remaining NEAR to ${beneficiaryId}. ` +
            'FTs, NFTs and other assets are not transferred and may be lost. Continue?'
    ]);
}
async function deleteAccount(options) {
    const provider = getProvider(options.networkId);
    try {
        await provider.viewAccount({ accountId: options.beneficiaryId });
    }
    catch (error) {
        if (error instanceof AccountDoesNotExistError) {
            console.error(`Beneficiary account ${options.beneficiaryId} does not exist. Please create it first.`);
            process.exit(1);
        }
        throw error;
    }
    if (!options.force && !(await confirmDelete(options.accountId, options.beneficiaryId))) {
        console.log(`Deletion of account ${options.accountId} was cancelled.`);
        return;
    }
    const signer = await signerFromOpts({ ...options, useAccount: options.accountId });
    const account = new Account(options.accountId, provider, signer);
    console.log(`Deleting account ${options.accountId}, beneficiary: ${options.beneficiaryId}`);
    await account.deleteAccount(options.beneficiaryId);
    console.log(`Account ${options.accountId} for network "${options.networkId}" was deleted.`);
}
export default deleteCommand;
