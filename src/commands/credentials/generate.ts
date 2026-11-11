import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { KeyPair, keyToImplicitAddress, UniversalStateInit } from 'near-api-js';
import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase';
import { DEFAULT_NETWORK } from '../../../config.js';
import { storeCredentials } from '../../utils.js';
import { seedPhrase } from '../../validation.js';

type Options = { curve?: 'ed25519' | 'secp256k1' | 'ml-dsa-65'; saveUniversal?: boolean; accountId?: string; fromSeedPhrase?: string; saveImplicit: boolean; networkId: string; force: boolean };
const command: CommandModule<object, Options> = {
  command: 'generate-key [accountId]', describe: 'Create and display a key pair (optionally save it)',
  builder: yargs => yargs.positional('accountId', { type: 'string' })
    .option('fromSeedPhrase', { alias: 'seedPhrase', type: 'string', coerce: seedPhrase })
    .option('curve', { choices: ['ed25519', 'secp256k1', 'ml-dsa-65'] as const, default: 'ed25519' as const })
    .option('saveUniversal', { type: 'boolean', default: false, desc: 'Save credentials under the key-only universal account ID' })
    .check(options => {
      if (options.fromSeedPhrase && options.curve !== 'ed25519') throw new Error('--fromSeedPhrase requires --curve ed25519.');
      if (options.saveImplicit && options.curve !== 'ed25519') throw new Error('--saveImplicit requires --curve ed25519; use --saveUniversal for other curves.');
      return true;
    })
    .option('saveImplicit', { type: 'boolean', default: false })
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK })
    .option('force', { type: 'boolean', default: false }),
  handler: (argv: ArgumentsCamelCase<Options>) => generate(argv)
};
async function generate(options: Options): Promise<void> {
  const curve = options.curve ?? 'ed25519';
  let keyPair: KeyPair;
  if (curve === 'ed25519') {
    const seedPhrase = options.fromSeedPhrase ?? generateSeedPhrase().seedPhrase;
    keyPair = parseSeedPhrase(seedPhrase);
    console.log(`Seed phrase: ${seedPhrase}`);
  } else keyPair = KeyPair.fromRandom(curve);
  console.log(`Key pair: ${JSON.stringify({ publicKey: keyPair.getPublicKey().toString(), secretKey: keyPair.toString() })}`);
  const universal = new UniversalStateInit({ accessKeys: [keyPair.getPublicKey()] }).deriveAccountId();
  console.log(`Universal account: ${universal}`);
  const implicit = curve === 'ed25519' ? keyToImplicitAddress(keyPair.getPublicKey()) : undefined;
  if (implicit) console.log(`Implicit account: ${implicit}`);
  if (options.saveUniversal) storeCredentials(universal, options.networkId, keyPair, options.force);
  if (options.accountId) storeCredentials(options.accountId, options.networkId, keyPair, options.force);
  if (options.saveImplicit && implicit) storeCredentials(implicit, options.networkId, keyPair, options.force);
}
export default command;
