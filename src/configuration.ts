import { decodeFlag } from './decoding';
import { IBanditParametersResponse, IUniversalFlagConfigResponse } from './http-client';
import { BanditParameters, BanditVariation, Flag, FormatEnum, ObfuscatedFlag } from './interfaces';
import { getMD5Hash } from './obfuscation';
import { ContextAttributes, FlagKey, HashedFlagKey } from './types';

/** @internal for SDK use only */
export type FlagsConfig = {
  response: IUniversalFlagConfigResponse;
  etag?: string;
  /** ISO timestamp when configuration was fetched from the server. */
  fetchedAt?: string;
};

/** @internal for SDK use only */
export type BanditsConfig = {
  response: IBanditParametersResponse;
  etag?: string;
  /** ISO timestamp when configuration was fetched from the server. */
  fetchedAt?: string;
};

/**
 * *The* Configuration.
 *
 * Note: configuration should be treated as immutable. Do not change
 * any of the fields or returned data. Otherwise, bad things will
 * happen.
 */
export class Configuration {
  private flagBanditVariations: Record<string, BanditVariation[]>;

  private constructor(
    private readonly flags?: FlagsConfig,
    private readonly bandits?: BanditsConfig,
  ) {
    this.flagBanditVariations = flags ? indexBanditVariationsByFlagKey(flags.response) : {};
  }

  public static empty(): Configuration {
    return new Configuration();
  }

  /** @internal For SDK usage only. */
  public static fromResponses({
    flags,
    bandits,
  }: {
    flags?: FlagsConfig;
    bandits?: BanditsConfig;
  }): Configuration {
    return new Configuration(flags, bandits);
  }

  // TODO:
  // public static fromString(configurationWire: string): Configuration {}

  /** Serializes configuration to "configuration wire" format. */
  public toString(): string {
    const wire: ConfigurationWire = {
      version: 1,
    };
    if (this.flags) {
      wire.config = {
        ...this.flags,
        response: JSON.stringify(this.flags.response),
      };
    }
    if (this.bandits) {
      wire.bandits = {
        ...this.bandits,
        response: JSON.stringify(this.bandits.response),
      };
    }
    return JSON.stringify(wire);
  }

  public getFlagKeys(): FlagKey[] | HashedFlagKey[] {
    if (!this.flags) {
      return [];
    }
    return Object.keys(this.flags.response.flags);
  }

  /** @internal */
  public getFlagsConfiguration(): FlagsConfig | undefined {
    return this.flags;
  }

  /** @internal */
  public getFetchedAt(): Date | undefined {
    const flagsFetchedAt = this.flags?.fetchedAt ? new Date(this.flags.fetchedAt).getTime() : 0;
    const banditsFetchedAt = this.bandits?.fetchedAt ? new Date(this.bandits.fetchedAt).getTime() : 0;
    const maxFetchedAt = Math.max(flagsFetchedAt, banditsFetchedAt);
    return maxFetchedAt > 0 ? new Date(maxFetchedAt) : undefined;
  }

  /** @internal */
  public isEmpty(): boolean {
    return !this.flags;
  }

  /** @internal */
  public getAge(): number | undefined {
    const fetchedAt = this.getFetchedAt();
    if (!fetchedAt) {
      return undefined;
    }
    return Date.now() - fetchedAt.getTime();
  }

  /** @internal */
  public isStale(maxAgeSeconds: number): boolean {
    const age = this.getAge();
    return !!age && age > maxAgeSeconds * 1000;
  }

  /** @internal
   *
   * Returns flag configuration for the given flag key. Obfuscation is
   * handled automatically.
   */
  public getFlag(flagKey: string): Flag | null {
    if (!this.flags) {
      return null;
    }

    if (this.flags.response.format === FormatEnum.SERVER) {
      return this.flags.response.flags[flagKey] ?? null;
    } else {
      // Obfuscated configuration
      const flag = this.flags.response.flags[getMD5Hash(flagKey)];
      return flag ? decodeFlag(flag as ObfuscatedFlag) : null;
    }
  }

  /** @internal */
  public getBanditConfiguration(): BanditsConfig | undefined {
    return this.bandits;
  }

  /** @internal */
  public getFlagBanditVariations(flagKey: FlagKey | HashedFlagKey): BanditVariation[] {
    return this.flagBanditVariations[flagKey] ?? [];
  }

  /** @internal */
  public getFlagVariationBandit(flagKey: string, variationValue: string): BanditParameters | null {
    const banditVariations = this.getFlagBanditVariations(flagKey);
    const banditKey = banditVariations?.find(
      (banditVariation) => banditVariation.variationValue === variationValue,
    )?.key;

    if (banditKey) {
      return this.bandits?.response.bandits[banditKey] ?? null;
    }
    return null;
  }
}

function indexBanditVariationsByFlagKey(
  flagsResponse: IUniversalFlagConfigResponse,
): Record<string, BanditVariation[]> {
  const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
  Object.values(flagsResponse.banditReferences).forEach((banditReference) => {
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

/** @internal */
type ConfigurationWire = {
  /**
   * Version field should be incremented for breaking format changes.
   * For example, removing required fields or changing field type/meaning.
   */
  version: 1;

  config?: {
    response: string;
    etag?: string;
    fetchedAt?: string;
  };

  bandits?: {
    response: string;
    etag?: string;
    fetchedAt?: string;
  };

  precomputed?: {
    response: string;
    subjectKey: string;
    subjectAttributes?: ContextAttributes;
  };
};
