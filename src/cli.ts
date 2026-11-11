import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import viewCommand from './commands/contract/view.js';
import callCommand from './commands/contract/call.js';
import deployCommand from './commands/contract/deploy.js';
import stateCommand from './commands/account/state.js';
import deleteAccountCommand from './commands/account/delete.js';
import createAccountCommand from './commands/account/create.js';
import listKeysCommand from './commands/keys/list.js';
import addKeyCommand from './commands/keys/add.js';
import deleteKeyCommand from './commands/keys/delete.js';
import addCredentialsCommand from './commands/credentials/add.js';
import generateKeyCommand from './commands/credentials/generate.js';
import storageCommand from './commands/contract/storage.js';
import sendCommand from './commands/transactions/send.js';
import statusCommand from './commands/transactions/status.js';
import { useGlobalCommand } from './commands/contract/global.js';
import viewCodeCommand from './commands/contract/code.js';
import { fundGasKeyCommand, withdrawGasKeyCommand } from './commands/keys/gas.js';

yargs(hideBin(process.argv))
  .strict()
  .scriptName('nlite')
  .command(viewCommand)
  .command(callCommand)
  .command(deployCommand)
  .command(stateCommand)
  .command(deleteAccountCommand)
  .command(createAccountCommand)
  .command(listKeysCommand)
  .command(addKeyCommand)
  .command(deleteKeyCommand)
  .command(addCredentialsCommand)
  .command(generateKeyCommand)
  .command(storageCommand)
  .command(sendCommand)
  .command(statusCommand)
  .command(useGlobalCommand)
  .command(viewCodeCommand)
  .command(fundGasKeyCommand)
  .command(withdrawGasKeyCommand)
  .option('quiet', {
    alias: ['q'],
    desc: 'Suppresses extra output',
    type: 'boolean',
    default: false
  })
  .showHelpOnFail(true)
  .recommendCommands()
  .demandCommand(1, 'Pass --help to see all available commands and options.')
  .usage('Usage: $0 <command> [options]')
  .wrap(null)
  .parse();
