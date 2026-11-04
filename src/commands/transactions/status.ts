import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';

type Options = { hash: string; accountId?: string; networkId: string };
const command: CommandModule<object, Options> = {
  command: 'tx-status <hash> [accountId]', describe: 'Look up a transaction by hash',
  builder: yargs => yargs.positional('hash', { type: 'string', demandOption: true }).positional('accountId', { type: 'string' }).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: (argv: ArgumentsCamelCase<Options>) => status(argv)
};
async function status(options: Options): Promise<void> {
  const parts = options.hash.split(':');
  if (parts.length > 2) throw new Error('Unexpected transaction hash format.');
  const [embeddedAccountId, hash] = parts.length === 2 ? parts : [undefined, parts[0]];
  const accountId = embeddedAccountId ?? options.accountId;
  if (!accountId) throw new Error('Specify the signer account ID as <accountId> or use accountId:hash.');
  const result = await getProvider(options.networkId).viewTransactionStatus({ txHash: hash, accountId });
  console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
export default command;
