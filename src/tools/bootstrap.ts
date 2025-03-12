import ApiEndpoints from '../api-endpoints';
import { ConfigurationWireV1, IConfigurationWire } from '../configuration-wire-types';
import FetchHttpClient, {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from '../http-client';

/**
 * Helper class for fetching and converting configuration from the Eppo API(s).
 */
export class ConfigurationHelper {
  private httpClient: IHttpClient;

  /**
   * Build a new ConfigurationHelper for the target SDK Key.
   * @param sdkKey
   * @param targetSdkName
   * @param baseUrl
   */
  public static build(sdkKey: string, targetSdkName = 'android', baseUrl?: string) {
    return new ConfigurationHelper(sdkKey, targetSdkName, baseUrl);
  }

  private constructor(
    private readonly sdkKey: string,
    private readonly targetSdkName = 'android',
    private readonly targetSdkVersion = '4.0.0',
    private readonly baseUrl?: string,
  ) {
    const queryParams = {
      sdkName: this.targetSdkName,
      sdkVersion: this.targetSdkVersion,
      apiKey: this.sdkKey,
    };
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams,
    });

    this.httpClient = new FetchHttpClient(apiEndpoints, 5000);
  }

  /**
   * Builds an `IConfigurationWire` object from flag and bandit API responses.
   * The IConfigurationWire instance can be used to bootstrap some SDKs.
   */
  public async getBootstrapConfigurationFromApi(): Promise<IConfigurationWire> {
    // Get the configs
    let banditResponse: IBanditParametersResponse | undefined;
    const configResponse: IUniversalFlagConfigResponse | undefined =
      await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      console.warn('Unable to fetch configuration, returning empty configuration');
      return Promise.resolve(
        new ConfigurationWireV1({
          response: JSON.stringify({
            flags: {},
            environment: { name: '' },
            fetchedAt: '',
            publishedAt: '',
          }),
        }),
      );
    }

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    if (flagsHaveBandits) {
      banditResponse = await this.httpClient.getBanditParameters();
    }

    return ConfigurationWireV1.fromResponses(configResponse, banditResponse);
  }
}
