import { BanditsConfig, Configuration, FlagsConfig } from './configuration';
import { ConfigurationFeed, ConfigurationSource } from './configuration-feed';
import { IHttpClient } from './http-client';
import { ContextAttributes, FlagKey } from './types';

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/** @internal */
export type ConfigurationRequestorOptions = {
  wantsBandits: boolean;

  precomputed?: {
    subjectKey: string;
    subjectAttributes: ContextAttributes;
    banditActions?: Record<FlagKey, Record<string, ContextAttributes>>;
  };
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

  public async fetchConfiguration(): Promise<Configuration> {
    const configuration = this.options.precomputed
      ? await this.fetchPrecomputedConfiguration(this.options.precomputed)
      : await this.fetchRegularConfiguration();

    this.latestConfiguration = configuration;
    this.configurationFeed.broadcast(configuration, ConfigurationSource.Network);

    return configuration;
  }

  private async fetchRegularConfiguration(): Promise<Configuration> {
    const flags = await this.httpClient.getUniversalFlagConfiguration();
    if (!flags?.response.flags) {
      throw new ConfigurationError('empty response');
    }

    const bandits = await this.getBanditsFor(flags);

    return Configuration.fromResponses({ flags, bandits });
  }

  private async fetchPrecomputedConfiguration(
    precomputed: NonNullable<ConfigurationRequestorOptions['precomputed']>,
  ): Promise<Configuration> {
    const response = await this.httpClient.getPrecomputedFlags(precomputed);
    if (!response) {
      throw new ConfigurationError('empty response');
    }

    return Configuration.fromResponses({ precomputed: response });
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
