import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { Account, JsonRpcProvider } from 'near-api-js';
import { AccountDoesNotExistError } from 'near-api-js/rpc-errors';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { DEFAULT_NETWORK, getConfig } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';

type DeleteOptions = {
  accountId: string;
  beneficiaryId: string;
  signWithLedger?: boolean;
  ledgerPath: string;
  networkId: string;
  privateKey?: string | null;
  force?: boolean;
};

const deleteCommand: CommandModule<object, DeleteOptions> = {
  command: 'delete-account <accountId> <beneficiaryId>',
  aliases: ['delete'],
  describe: 'Delete account, sending remaining NEAR to a beneficiary',
  builder: (yargs) =>
    yargs
      .positional('accountId', {
        desc: 'Account to delete',
        type: 'string',
        demandOption: true
      })
      .positional('beneficiaryId', {
        desc: 'Beneficiary account that receives remaining NEAR',
        type: 'string',
        demandOption: true
      })
      .option('signWithLedger', {
        alias: ['useLedgerKey'],
        desc: 'Use Ledger for signing',
        type: 'boolean',
        default: false
      })
      .option('ledgerPath', {
        desc: 'HD key path',
        type: 'string',
        default: "44'/397'/0'/0'/1'"
      })
      .option('privateKey', {
        desc: 'Access key to use in the transaction',
        type: 'string',
        default: null
      })
      .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
      })
      .option('force', {
        desc: 'Forcefully delete account even if it is unsafe to do so',
        type: 'boolean',
        default: false
      }),
  handler: (argv: ArgumentsCamelCase<DeleteOptions>) => deleteAccount(argv)
};

async function confirmDelete(accountId: string, beneficiaryId: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `This will delete ${accountId}, transferring remaining NEAR to ${beneficiaryId}. ` +
      'FTs, NFTs and other assets are not transferred and may be lost. Continue? (y/n) '
    );
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function deleteAccount(options: DeleteOptions): Promise<void> {
  const provider = new JsonRpcProvider({ url: getConfig(options.networkId).nodeUrl ?? '' });

  try {
    await provider.viewAccount({ accountId: options.beneficiaryId });
  } catch (error) {
    if (error instanceof AccountDoesNotExistError) {
      console.error(`Beneficiary account ${options.beneficiaryId} does not exist. Please create it first.`);
      process.exit(1);
    }

    throw error;
  }

  if (!options.force && !(await confirmDelete(options.accountId, options.beneficiaryId))) {
    console.log(`Deletion of account ${options.accountId} was cancelled.`);
    return;
  }

  const signer = await signerFromOpts({ ...options, useAccount: options.accountId });
  const account = new Account(options.accountId, provider, signer);

  console.log(`Deleting account ${options.accountId}, beneficiary: ${options.beneficiaryId}`);
  await account.deleteAccount(options.beneficiaryId);
  console.log(`Account ${options.accountId} for network "${options.networkId}" was deleted.`);
}

export default deleteCommand;
