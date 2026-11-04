import { Account, PublicKey } from 'near-api-js';
import { DeleteKeyDoesNotExistActionError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { publicKey, privateKeyOption } from '../../validation.js';
import { confirmAll } from '../../confirm.js';
const command = {
    command: 'delete-key <accountId> <accessKey>', describe: 'Delete an access key',
    builder: yargs => yargs.positional('accountId', { type: 'string', demandOption: true }).positional('accessKey', { type: 'string', demandOption: true, coerce: publicKey })
        .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }).option('force', { type: 'boolean', default: false }),
    handler: (argv) => deleteKey(argv)
};
async function deleteKey(options) {
    const provider = getProvider(options.networkId);
    const keys = await provider.viewAccessKeyList({ accountId: options.accountId });
    const target = keys.keys.find(key => key.public_key === options.accessKey);
    if (!target) {
        console.log(`Key ${options.accessKey} does not exist on ${options.accountId}.`);
        return;
    }
    if (!options.force && target.access_key.permission === 'FullAccess') {
        const fullAccessCount = keys.keys.filter(key => key.access_key.permission === 'FullAccess').length;
        const questions = [`Key ${options.accessKey} is a full-access key. Continue deleting it?`];
        if (fullAccessCount === 1)
            questions.push(`It is the last full-access key for ${options.accountId}; this can permanently lock the account. Continue?`);
        if (!(await confirmAll(questions)))
            return;
    }
    const account = new Account(options.accountId, provider, await signerFromOpts({ ...options, useAccount: options.accountId }));
    try {
        await account.deleteKey(PublicKey.from(options.accessKey));
        console.log(`Deleted key ${options.accessKey} from ${options.accountId}.`);
    }
    catch (error) {
        if (error instanceof DeleteKeyDoesNotExistActionError) {
            console.log(`Key ${options.accessKey} does not exist on ${options.accountId}.`);
            return;
        }
        throw error;
    }
}
export default command;
