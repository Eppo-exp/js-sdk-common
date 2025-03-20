import ApiEndpoints from '../api-endpoints';
import FetchHttpClient, {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from '../http-client';

import { ConfigurationWireV1, IConfigurationWire } from './configuration-wire-types';

export type SdkOptions = {
  sdkName?: string;
  sdkVersion?: string;
  baseUrl?: string;
  fetchBandits?: boolean;
};

/**
 * Helper class for fetching and converting configuration from the Eppo API(s).
 */
export class ConfigurationWireHelper {
  private httpClient: IHttpClient;

  /**
   * Build a new ConfigurationHelper for the target SDK Key.
   * @param sdkKey
   * @param opts
   */
  public static build(
    sdkKey: string,
    opts: SdkOptions = { sdkName: 'js-client-sdk', sdkVersion: '4.0.0' },
  ) {
    const { sdkName, sdkVersion, baseUrl, fetchBandits } = opts;
    return new ConfigurationWireHelper(sdkKey, sdkName, sdkVersion, baseUrl, fetchBandits);
  }

  private constructor(
    sdkKey: string,
    targetSdkName = 'js-client-sdk',
    targetSdkVersion = '4.0.0',
    baseUrl?: string,
    private readonly fetchBandits = false,
  ) {
    const queryParams = {
      sdkName: targetSdkName,
      sdkVersion: targetSdkVersion,
      apiKey: sdkKey,
      sdkProxy: 'config-wire-helper',
    };
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams,
    });

    this.httpClient = new FetchHttpClient(apiEndpoints, 5000);
  }

  /**
   * Fetches configuration data from the API and build a Bootstrap Configuration (aka an `IConfigurationWire` object).
   * The IConfigurationWire instance can be used to bootstrap some SDKs.
   */
  public async fetchConfiguration(): Promise<IConfigurationWire> {
    // Get the configs
    let banditResponse: IBanditParametersResponse | undefined;
    const configResponse: IUniversalFlagConfigResponse | undefined =
      await this.httpClient.getUniversalFlagConfiguration();

    if (!configResponse?.flags) {
      console.warn('Unable to fetch configuration, returning empty configuration');
      return Promise.resolve(ConfigurationWireV1.empty());
    }

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    if (this.fetchBandits && flagsHaveBandits) {
      banditResponse = await this.httpClient.getBanditParameters();
    }

    return ConfigurationWireV1.fromResponses(configResponse, banditResponse);
  }
}
