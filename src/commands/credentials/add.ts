import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { parseSeedPhrase } from 'near-api-js/seed-phrase';
import { DEFAULT_NETWORK } from '../../../config.js';
import { storeCredentials } from '../../utils.js';
import { privateKey, seedPhrase } from '../../validation.js';

type Options = { accountId: string; secretKey?: string; seedPhrase?: string; networkId: string; force: boolean };

const command: CommandModule<object, Options> = {
  command: 'add-credentials <accountId>', aliases: ['import-key'], describe: 'Store account credentials locally',
  builder: yargs => yargs.positional('accountId', { type: 'string', demandOption: true })
    .option('secretKey', { type: 'string', conflicts: 'seedPhrase', coerce: privateKey })
    .option('seedPhrase', { type: 'string', conflicts: 'secretKey', coerce: seedPhrase })
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK })
    .option('force', { type: 'boolean', default: false })
    .check(argv => { if (!argv.secretKey && !argv.seedPhrase) throw new Error('Provide --secretKey or --seedPhrase.'); return true; }),
  handler: (argv: ArgumentsCamelCase<Options>) => {
    if (!argv.secretKey && !argv.seedPhrase) throw new Error('Provide --secretKey or --seedPhrase.');
    const keyPair = argv.seedPhrase ? parseSeedPhrase(argv.seedPhrase) : KeyPair.fromString(argv.secretKey as KeyPairString);
    if (storeCredentials(argv.accountId, argv.networkId, keyPair, argv.force)) {
      console.log(`Stored credentials for ${argv.accountId} on ${argv.networkId}.`);
    }
  }
};
export default command;
