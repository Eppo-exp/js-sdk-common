import { IUniversalFlagConfigResponse, IBanditParametersResponse } from '../http-client';
import {
  IConfiguration,
  StoreBackedConfiguration,
  ConfigStoreHydrationPacket,
} from '../i-configuration';
import {
  Flag,
  ObfuscatedFlag,
  BanditReference,
  BanditParameters,
  BanditVariation,
} from '../interfaces';

import { IConfigurationStore } from './configuration-store';

export type ConfigurationStoreBundle = {
  flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>;
  banditReferenceConfigurationStore?: IConfigurationStore<BanditVariation[]>;
  banditConfigurationStore?: IConfigurationStore<BanditParameters>;
};

export class ConfigurationManager {
  private configuration: StoreBackedConfiguration;

  constructor(
    private flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private banditReferenceConfigurationStore?: IConfigurationStore<BanditVariation[]>,
    private banditConfigurationStore?: IConfigurationStore<BanditParameters>,
  ) {
    this.configuration = new StoreBackedConfiguration(
      this.flagConfigurationStore,
      this.banditReferenceConfigurationStore,
      this.banditConfigurationStore,
    );
  }

  public getConfiguration(): IConfiguration {
    return this.configuration;
  }

  public async hydrateConfigurationStores(
    flagConfigPacket: ConfigStoreHydrationPacket<Flag | ObfuscatedFlag>,
    banditReferencePacket?: ConfigStoreHydrationPacket<BanditVariation[]>,
    banditParametersPacket?: ConfigStoreHydrationPacket<BanditParameters>,
  ): Promise<boolean> {
    // Delegate to the configuration to hydrate the stores
    return this.configuration.hydrateConfigurationStores(
      flagConfigPacket,
      banditReferencePacket,
      banditParametersPacket,
    );
  }

  public async hydrateConfigurationStoresFromUfc(
    configResponse: IUniversalFlagConfigResponse,
    banditResponse?: IBanditParametersResponse,
  ): Promise<boolean> {
    if (!configResponse?.flags) {
      return false;
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

    if (flagsHaveBandits) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(configResponse.banditReferences);

      banditVariationPacket = {
        entries: banditVariations,
        environment: configResponse.environment,
        createdAt: configResponse.createdAt,
        format: configResponse.format,
      };

      if (banditResponse?.bandits) {
        banditModelPacket = {
          entries: banditResponse.bandits,
          environment: configResponse.environment,
          createdAt: configResponse.createdAt,
          format: configResponse.format,
        };
      }
    }

    // Use the hydrateConfigurationStores method to avoid duplication
    return this.hydrateConfigurationStores(
      flagResponsePacket,
      banditVariationPacket,
      banditModelPacket,
    );
  }

  public setConfigurationStores(configStores: ConfigurationStoreBundle): void {
    this.flagConfigurationStore = configStores.flagConfigurationStore;
    this.banditReferenceConfigurationStore = configStores.banditReferenceConfigurationStore;
    this.banditConfigurationStore = configStores.banditConfigurationStore;

    // Recreate the configuration with the new stores
    this.configuration = new StoreBackedConfiguration(
      this.flagConfigurationStore,
      this.banditReferenceConfigurationStore,
      this.banditConfigurationStore,
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
