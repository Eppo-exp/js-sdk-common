import ApiEndpoints from '../api-endpoints';
import { BroadcastChannel } from '../broadcast';
import { Configuration } from '../configuration';
import ConfigurationRequestor from '../configuration-requestor';
import FetchHttpClient from '../http-client';

export async function initConfiguration(): Promise<Configuration | null> {
  const apiEndpoints = new ApiEndpoints({
    baseUrl: 'http://127.0.0.1:4000',
    queryParams: {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '3.0.0',
    },
  });
  const httpClient = new FetchHttpClient(apiEndpoints, 1000);
  const configurationRequestor = new ConfigurationRequestor(httpClient, new BroadcastChannel());
  return await configurationRequestor.fetchConfiguration();
}
