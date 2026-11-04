import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';

type Options = { accountId: string; prefix: string; blockId?: string | number; finality?: 'optimistic' | 'final'; utf8: boolean; networkId: string };
const command: CommandModule<object, Options> = {
  command: 'storage <accountId> [prefix]', aliases: ['view-state'], describe: "View a contract's stored key-value pairs",
  builder: yargs => yargs.positional('accountId', { type: 'string', demandOption: true }).positional('prefix', { type: 'string', default: '' })
    .option('blockId', { type: 'string', coerce: (value: string) => /^\d+$/.test(value) ? Number(value) : value })
    .option('finality', { choices: ['optimistic', 'final'] as const }).option('utf8', { type: 'boolean', default: false })
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }).conflicts('blockId', 'finality').check(argv => { if (argv.blockId === undefined && !argv.finality) throw new Error('Must provide either --finality or --blockId'); return true; }),
  handler: (argv: ArgumentsCamelCase<Options>) => storage(argv)
};
async function storage(options: Options): Promise<void> {
  const blockQuery = options.blockId !== undefined ? { blockId: options.blockId } : { finality: options.finality! };
  const result = await getProvider(options.networkId).viewContractState({ contractId: options.accountId, prefix: options.prefix, blockQuery });
  const values = result.values.map(({ key, value }) => options.utf8 ? { key: Buffer.from(key, 'base64').toString('utf8'), value: Buffer.from(value, 'base64').toString('utf8') } : { key, value });
  console.log(JSON.stringify(values, null, 2));
}
export default command;
