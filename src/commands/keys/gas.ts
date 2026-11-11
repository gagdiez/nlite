import { nearToYocto } from 'near-api-js';
import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { printResult, protocolAccount, type SigningOptions, type NetworkOptions } from '../../protocol.js';
import { privateKeyOption, publicKey } from '../../validation.js';

type KeyOptions = { accountId: string; publicKey: string };
type AddOptions = SigningOptions & KeyOptions & { numNonces: number; contractId?: string; methodNames?: string[] };
type FundOptions = SigningOptions & KeyOptions & { useAccount: string; amount: string };
type WithdrawOptions = SigningOptions & KeyOptions & { amount: string };

export const addGasKeyCommand: CommandModule<object, AddOptions> = {
  command: 'add-gas-key <accountId> <publicKey>',
  describe: 'Add a full-access or function-call gas key with independent nonce lanes',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('publicKey', { type: 'string', demandOption: true, coerce: publicKey })
    .option('numNonces', { type: 'number', default: 1, desc: 'Number of independent nonce lanes (protocol supports 1–1024)' })
    .option('contractId', { type: 'string', desc: 'Restrict the key to calls to this contract' })
    .option('methodNames', { type: 'array', string: true }).implies('methodNames', 'contractId')
    .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const account = await protocolAccount(options.accountId, options);
    printResult(options.contractId
      ? await account.addFunctionCallGasKey({ publicKey: options.publicKey, contractId: options.contractId, methodNames: options.methodNames ?? [], numNonces: options.numNonces })
      : await account.addFullAccessGasKey(options.publicKey, options.numNonces));
  }
};

export const fundGasKeyCommand: CommandModule<object, FundOptions> = {
  command: 'fund-gas-key <accountId> <publicKey> <amount>',
  describe: 'Fund a gas key with NEAR from the signing account',
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('publicKey', { type: 'string', demandOption: true, coerce: publicKey })
    .positional('amount', { type: 'string', demandOption: true, desc: 'Amount in NEAR' })
    .option('useAccount', { type: 'string', demandOption: true, desc: 'Account that supplies the funds and signs' })
    .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const account = await protocolAccount(options.useAccount, options);
    printResult(await account.transferToGasKey(options.accountId, options.publicKey, nearToYocto(options.amount as `${number}`)));
  }
};

export const withdrawGasKeyCommand: CommandModule<object, WithdrawOptions> = {
  command: 'withdraw-gas-key <accountId> <publicKey> <amount>',
  describe: "Return NEAR from a gas key to its owner's account balance",
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('publicKey', { type: 'string', demandOption: true, coerce: publicKey })
    .positional('amount', { type: 'string', demandOption: true, desc: 'Amount in NEAR' })
    .option('privateKey', privateKeyOption).option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => {
    const account = await protocolAccount(options.accountId, options);
    printResult(await account.withdrawFromGasKey(options.publicKey, nearToYocto(options.amount as `${number}`)));
  }
};

export const gasKeyNoncesCommand: CommandModule<object, NetworkOptions & KeyOptions> = {
  command: 'gas-key-nonces <accountId> <publicKey>',
  describe: "Query a gas key's independent nonce lanes",
  builder: yargs => yargs
    .positional('accountId', { type: 'string', demandOption: true })
    .positional('publicKey', { type: 'string', demandOption: true, coerce: publicKey })
    .option('networkId', { type: 'string', default: DEFAULT_NETWORK }),
  handler: async options => { printResult(await getProvider(options.networkId).viewGasKeyNonces({ accountId: options.accountId, publicKey: options.publicKey })); }
};
