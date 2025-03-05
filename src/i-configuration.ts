import { IConfigurationStore } from './configuration-store/configuration-store';
import { Entry } from './configuration-store/configuration-store-utils';
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
    const didUpdateFlags = await StoreBackedConfiguration.hydrateConfigurationStore(
      this.flagConfigurationStore,
      flagConfig,
    );
    const promises: Promise<boolean>[] = [];
    if (this.banditVariationConfigurationStore && banditVariationConfig) {
      promises.push(
        StoreBackedConfiguration.hydrateConfigurationStore(
          this.banditVariationConfigurationStore,
          banditVariationConfig,
        ),
      );
    }
    if (this.banditModelConfigurationStore && banditModelConfig) {
      promises.push(
        StoreBackedConfiguration.hydrateConfigurationStore(
          this.banditModelConfigurationStore,
          banditModelConfig,
        ),
      );
    }
    await Promise.all(promises);
    return didUpdateFlags;
  }

  private static async hydrateConfigurationStore<T extends Entry>(
    configurationStore: IConfigurationStore<T> | null,
    response: {
      entries: Record<string, T>;
      environment: Environment;
      createdAt: string;
      format: string;
      salt?: string;
    },
  ): Promise<boolean> {
    if (configurationStore) {
      const didUpdate = await configurationStore.setEntries(response.entries);
      if (didUpdate) {
        configurationStore.setEnvironment(response.environment);
        configurationStore.setConfigFetchedAt(new Date().toISOString());
        configurationStore.setConfigPublishedAt(response.createdAt);
        configurationStore.setFormat(response.format);
        configurationStore.salt = response.salt;
      }
      return didUpdate;
    }
    return false;
  }

  copy(): IConfiguration {
    return new ReadOnlyConfiguration(
      this.flagConfigurationStore.entries(),
      this.isInitialized(),
      this.isObfuscated(),
      this.getFlagConfigDetails(),
      this.banditVariationConfigurationStore?.entries(),
      this.banditModelConfigurationStore?.entries(),
    );
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

export class ReadOnlyConfiguration implements IConfiguration {
  private readonly flags: Record<FlagKey, Flag | ObfuscatedFlag>;
  private readonly banditVariations?: Record<FlagKey, BanditVariation[]>;
  private readonly bandits?: Record<string, BanditParameters>;

  constructor(
    flags: Record<FlagKey, Flag | ObfuscatedFlag>,
    private readonly initialized: boolean,
    private readonly obfuscated: boolean,
    private readonly flagConfigDetails: ConfigDetails,
    banditVariations?: Record<FlagKey, BanditVariation[]>,
    bandits?: Record<string, BanditParameters>,
  ) {
    this.flags = JSON.parse(JSON.stringify(flags));
    this.banditVariations = banditVariations
      ? JSON.parse(JSON.stringify(banditVariations))
      : undefined;
    this.bandits = bandits ? JSON.parse(JSON.stringify(bandits || {})) : undefined;
  }

  getFlag(key: string): Flag | ObfuscatedFlag | null {
    return this.flags[key] ?? null;
  }

  getFlags(): Record<string, Flag | ObfuscatedFlag> {
    return this.flags;
  }

  getBandits(): Record<string, BanditParameters> {
    return this.bandits ?? {};
  }

  getBanditVariations(): Record<string, BanditVariation[]> {
    return this.banditVariations ?? {};
  }

  getFlagBanditVariations(flagKey: string): BanditVariation[] {
    return this.banditVariations?.[flagKey] ?? [];
  }

  getFlagVariationBandit(flagKey: string, variationValue: string): BanditParameters | null {
    const variations = this.getFlagBanditVariations(flagKey);
    const banditKey = variations.find((v) => v.variationValue === variationValue)?.key;
    return banditKey ? this.getBandit(banditKey) : null;
  }

  getBandit(key: string): BanditParameters | null {
    return this.bandits?.[key] ?? null;
  }

  getFlagConfigDetails(): ConfigDetails {
    return this.flagConfigDetails;
  }

  getFlagKeys(): string[] {
    return Object.keys(this.flags);
  }

  isObfuscated(): boolean {
    return this.obfuscated;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
