import { BanditsConfig, Configuration, FlagsConfig } from './configuration';
import { ConfigurationStore } from './configuration-store';
import { IHttpClient } from './http-client';

export type ConfigurationRequestorOptions = {
  wantsBandits: boolean;
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
    const flags = await this.httpClient.getUniversalFlagConfiguration();
    if (!flags?.response.flags) {
      return null;
    }

    const bandits = await this.getBanditsFor(flags);

    return Configuration.fromResponses({ flags, bandits });
  }

  async fetchAndStoreConfigurations(): Promise<void> {
    const configuration = await this.fetchConfiguration();
    if (configuration) {
      this.configurationStore.setConfiguration(configuration);
    }
  }

  /**
   * Get bandits configuration matching the flags configuration.
   *
   * This function does not fetch bandits if the client does not want
   * them (`ConfigurationRequestorOptions.wantsBandits === false`) or
   * we we can reuse bandit models from `ConfigurationStore`.
   */
  private async getBanditsFor(flags: FlagsConfig): Promise<BanditsConfig | undefined> {
    const needsBandits =
      this.options.wantsBandits && Object.keys(flags.response.banditReferences ?? {}).length > 0;
    if (!needsBandits) {
      return undefined;
    }

    const prevBandits = this.configurationStore.getConfiguration().getBanditConfiguration();
    const canReuseBandits = banditsUpToDate(flags, prevBandits);
    if (canReuseBandits) {
      return prevBandits;
    }

    return await this.httpClient.getBanditParameters();
  }
}

/**
 * Checks that bandits configuration matches the flags
 * configuration. This is done by checking that bandits configuration
 * has proper versions for all bandits references in flags
 * configuration.
 */
const banditsUpToDate = (flags: FlagsConfig, bandits: BanditsConfig | undefined): boolean => {
  const banditParams = bandits?.response.bandits ?? {};
  return Object.entries(flags.response.banditReferences ?? {}).every(
    ([banditKey, reference]) => reference.modelVersion === banditParams[banditKey]?.modelVersion,
  );
};
