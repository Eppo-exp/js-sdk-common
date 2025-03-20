import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { ConfigurationStore } from '../configuration-store';
import FetchHttpClient from '../http-client';

export async function initConfiguration(configurationStore: ConfigurationStore) {
  const apiEndpoints = new ApiEndpoints({
    baseUrl: 'http://127.0.0.1:4000',
    queryParams: {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '3.0.0',
    },
  });
  const httpClient = new FetchHttpClient(apiEndpoints, 1000);
  const configurationRequestor = new ConfigurationRequestor(httpClient, configurationStore);
  await configurationRequestor.fetchAndStoreConfigurations();
}
