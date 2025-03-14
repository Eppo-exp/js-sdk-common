import { IConfigurationStore } from './configuration-store/configuration-store';
import { IConfigurationWire } from './configuration-wire/configuration-wire-types';
import {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from './http-client';
import {
  ConfigStoreHydrationPacket,
  IConfiguration,
  StoreBackedConfiguration,
} from './i-configuration';
import { BanditVariation, BanditParameters, Flag, BanditReference } from './interfaces';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  private banditModelVersions: string[] = [];
  private readonly configuration: StoreBackedConfiguration;

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly flagConfigurationStore: IConfigurationStore<Flag>,
    private readonly banditVariationConfigurationStore: IConfigurationStore<
      BanditVariation[]
    > | null,
    private readonly banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ) {
    this.configuration = new StoreBackedConfiguration(
      this.flagConfigurationStore,
      this.banditVariationConfigurationStore,
      this.banditModelConfigurationStore,
    );
  }

  public setInitialConfiguration(configuration: IConfigurationWire): Promise<boolean> {
    const flags = JSON.parse(configuration.config?.response ?? '{}');
    const bandits = JSON.parse(configuration.bandits?.response ?? '{}');
    return this.hydrateConfigurationStores(flags, bandits);
  }

  public isFlagConfigExpired(): Promise<boolean> {
    return this.flagConfigurationStore.isExpired();
  }

  public getConfiguration(): IConfiguration {
    return this.configuration;
  }

  private async hydrateConfigurationStores(
    flagConfig: IUniversalFlagConfigResponse,
    banditResponse?: IBanditParametersResponse,
  ): Promise<boolean> {
    let banditVariationPacket: ConfigStoreHydrationPacket<BanditVariation[]> | undefined;
    let banditModelPacket: ConfigStoreHydrationPacket<BanditParameters> | undefined;
    const flagResponsePacket: ConfigStoreHydrationPacket<Flag> = {
      entries: flagConfig.flags,
      environment: flagConfig.environment,
      createdAt: flagConfig.createdAt,
      format: flagConfig.format,
    };

    if (banditResponse) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(flagConfig.banditReferences);

      banditVariationPacket = {
        entries: banditVariations,
        environment: flagConfig.environment,
        createdAt: flagConfig.createdAt,
        format: flagConfig.format,
      };

      if (banditResponse?.bandits) {
        banditModelPacket = {
          entries: banditResponse.bandits,
          environment: flagConfig.environment,
          createdAt: flagConfig.createdAt,
          format: flagConfig.format,
        };
      }
    }

    return await this.configuration.hydrateConfigurationStores(
      flagResponsePacket,
      banditVariationPacket,
      banditModelPacket,
    );
  }

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    let banditResponse: IBanditParametersResponse | undefined;
    if (!configResponse?.flags) {
      return;
    }

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    const banditStoresProvided = Boolean(
      this.banditVariationConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      if (
        this.requiresBanditModelConfigurationStoreUpdate(
          this.banditModelVersions,
          configResponse.banditReferences,
        )
      ) {
        banditResponse = await this.httpClient.getBanditParameters();
      }
    }

    if (await this.hydrateConfigurationStores(configResponse, banditResponse)) {
      this.banditModelVersions = this.getLoadedBanditModelVersions(this.configuration.getBandits());
      // TODO: Notify that config updated.
    }
  }

  private getLoadedBanditModelVersions(entries: Record<string, BanditParameters>): string[] {
    return Object.values(entries).map((banditParam: BanditParameters) => banditParam.modelVersion);
  }

  private requiresBanditModelConfigurationStoreUpdate(
    currentBanditModelVersions: string[],
    banditReferences: Record<string, BanditReference>,
  ): boolean {
    const referencedModelVersions = Object.values(banditReferences).map(
      (banditReference: BanditReference) => banditReference.modelVersion,
    );

    return !referencedModelVersions.every((modelVersion) =>
      currentBanditModelVersions.includes(modelVersion),
    );
  }

  private indexBanditVariationsByFlagKey(
    banditVariationsByBanditKey: Record<string, BanditReference>,
  ): Record<string, BanditVariation[]> {
    const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
    Object.values(banditVariationsByBanditKey).forEach((banditReference) => {
      banditReference.flagVariations.forEach((banditVariation) => {
        let banditVariations = banditVariationsByFlagKey[banditVariation.flagKey];
        if (!banditVariations) {
          banditVariations = [];
          banditVariationsByFlagKey[banditVariation.flagKey] = banditVariations;
        }
        banditVariations.push(banditVariation);
      });
    });
    return banditVariationsByFlagKey;
  }
}
