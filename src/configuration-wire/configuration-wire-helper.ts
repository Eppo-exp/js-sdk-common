import ApiEndpoints from '../api-endpoints';
import FetchHttpClient, {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from '../http-client';

import { ConfigurationWireV1, IConfigurationWire } from './configuration-wire-types';

export type SdkOptions = {
  sdkName: string;
  sdkVersion: string;
  baseUrl?: string;
};

/**
 * Helper class for fetching and converting configuration from the Eppo API(s).
 */
export class ConfigurationWireHelper {
  private httpClient: IHttpClient;

  /**
   * Build a new ConfigurationHelper for the target SDK Key.
   * @param sdkKey
   */
  public static build(
    sdkKey: string,
    opts: SdkOptions = { sdkName: 'android', sdkVersion: '4.0.0' },
  ) {
    const { sdkName, sdkVersion, baseUrl } = opts;
    return new ConfigurationWireHelper(sdkKey, sdkName, sdkVersion, baseUrl);
  }

  private constructor(
    sdkKey: string,
    targetSdkName = 'android',
    targetSdkVersion = '4.0.0',
    baseUrl?: string,
  ) {
    const queryParams = {
      sdkName: targetSdkName,
      sdkVersion: targetSdkVersion,
      apiKey: sdkKey,
    };
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams,
    });

    this.httpClient = new FetchHttpClient(apiEndpoints, 5000);
  }
}
