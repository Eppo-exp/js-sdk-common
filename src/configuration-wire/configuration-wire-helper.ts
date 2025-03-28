import ApiEndpoints from '../api-endpoints';
import FetchHttpClient, {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from '../http-client';
import SdkTokenDecoder from '../sdk-token-decoder';

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
      sdkTokenDecoder: new SdkTokenDecoder(sdkKey),
    });

    this.httpClient = new FetchHttpClient(apiEndpoints, 5000);
  }

  /**
   * Fetches configuration data from the API and build a Bootstrap Configuration (aka an `IConfigurationWire` object).
   * The IConfigurationWire instance can be used to bootstrap some SDKs.
   */
  public async fetchBootstrapConfiguration(): Promise<IConfigurationWire> {
    // Get the configs
    let banditResponse: IBanditParametersResponse | undefined;
    const configResponse: IUniversalFlagConfigResponse | undefined =
      await this.httpClient.getUniversalFlagConfiguration();

    if (!configResponse?.flags) {
      console.warn('Unable to fetch configuration, returning empty configuration');
      return Promise.resolve(ConfigurationWireV1.empty());
    }

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    if (flagsHaveBandits) {
      banditResponse = await this.httpClient.getBanditParameters();
    }

    return ConfigurationWireV1.fromResponses(configResponse, banditResponse);
  }
}
