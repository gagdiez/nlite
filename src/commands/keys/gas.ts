import { nearToYocto } from 'near-api-js';
import type { CommandModule } from 'yargs';
import { DEFAULT_NETWORK } from '../../../config.js';
import { printResult, protocolAccount, type SigningOptions } from '../../protocol.js';
import { privateKeyOption, publicKey } from '../../validation.js';

type KeyOptions = { accountId: string; publicKey: string };
type FundOptions = SigningOptions & KeyOptions & { useAccount: string; amount: string };
type WithdrawOptions = SigningOptions & KeyOptions & { amount: string };

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
