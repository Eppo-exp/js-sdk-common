# Common library for Eppo's JavasScript SDK

[![](https://img.shields.io/npm/v/@eppo/js-client-sdk-common)](https://www.npmjs.com/package/@eppo/js-client-sdk-common)
[![](https://img.shields.io/static/v1?label=GitHub+Pages&message=API+reference&color=00add8)](https://eppo-exp.github.io/js-client-sdk/js-client-sdk-common.html)
[![](https://data.jsdelivr.com/v1/package/npm/@eppo/js-client-sdk-common/badge)](https://www.jsdelivr.com/package/npm/@eppo/js-client-sdk-common)

## Getting Started

Refer to our [SDK documentation](https://docs.geteppo.com/sdks/client-sdks/javascript) for how to install and use the SDK.

## Local development

To set up the package for local development, run `make prepare` after cloning the repository

### Installing local package

It may be useful to install the local version of this package as you develop the client SDK or Node SDK.
This can be done in two steps:
1. Open the directory with the client SDK you want to add this library to, and run `make prepare`
2. Add the local version of this library to the SDK you are developing by running `yarn add --force file:../js-client-sdk-common` (this assumes both repositories were cloned into the same directory)
