import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { bootstrapConfigCommand } from './commands/bootstrap-config';

/**
 * Script to run the bootstrap-config command directly.
 *
 * For usage, run: `ts-node src/tools/get-bootstrap-config.ts --help`
 */
async function main() {
  await yargs(hideBin(process.argv))
    .command({
      command: '$0',
      describe: bootstrapConfigCommand.describe,
      builder: bootstrapConfigCommand.builder,
      handler: bootstrapConfigCommand.handler,
    })
    .help()
    .alias('help', 'h')
    .parse();
}

main().catch((error) => {
  console.error('Error in main:', error);
  process.exit(1);
});
