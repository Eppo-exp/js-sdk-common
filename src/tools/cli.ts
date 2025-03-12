import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { bootstrapConfigCommand } from './commands/bootstrap-config';

declare const process: {
  argv: string[];
};

yargs(hideBin(process.argv))
  .command('sdk-tools', 'SDK tooling commands', (yargs) => {
    return yargs.command(bootstrapConfigCommand);
  })
  .demandCommand(1)
  .help()
  .alias('help', 'h')
  .parse();
