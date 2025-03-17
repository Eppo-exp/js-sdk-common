import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { ConfigurationManager } from '../configuration-store/configuration-manager';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import FetchHttpClient from '../http-client';
import { Flag, ObfuscatedFlag } from '../interfaces';

export async function initConfiguration(
  configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
) {
  const apiEndpoints = new ApiEndpoints({
    baseUrl: 'http://127.0.0.1:4000',
    queryParams: {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '3.0.0',
    },
  });
  const httpClient = new FetchHttpClient(apiEndpoints, 1000);
  const configurationRequestor = new ConfigurationRequestor(
    httpClient,
    new ConfigurationManager(configurationStore),
    false,
  );
  await configurationRequestor.fetchAndStoreConfigurations();
}
