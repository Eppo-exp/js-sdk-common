# Common library for Eppo's JavaScript SDK
[![Test and lint SDK](https://github.com/Eppo-exp/js-sdk-common/actions/workflows/lint-test-sdk.yml/badge.svg)](https://github.com/Eppo-exp/js-sdk-common/actions/workflows/lint-test-sdk.yml)
[![](https://img.shields.io/npm/v/@eppo/js-client-sdk-common)](https://www.npmjs.com/package/@eppo/js-client-sdk-common)
[![](https://img.shields.io/static/v1?label=GitHub+Pages&message=API+reference&color=00add8)](https://eppo-exp.github.io/js-client-sdk/js-client-sdk-common.html)
[![](https://data.jsdelivr.com/v1/package/npm/@eppo/js-client-sdk-common/badge)](https://www.jsdelivr.com/package/npm/@eppo/js-client-sdk-common)

## Getting Started

Refer to our [SDK documentation](https://docs.geteppo.com/sdks/client-sdks/javascript) for how to install and use the SDK.

## Local development

To set up the package for local development, run `make prepare` after cloning the repository

## Troubleshooting

* Jest encountered an unexpected token
```
Details:

/.../node_modules/@eppo/js-client-sdk-common/node_modules/uuid/dist/esm-browser/index.js:1
({"Object.<anonymous>":function(module,exports,require,__dirname,__filename,jest){export { default as v1 } from './v1.js';
                                                                                  ^^^^^^
SyntaxError: Unexpected token 'export'
```
Add the following line to your `jest.config.js` file:
`transformIgnorePatterns: ['<rootDir>/node_modules/(?!(@eppo|uuid)/)'],`

### Installing local package

It may be useful to install the local version of this package as you develop the client SDK or Node SDK.
This can be done in two steps:
1. Open the directory with the client SDK you want to add this library to, and run `make prepare`
2. Add the local version of this library to the SDK you are developing by running `yarn add --force file:../js-client-sdk-common` (this assumes both repositories were cloned into the same directory)

### Publishing Releases

When publishing releases, the following rules apply:

- **Standard Release**: 
  - Create a release with tag format `vX.Y.Z` (e.g., `v4.3.5`)
  - Keep "Set as latest release" checked
  - Package will be published to NPM with the `latest` tag

- **Pre-release**:
  - Create a release with tag format `vX.Y.Z-label.N` (e.g., `v4.3.5-alpha.1`)
  - Check the "Set as pre-release" option
  - Package will be published to NPM with the pre-release label as its tag (e.g., `alpha.1`)

**Note**: The release will not be published if:
- A pre-release is marked as "latest"
- A pre-release label is used without checking "Set as pre-release"

## Tools

### Bootstrap Configuration

You can generate a bootstrap configuration string from either the command line or programmatically via the
ConfigurationWireHelper class.

The tool allows you to specify the target SDK this configuration will be used on. It is important to correctly specify
the intended SDK, as this determines whether the configuration is obfuscated (for client SDKs) or not (for server SDKs).

#### Command Line Usage

**Install as a project dependency:**
```bash
# Install as a dependency
npm install --save-dev @eppo/js-client-sdk-common
# or, with yarn
yarn add --dev @eppo/js-client-sdk-common

# Or via yarn
yarn bootstrap-config --key <sdkKey>
```

Common usage examples:
```bash
# Basic usage
yarn bootstrap-config --key <sdkKey> --output bootstrap-config.json

# With custom SDK name (default is 'js-client-sdk')
yarn bootstrap-config --key <sdkKey> --sdk android

# With custom base URL
yarn bootstrap-config --key <sdkKey> --base-url https://api.custom-domain.com

# Output configuration to stdout
yarn bootstrap-config --key <sdkKey> 

# Show help
yarn bootstrap-config --help
```

The tool accepts the following arguments:
- `--key, -k`: SDK key (required, can also be set via EPPO_SDK_KEY environment variable)
- `--sdk`: Target SDK name (default: 'js-client-sdk')
- `--base-url`: Custom base URL for the API
- `--output, -o`: Output file path (if not specified, outputs to console)
- `--help, -h`: Show help

#### Programmatic Usage
```typescript
import { ConfigurationHelper } from '@eppo/js-client-sdk-common';

async function getBootstrapConfig() {
  // Initialize the helper
  const helper = ConfigurationHelper.build(
    'your-sdk-key',
    {
      sdkName: 'android', // optional: target SDK name (default: 'js-client-sdk')
      baseUrl: 'https://api.custom-domain.com', // optional: custom base URL
    });

  // Fetch the configuration
  const config = await helper.fetchConfiguration();
  const configString = config.toString();

  // You are responsible to transport this string to the client
  const clientInitialData = {eppoConfig: eppoConfigString};

  // Client-side
  const client = getInstance();
  const initialConfig = configurationFromString(clientInitialData.eppoConfig);
  client.setInitialConfig(configurationFromString(configString));
}
```

The tool will output a JSON string containing the configuration wire format that can be used to bootstrap Eppo SDKs.
