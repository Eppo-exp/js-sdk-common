import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { BanditVariation, BanditParameters, Flag, Environment } from './interfaces';

type Entry = Flag | BanditVariation[] | BanditParameters;

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
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

    await this.hydrateConfigurationStore(this.flagConfigurationStore, {
      entries: configResponse.flags,
      environment: configResponse.environment,
      createdAt: configResponse.createdAt,
    });

    const flagsHaveBandits = Object.keys(configResponse.bandits ?? {}).length > 0;
    const banditStoresProvided = Boolean(
      this.banditVariationConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(configResponse.bandits);

      await this.hydrateConfigurationStore(this.banditVariationConfigurationStore, {
        entries: banditVariations,
        environment: configResponse.environment,
        createdAt: configResponse.createdAt,
      });

      if (this.requiresBanditModelConfigurationStoreUpdate(configResponse.banditReferences)) {
        const banditResponse = await this.httpClient.getBanditParameters();
        if (banditResponse?.bandits) {
          if (!this.banditModelConfigurationStore) {
            throw new Error('Bandit parameters fetched but no bandit configuration store provided');
          }

          await this.hydrateConfigurationStore(this.banditModelConfigurationStore, {
            entries: banditResponse.bandits,
            environment: configResponse.environment,
            createdAt: configResponse.createdAt,
          });
        }
      }
    }
  }

  private getLoadedBanditModelVersions(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ) {
    if (banditModelConfigurationStore === null) {
      return [];
    }
    return Object.values(banditModelConfigurationStore.entries()).map(
      (banditParam: BanditParameters) => banditParam.modelVersion,
    );
  }

  private requiresBanditModelConfigurationStoreUpdate(
    banditReferences: Record<string, BanditReference>,
  ): boolean {
    if (!this.banditModelConfigurationStore) {
      throw new Error('Bandit parameters fetched but no bandit configuration store provided');
    }
    const referencedModelVersions = Object.values(banditReferences).map(
      (banditReference: BanditReference) => banditReference.modelVersion
    );

    const banditModelVersionsInStore = this.getLoadedBanditModelVersions(
      this.banditModelConfigurationStore,
    );

    referencedModelVersions.forEach((modelVersion) => {
      if (!banditModelVersionsInStore.includes(modelVersion)) {
        return false;
      }
    });

    return true;
  }

  private async hydrateConfigurationStore<T extends Entry>(
    configurationStore: IConfigurationStore<T> | null,
    response: {
      entries: Record<string, T>;
      environment: Environment;
      createdAt: string;
    },
  ): Promise<void> {
    if (configurationStore) {
      const didUpdate = await configurationStore.setEntries(response.entries);
      if (didUpdate) {
        configurationStore.setEnvironment(response.environment);
        configurationStore.setConfigFetchedAt(new Date().toISOString());
        configurationStore.setConfigPublishedAt(response.createdAt);
      }
    }
  }

  private indexBanditVariationsByFlagKey(
    banditVariationsByBanditKey: Record<string, BanditVariation[]>,
  ): Record<string, BanditVariation[]> {
    const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
    Object.values(banditVariationsByBanditKey).forEach((banditVariations) => {
      banditVariations.forEach((banditVariation) => {
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
