import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import {
  ConfigStoreHydrationPacket,
  IConfiguration,
  StoreBackedConfiguration,
} from './i-configuration';
import { BanditVariation, BanditParameters, Flag, BanditReference, Switchback } from './interfaces';
import { SwitchbackSubjectAttributeValues } from './types';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  private banditModelVersions: string[] = [];
  private configuration: StoreBackedConfiguration;

  constructor(
    private readonly httpClient: IHttpClient,
    private flagConfigurationStore: IConfigurationStore<Flag>,
    private banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]> | null,
    private banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
    private switchbackConfigurationStore: IConfigurationStore<Switchback> | null,
    private switchbackSubjectAttributesConfigurationStore: IConfigurationStore<SwitchbackSubjectAttributeValues> | null,
  ) {
    this.configuration = new StoreBackedConfiguration(
      this.flagConfigurationStore,
      this.banditVariationConfigurationStore,
      this.banditModelConfigurationStore,
      this.switchbackConfigurationStore,
      this.switchbackSubjectAttributesConfigurationStore,
    );
  }

  /**
   * Updates the configuration stores and recreates the StoreBackedConfiguration
   */
  public setConfigurationStores(
    flagConfigurationStore: IConfigurationStore<Flag>,
    banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]> | null,
    banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
    switchbackConfigurationStore: IConfigurationStore<Switchback> | null,
    switchbackSubjectAttributesConfigurationStore: IConfigurationStore<SwitchbackSubjectAttributeValues> | null,
  ): void {
    this.flagConfigurationStore = flagConfigurationStore;
    this.banditVariationConfigurationStore = banditVariationConfigurationStore;
    this.banditModelConfigurationStore = banditModelConfigurationStore;
    this.switchbackConfigurationStore = switchbackConfigurationStore;
    this.switchbackSubjectAttributesConfigurationStore =
      switchbackSubjectAttributesConfigurationStore;

    // Recreate the configuration with the new stores
    this.configuration = new StoreBackedConfiguration(
      this.flagConfigurationStore,
      this.banditVariationConfigurationStore,
      this.banditModelConfigurationStore,
      this.switchbackConfigurationStore,
      this.switchbackSubjectAttributesConfigurationStore,
    );
  }

  public isFlagConfigExpired(): Promise<boolean> {
    return this.flagConfigurationStore.isExpired();
  }

  public getConfiguration(): IConfiguration {
    return this.configuration;
  }

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      return;
    }

    const flagResponsePacket: ConfigStoreHydrationPacket<Flag> = {
      entries: configResponse.flags,
      environment: configResponse.environment,
      createdAt: configResponse.createdAt,
      format: configResponse.format,
    };

    let banditVariationPacket: ConfigStoreHydrationPacket<BanditVariation[]> | undefined;
    let banditModelPacket: ConfigStoreHydrationPacket<BanditParameters> | undefined;
    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    const banditStoresProvided = Boolean(
      this.banditVariationConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(configResponse.banditReferences);

      banditVariationPacket = {
        entries: banditVariations,
        environment: configResponse.environment,
        createdAt: configResponse.createdAt,
        format: configResponse.format,
      };

      if (
        this.requiresBanditModelConfigurationStoreUpdate(
          this.banditModelVersions,
          configResponse.banditReferences,
        )
      ) {
        const banditResponse = await this.httpClient.getBanditParameters();
        if (banditResponse?.bandits) {
          banditModelPacket = {
            entries: banditResponse.bandits,
            environment: configResponse.environment,
            createdAt: configResponse.createdAt,
            format: configResponse.format,
          };

          this.banditModelVersions = this.getLoadedBanditModelVersions(banditResponse.bandits);
        }
      }
    }

    if (
      await this.configuration.hydrateConfigurationStores(
        flagResponsePacket,
        banditVariationPacket,
        banditModelPacket,
      )
    ) {
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
