import { keyToImplicitAddress } from 'near-api-js';
import { generateSeedPhrase, parseSeedPhrase } from 'near-api-js/seed-phrase';
import { DEFAULT_NETWORK } from '../../../config.js';
import { storeCredentials } from '../../utils.js';
import { seedPhrase } from '../../validation.js';
const command = {
    command: 'generate-key [accountId]', describe: 'Create and display a key pair (optionally save it)',
    builder: yargs => yargs.positional('accountId', { type: 'string' })
        .option('fromSeedPhrase', { alias: 'seedPhrase', type: 'string', coerce: seedPhrase })
        .option('saveImplicit', { type: 'boolean', default: false })
        .option('networkId', { type: 'string', default: DEFAULT_NETWORK })
        .option('force', { type: 'boolean', default: false }),
    handler: (argv) => generate(argv)
};
async function generate(options) {
    const seedPhrase = options.fromSeedPhrase ?? generateSeedPhrase().seedPhrase;
    const keyPair = parseSeedPhrase(seedPhrase);
    console.log(`Seed phrase: ${seedPhrase}`);
    console.log(`Key pair: ${JSON.stringify({ publicKey: keyPair.getPublicKey().toString(), secretKey: keyPair.toString() })}`);
    const implicit = keyToImplicitAddress(keyPair.getPublicKey());
    console.log(`Implicit account: ${implicit}`);
    if (options.accountId)
        storeCredentials(options.accountId, options.networkId, keyPair, options.force);
    if (options.saveImplicit)
        storeCredentials(implicit, options.networkId, keyPair, options.force);
}
export default command;
