import { Account, nearToYocto } from 'near-api-js';
import { AccountDoesNotExistActionError, NotEnoughBalanceError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { privateKeyOption } from '../../validation.js';
const command = {
    command: 'send-near <sender> <receiver> <amount>', aliases: ['send'], describe: 'Send NEAR tokens to an account',
    builder: yargs => yargs.positional('sender', { type: 'string', demandOption: true }).positional('receiver', { type: 'string', demandOption: true }).positional('amount', { type: 'string', demandOption: true })
        .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
    handler: (argv) => send(argv)
};
async function send(options) {
    const account = new Account(options.sender, getProvider(options.networkId), await signerFromOpts({ ...options, useAccount: options.sender }));
    try {
        console.log(`Sending ${options.amount} NEAR to ${options.receiver} from ${options.sender}`);
        const result = await account.transfer({ receiverId: options.receiver, amount: nearToYocto(options.amount) });
        console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    }
    catch (error) {
        if (error instanceof AccountDoesNotExistActionError)
            throw new Error(`Account ${options.receiver} does not exist on ${options.networkId}.`, { cause: error });
        if (error instanceof NotEnoughBalanceError)
            throw new Error(`Account ${options.sender} does not have enough balance to send ${options.amount} NEAR.`, { cause: error });
        throw error;
    }
}
export default command;
