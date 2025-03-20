import { IConfigurationStore } from './configuration-store/configuration-store';
import { Entry, hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { OBFUSCATED_FORMATS } from './constants';
import {
  BanditParameters,
  BanditVariation,
  ConfigDetails,
  Environment,
  Flag,
  ObfuscatedFlag,
} from './interfaces';
import { BanditKey, FlagKey, HashedFlagKey } from './types';

// TODO(v5): remove IConfiguration once all users migrate to Configuration.
export interface IConfiguration {
  getFlag(key: FlagKey | HashedFlagKey): Flag | ObfuscatedFlag | null;
  getFlags(): Record<FlagKey | HashedFlagKey, Flag | ObfuscatedFlag>;
  getBandits(): Record<BanditKey, BanditParameters>;
  getBanditVariations(): Record<FlagKey | HashedFlagKey, BanditVariation[]>;
  getFlagBanditVariations(flagKey: FlagKey | HashedFlagKey): BanditVariation[];
  getFlagVariationBandit(
    flagKey: FlagKey | HashedFlagKey,
    variationValue: string,
  ): BanditParameters | null;
  getBandit(key: BanditKey): BanditParameters | null;
  getFlagConfigDetails(): ConfigDetails;
  getFlagKeys(): FlagKey[] | HashedFlagKey[];
  isObfuscated(): boolean;
  isInitialized(): boolean;
}

// TODO: replace more abstract `IConfiguration` with some concrete
// implementation, so we know what to expect from it (i.e., it's
// probably a bad idea to allow users implementing their own
// configurations).
export type Configuration = IConfiguration;

export type ConfigStoreHydrationPacket<T extends Entry> = {
  entries: Record<string, T>;
  environment: Environment;
  createdAt: string;
  format: string;
  salt?: string;
};

export class StoreBackedConfiguration implements IConfiguration {
  constructor(
    private readonly flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private readonly banditVariationConfigurationStore?: IConfigurationStore<
      BanditVariation[]
    > | null,
    private readonly banditModelConfigurationStore?: IConfigurationStore<BanditParameters> | null,
  ) {}

  public async hydrateConfigurationStores(
    flagConfig: ConfigStoreHydrationPacket<Flag>,
    banditVariationConfig?: ConfigStoreHydrationPacket<BanditVariation[]>,
    banditModelConfig?: ConfigStoreHydrationPacket<BanditParameters>,
  ) {
    const didUpdateFlags = await hydrateConfigurationStore(this.flagConfigurationStore, flagConfig);
    const promises: Promise<boolean>[] = [];
    if (this.banditVariationConfigurationStore && banditVariationConfig) {
      promises.push(
        hydrateConfigurationStore(this.banditVariationConfigurationStore, banditVariationConfig),
      );
    }
    if (this.banditModelConfigurationStore && banditModelConfig) {
      promises.push(
        hydrateConfigurationStore(this.banditModelConfigurationStore, banditModelConfig),
      );
    }
    await Promise.all(promises);
    return didUpdateFlags;
  }

  getBandit(key: string): BanditParameters | null {
    return this.banditModelConfigurationStore?.get(key) ?? null;
  }

  getFlagVariationBandit(flagKey: string, variationValue: string): BanditParameters | null {
    const banditVariations = this.banditVariationConfigurationStore?.get(flagKey);
    const banditKey = banditVariations?.find(
      (banditVariation) => banditVariation.variationValue === variationValue,
    )?.key;

    if (banditKey) {
      // Retrieve the model parameters for the bandit
      return this.getBandit(banditKey);
    }
    return null;
  }

  getFlag(key: string): Flag | ObfuscatedFlag | null {
    return this.flagConfigurationStore.get(key) ?? null;
  }

  getFlagConfigDetails(): ConfigDetails {
    return {
      configFetchedAt: this.flagConfigurationStore.getConfigFetchedAt() ?? '',
      configPublishedAt: this.flagConfigurationStore.getConfigPublishedAt() ?? '',
      configEnvironment: this.flagConfigurationStore.getEnvironment() ?? {
        name: '',
      },
      configFormat: this.flagConfigurationStore.getFormat() ?? '',
    };
  }

  getFlagBanditVariations(flagKey: string): BanditVariation[] {
    return this.banditVariationConfigurationStore?.get(flagKey) ?? [];
  }

  getFlagKeys(): string[] {
    return this.flagConfigurationStore.getKeys();
  }

  getFlags(): Record<string, Flag | ObfuscatedFlag> {
    return this.flagConfigurationStore.entries();
  }

  isObfuscated(): boolean {
    return OBFUSCATED_FORMATS.includes(this.getFlagConfigDetails().configFormat ?? 'SERVER');
  }

  isInitialized() {
    return (
      this.flagConfigurationStore.isInitialized() &&
      (!this.banditVariationConfigurationStore ||
        this.banditVariationConfigurationStore.isInitialized()) &&
      (!this.banditModelConfigurationStore || this.banditModelConfigurationStore.isInitialized())
    );
  }

  getBandits(): Record<string, BanditParameters> {
    return this.banditModelConfigurationStore?.entries() ?? {};
  }

  getBanditVariations(): Record<string, BanditVariation[]> {
    return this.banditVariationConfigurationStore?.entries() ?? {};
  }
}
