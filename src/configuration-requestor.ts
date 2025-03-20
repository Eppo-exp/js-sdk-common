import { Configuration } from './configuration';
import { ConfigurationStore } from './configuration-store';
import { IHttpClient } from './http-client';

export type ConfigurationRequestorOptions = {
  wantsBandits?: boolean;
};

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  private readonly options: ConfigurationRequestorOptions;

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly configurationStore: ConfigurationStore,
    options: Partial<ConfigurationRequestorOptions> = {},
  ) {
    this.options = {
      wantsBandits: true,
      ...options,
    };
  }

  async fetchConfiguration(): Promise<Configuration | null> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.response.flags) {
      return null;
    }

    const needsBandits =
      this.options.wantsBandits &&
      Object.keys(configResponse.response.banditReferences ?? {}).length > 0;

    const banditsConfig = needsBandits ? await this.httpClient.getBanditParameters() : undefined;

    return Configuration.fromResponses({
      flags: configResponse,
      bandits: banditsConfig,
    });
  }

  async fetchAndStoreConfigurations(): Promise<void> {
    const configuration = await this.fetchConfiguration();
    if (configuration) {
      this.configurationStore.setConfiguration(configuration);
    }
  }
}
