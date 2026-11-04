import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import { Account, actions, nearToYocto, teraToGas } from 'near-api-js';
import fs from 'node:fs';
import { DEFAULT_NETWORK, getProvider } from '../../../config.js';
import { signerFromOpts } from '../../utils.js';
import { privateKeyOption } from '../../validation.js';
import { confirmAll } from '../../confirm.js';

type DeployOptions = {
  accountId: string;
  wasmFile: string;
  initFunction?: string;
  initArgs?: string;
  initGas: string;
  initDeposit: string;
  networkId: string;

  privateKey?: string | null;
  force: boolean;
};

const deployCommand: CommandModule<object, DeployOptions> = {
  command: 'deploy <accountId> <wasmFile>',
  describe: 'Deploy a contract to an existing account (optionally initializing it)',
  builder: (yargs) =>
    yargs
      .positional('accountId', {
        desc: 'Account to deploy the contract to',
        type: 'string',
        demandOption: true
      })
      .positional('wasmFile', {
        desc: 'Path to wasm file to deploy',
        type: 'string',
        demandOption: true
      })
      .option('initFunction', {
        desc: 'Initialization method',
        type: 'string'
      })
      .option('initArgs', {
        desc: 'Initialization arguments (JSON format)',
        type: 'string'
      })
      .option('initGas', {
        desc: 'Gas for initialization call (default: 30 TGas)',
        type: 'string',
        default: teraToGas('30').toString()
      })
      .option('initDeposit', {
        desc: 'Deposit in NEAR to send for initialization call (default: 0)',
        type: 'string',
        default: '0'
      })
      .option('privateKey', privateKeyOption)
      .option('networkId', {
        desc: 'Which network to use. Supports: mainnet, testnet, custom',
        type: 'string',
        default: DEFAULT_NETWORK
      })
      .option('force', {
        desc: 'Forcefully deploy the contract',
        type: 'boolean',
        default: false
      })
      .implies('initArgs', 'initFunction').implies('initFunction', 'initArgs'),
  handler: (argv: ArgumentsCamelCase<DeployOptions>) => deployContract(argv)
};

async function askOverrideContract(prevCodeHash: string): Promise<boolean> {
  if (prevCodeHash !== '11111111111111111111111111111111') {
    return confirmAll([`This account already has a deployed contract [ ${prevCodeHash} ]. Do you want to proceed?`]);
  }
  return true;
}

async function deployContract(options: DeployOptions): Promise<void> {
  const provider = getProvider(options.networkId);
  const signer = await signerFromOpts({
    useAccount: options.accountId,
    privateKey: options.privateKey,
    networkId: options.networkId
  });

  const account = new Account(options.accountId, provider, signer);
  const prevState = await account.getState();
  const prevCodeHash = prevState.codeHash;

  if (!options.force && !(await askOverrideContract(prevCodeHash))) {
    return;
  }

  console.log(`Deploying contract ${options.wasmFile} to ${options.accountId}`);

  // Read WASM file
  const wasmBytes = fs.readFileSync(options.wasmFile);

  // Build actions
  const txActions = [actions.deployContract(wasmBytes)];

  if (options.initFunction) {
    const parsedArgs = JSON.parse(options.initArgs!);
    txActions.push(
      actions.functionCall(
        options.initFunction,
        parsedArgs,
        BigInt(options.initGas),
        nearToYocto(options.initDeposit as `${number}`)
      )
    );
  }

  const result = await account.signAndSendTransaction({
    receiverId: options.accountId,
    actions: txActions
  });

  console.log(`Done deploying ${options.initFunction ? 'and initializing' : 'to'} ${options.accountId}`);
  console.log(JSON.stringify(result, (_, value) => 
    typeof value === 'bigint' ? value.toString() : value
  ));
}

export default deployCommand;
