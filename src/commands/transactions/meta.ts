import { actions, decodeSignedDelegate, encodeSignedDelegate, nearToYocto } from 'near-api-js';
import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK } from '../../../config.js';
import { printResult, protocolAccount, type SigningOptions } from '../../protocol.js';
import { base64Args, privateKeyOption } from '../../validation.js';

type SignOptions = SigningOptions & {
  accountId: string; contractId: string; method: string; args?: string;
  gas: string; deposit?: string; depositYocto?: string; base64: boolean; blockHeightTtl: number;
};
type RelayOptions = SigningOptions & { accountId: string; signedDelegate: string };

export const signMetaCallCommand: CommandModule<object, SignOptions> = {
  command: 'sign-meta-call <accountId> <contractId> <method> [args]',
  describe: 'Sign a delegated function call for a separate relayer to pay its gas (NEP-366)',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('contractId', { type: 'string', demandOption: true })
    .positional('method', { type: 'string', demandOption: true })
    .positional('args', { type: 'string' })
    .option('gas', { type: 'string', default: '30000000000000' })
    .option('deposit', { type: 'string', desc: 'Attached NEAR, paid by the delegating account' })
    .option('depositYocto', { type: 'string' }).conflicts('deposit', 'depositYocto')
    .option('base64', { type: 'boolean', default: false })
    .check(options => { if (options.base64) base64Args(options.args); return true; })
    .option('blockHeightTtl', { type: 'number', default: 200 })
    .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const args = options.base64 ? Buffer.from(options.args!, 'base64') : JSON.parse(options.args ?? '{}');
    const deposit = options.depositYocto === undefined ? nearToYocto((options.deposit ?? '0') as `${number}`) : BigInt(options.depositYocto);
    const account = await protocolAccount(options.accountId, options);
    const { signedDelegate } = await account.createSignedMetaTransaction({
      receiverId: options.contractId,
      actions: [actions.functionCall(options.method, args, BigInt(options.gas), deposit)],
      blockHeightTtl: options.blockHeightTtl,
    });
    console.log(Buffer.from(encodeSignedDelegate(signedDelegate)).toString('base64'));
  }
};

export const relayMetaCommand: CommandModule<object, RelayOptions> = {
  command: 'relay-meta-transaction <accountId> <signedDelegate>',
  describe: 'Submit a base64 signed delegate, paying gas from the relayer account',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true, desc: 'Relayer account' })
    .positional('signedDelegate', { type: 'string', demandOption: true, coerce: value => { base64Args(value); return value; } })
    .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const delegate = decodeSignedDelegate(Buffer.from(options.signedDelegate, 'base64'));
    const account = await protocolAccount(options.accountId, options);
    printResult(await account.relayMetaTransaction(delegate));
  }
};
