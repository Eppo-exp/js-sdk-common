declare const process: {
  exit: (code: number) => void;
  env: { [key: string]: string | undefined };
};

import * as fs from 'fs';

import type { CommandModule } from 'yargs';

import { ConfigurationHelper } from '../bootstrap';

export const bootstrapConfigCommand: CommandModule = {
  command: 'bootstrap-config',
  describe: 'Generate a bootstrap configuration string',
  builder: (yargs) => {
    return yargs.options({
      key: {
        type: 'string',
        description: 'SDK key',
        alias: 'k',
        default: process.env.EPPO_SDK_KEY,
      },
      sdk: {
        type: 'string',
        description: 'Target SDK name',
        default: 'android',
      },
      'base-url': {
        type: 'string',
        description: 'Base URL for the API',
      },
      output: {
        type: 'string',
        description: 'Output file path',
        alias: 'o',
      },
    });
  },
  handler: async (argv) => {
    if (!argv.key) {
      console.error('Error: SDK key is required');
      console.error('Provide it either as:');
      console.error('- Command line argument: --key <sdkKey> or -k <sdkKey>');
      console.error('- Environment variable: EPPO_SDK_KEY');
      process.exit(1);
    }

    try {
      const helper = ConfigurationHelper.build(
        argv.key as string,
        argv.sdk as string,
        argv['base-url'] as string,
      );
      const config = await helper.getBootstrapConfigurationFromApi();

      if (!config) {
        console.error('Error: Failed to fetch configuration');
        process.exit(1);
      }

      const jsonConfig = JSON.stringify(config);

      if (argv.output && typeof argv.output === 'string') {
        fs.writeFileSync(argv.output, jsonConfig);
        console.log(`Configuration written to ${argv.output}`);
      } else {
        console.log('Configuration:');
        console.log('--------------------------------');
        console.log(jsonConfig);
        console.log('--------------------------------');
      }
    } catch (error) {
      console.error('Error fetching configuration:', error);
      process.exit(1);
    }
  },
};
