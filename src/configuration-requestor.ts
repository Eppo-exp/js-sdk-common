import { IConfigurationStore } from './configuration-store/configuration-store';
import { hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { IHttpClient } from './http-client';
import { BanditVariation, BanditParameters, Flag, BanditReference } from './interfaces';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  private banditModelVersions: string[] = [];

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly flagConfigurationStore: IConfigurationStore<Flag>,
    private readonly banditVariationConfigurationStore: IConfigurationStore<
      BanditVariation[]
    > | null,
    private readonly banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ) {}

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      return;
    }

    await hydrateConfigurationStore(this.flagConfigurationStore, {
      entries: configResponse.flags,
      environment: configResponse.environment,
      createdAt: configResponse.createdAt,
      format: configResponse.format,
    });

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    const banditStoresProvided = Boolean(
      this.banditVariationConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(configResponse.banditReferences);

      await hydrateConfigurationStore(this.banditVariationConfigurationStore, {
        entries: banditVariations,
        environment: configResponse.environment,
        createdAt: configResponse.createdAt,
        format: configResponse.format,
      });

      if (
        this.requiresBanditModelConfigurationStoreUpdate(
          this.banditModelVersions,
          configResponse.banditReferences,
        )
      ) {
        const banditResponse = await this.httpClient.getBanditParameters();
        if (banditResponse?.bandits) {
          await hydrateConfigurationStore(this.banditModelConfigurationStore, {
            entries: banditResponse.bandits,
            environment: configResponse.environment,
            createdAt: configResponse.createdAt,
            format: configResponse.format,
          });

          this.banditModelVersions = this.getLoadedBanditModelVersionsFromStore(
            this.banditModelConfigurationStore,
          );
        }
      }
    }
  }

  private getLoadedBanditModelVersionsFromStore(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ): string[] {
    if (banditModelConfigurationStore === null) {
      return [];
    }
    return Object.values(banditModelConfigurationStore.entries()).map(
      (banditParam: BanditParameters) => banditParam.modelVersion,
    );
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
