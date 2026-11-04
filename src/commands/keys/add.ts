import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { Account, nearToYocto, PublicKey } from 'near-api-js';
import { AddKeyAlreadyExistsActionError } from 'near-api-js/rpc-errors';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { publicKey, privateKeyOption } from '../../validation.js';

type Options = { accountId: string; publicKey: string; contractId?: string; methodNames?: string[]; allowance?: string; networkId: string; privateKey?: string | null };
const command: CommandModule<object, Options> = {
  command: 'add-key <accountId> <publicKey>', describe: 'Add an access key to an account',
  builder: yargs => yargs.positional('accountId', { type: 'string', demandOption: true }).positional('publicKey', { type: 'string', demandOption: true, coerce: publicKey })
    .option('contractId', { type: 'string' }).option('methodNames', { type: 'array', string: true })
    .option('allowance', { type: 'string' })
    .option('privateKey', privateKeyOption)
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK })
    .implies('methodNames', 'contractId').implies('allowance', 'contractId'),
  handler: (argv: ArgumentsCamelCase<Options>) => addKey(argv)
};
async function addKey(options: Options): Promise<void> {
  const account = new Account(options.accountId, getProvider(options.networkId), await signerFromOpts({ ...options, useAccount: options.accountId }));
  const key = PublicKey.from(options.publicKey);
  try {
    if (options.contractId) await account.addFunctionCallAccessKey({ publicKey: key, contractId: options.contractId, methodNames: options.methodNames ?? [], allowance: nearToYocto((options.allowance ?? '0') as `${number}`) });
    else await account.addFullAccessKey(key);
    console.log(`Added ${options.contractId ? 'function-call' : 'full'} access key ${options.publicKey} to ${options.accountId}.`);
  } catch (error) { if (error instanceof AddKeyAlreadyExistsActionError) { console.log(`Access key ${options.publicKey} already exists in account ${options.accountId}.`); return; } throw error; }
}
export default command;
