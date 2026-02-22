import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import viewCommand from './commands/contract/view.js';
import callCommand from './commands/contract/call.js';
import deployCommand from './commands/contract/deploy.js';
import stateCommand from './commands/account/state.js';
import deleteAccountCommand from './commands/account/delete.js';
import createAccountCommand from './commands/account/create.js';
import listKeysCommand from './commands/keys/list.js';
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
