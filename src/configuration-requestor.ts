import { BanditsConfig, Configuration, FlagsConfig } from './configuration';
import { ConfigurationFeed, ConfigurationSource } from './configuration-feed';
import { IHttpClient } from './http-client';

export type ConfigurationRequestorOptions = {
  wantsBandits: boolean;
};

/**
 * @internal
 */
export default class ConfigurationRequestor {
  private readonly options: ConfigurationRequestorOptions;

  // We track the latest seen configuration to possibly reuse it for flags/bandits.
  private latestConfiguration?: Configuration;

  public constructor(
    private readonly httpClient: IHttpClient,
    private readonly configurationFeed: ConfigurationFeed,
    options: Partial<ConfigurationRequestorOptions> = {},
  ) {
    this.options = {
      wantsBandits: true,
      ...options,
    };

    this.configurationFeed.addListener((configuration) => {
      const prevFetchedAt = this.latestConfiguration?.getFetchedAt();
      const newFetchedAt = configuration.getFetchedAt();

      if (!prevFetchedAt || (newFetchedAt && newFetchedAt > prevFetchedAt)) {
        this.latestConfiguration = configuration;
      }
    });
  }

  public async fetchConfiguration(): Promise<Configuration | null> {
    const flags = await this.httpClient.getUniversalFlagConfiguration();
    if (!flags?.response.flags) {
      return null;
    }

    const bandits = await this.getBanditsFor(flags);

    const configuration = Configuration.fromResponses({ flags, bandits });
    this.latestConfiguration = configuration;
    this.configurationFeed.broadcast(configuration, ConfigurationSource.Network);

    return configuration;
  }

  /**
   * Get bandits configuration matching the flags configuration.
   *
   * This function does not fetch bandits if the client does not want
   * them (`ConfigurationRequestorOptions.wantsBandits === false`) or
   * if we can reuse bandit models from `ConfigurationStore`.
   */
  private async getBanditsFor(flags: FlagsConfig): Promise<BanditsConfig | undefined> {
    const needsBandits =
      this.options.wantsBandits && Object.keys(flags.response.banditReferences ?? {}).length > 0;
    if (!needsBandits) {
      return undefined;
    }

    const prevBandits = this.latestConfiguration?.getBanditConfiguration();
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
