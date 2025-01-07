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
