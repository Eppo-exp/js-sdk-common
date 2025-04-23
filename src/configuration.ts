import { decodeFlag } from './decoding';
import { IBanditParametersResponse, IUniversalFlagConfigResponse } from './http-client';
import { BanditParameters, BanditVariation, Flag, FormatEnum, ObfuscatedFlag } from './interfaces';
import { getMD5Hash } from './obfuscation';
import { IObfuscatedPrecomputedConfigurationResponse } from './precomputed-configuration';
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

/** @internal for SDK use only */
export type PrecomputedConfig = {
  response: IObfuscatedPrecomputedConfigurationResponse;
  etag?: string;
  /** ISO timestamp when configuration was fetched from the server. */
  fetchedAt?: string;
  subjectKey: string;
  subjectAttributes?: ContextAttributes;
  banditActions?: Record</* flagKey: */ string, Record</* actionKey: */ string, ContextAttributes>>;
};

/**
 * *The* Configuration.
 *
 * Note: configuration should be treated as immutable. Do not change
 * any of the fields or returned data. Otherwise, bad things will
 * happen.
 *
 * @public
 */
export class Configuration {
  private flagBanditVariations: Record<string, BanditVariation[]>;

  private constructor(
    private readonly parts: {
      readonly flags?: FlagsConfig;
      readonly bandits?: BanditsConfig;
      readonly precomputed?: PrecomputedConfig;
    },
  ) {
    this.flagBanditVariations = parts.flags
      ? indexBanditVariationsByFlagKey(parts.flags.response)
      : {};
  }

  /**
   * Creates a new empty configuration.
   * @public
   */
  public static empty(): Configuration {
    return new Configuration({});
  }

  /**
   * Initializes a Configuration from a legacy flags configuration format. New applications should
   * use `Configuration.fromString` instead.
   *
   * @deprecated Use `Configuration.fromString` instead.
   */
  public static fromFlagsConfiguration(
    flags: Record<string, Flag | ObfuscatedFlag>,
    options: { obfuscated: boolean },
  ): Configuration {
    return new Configuration({
      flags: {
        response: {
          format: options.obfuscated ? FormatEnum.CLIENT : FormatEnum.SERVER,
          flags,
          createdAt: new Date().toISOString(),
          environment: {
            name: 'from-flags-configuration',
          },
          banditReferences: {},
        },
      },
    });
  }

  /** @internal For SDK usage only. */
  public static fromResponses({
    flags,
    bandits,
    precomputed,
  }: {
    flags?: FlagsConfig;
    bandits?: BanditsConfig;
    precomputed?: PrecomputedConfig;
  }): Configuration {
    return new Configuration({ flags, bandits, precomputed });
  }

  /**
   * Initializes a Configuration from a "configuration wire" format (this is the format returned by
   * `toString`).
   *
   * @public
   */
  public static fromString(configurationWire: string): Configuration {
    // TODO: we're assuming that `configurationWire` is properly formatted.
    const wire: ConfigurationWire = JSON.parse(configurationWire);

    let flags: FlagsConfig | undefined;
    let bandits: BanditsConfig | undefined;
    let precomputed: PrecomputedConfig | undefined;

    if (wire.config) {
      flags = {
        response: JSON.parse(wire.config.response),
        etag: wire.config.etag,
        fetchedAt: wire.config.fetchedAt,
      };
    }

    if (wire.bandits) {
      bandits = {
        response: JSON.parse(wire.bandits.response),
        etag: wire.bandits.etag,
        fetchedAt: wire.bandits.fetchedAt,
      };
    }

    if (wire.precomputed) {
      precomputed = {
        response: JSON.parse(wire.precomputed.response),
        etag: wire.precomputed.etag,
        fetchedAt: wire.precomputed.fetchedAt,
        subjectKey: wire.precomputed.subjectKey,
        subjectAttributes: wire.precomputed.subjectAttributes,
        banditActions: wire.precomputed.banditActions,
      };
    }

    return new Configuration({
      flags,
      bandits,
      precomputed,
    });
  }

  /** Serializes configuration to "configuration wire" format. */
  public toString(): string {
    const wire: ConfigurationWire = {
      version: 1,
    };
    if (this.parts.flags) {
      wire.config = {
        ...this.parts.flags,
        response: JSON.stringify(this.parts.flags.response),
      };
    }
    if (this.parts.bandits) {
      wire.bandits = {
        ...this.parts.bandits,
        response: JSON.stringify(this.parts.bandits.response),
      };
    }
    if (this.parts.precomputed) {
      wire.precomputed = {
        ...this.parts.precomputed,
        response: JSON.stringify(this.parts.precomputed.response),
      };
    }
    return JSON.stringify(wire);
  }

  /**
   * Returns a list of known flag keys (for debugging purposes).
   *
   * If underlying flags configuration is obfuscated, the returned
   * flag values will be obfuscated as well.
   */
  public getFlagKeys(): string[] {
    if (this.parts.flags) {
      return Object.keys(this.parts.flags.response.flags);
    }
    if (this.parts.precomputed) {
      return Object.keys(this.parts.precomputed.response.flags);
    }
    return [];
  }

  /** @internal */
  public getFlagsConfiguration(): FlagsConfig | undefined {
    return this.parts.flags;
  }

  /** @internal */
  public getFetchedAt(): Date | undefined {
    const flagsFetchedAt = this.parts.flags?.fetchedAt
      ? new Date(this.parts.flags.fetchedAt).getTime()
      : 0;
    const banditsFetchedAt = this.parts.bandits?.fetchedAt
      ? new Date(this.parts.bandits.fetchedAt).getTime()
      : 0;
    const precomputedFetchedAt = this.parts.precomputed?.fetchedAt
      ? new Date(this.parts.precomputed.fetchedAt).getTime()
      : 0;
    const maxFetchedAt = Math.max(flagsFetchedAt, banditsFetchedAt, precomputedFetchedAt);
    return maxFetchedAt > 0 ? new Date(maxFetchedAt) : undefined;
  }

  /** @internal */
  public isEmpty(): boolean {
    return !this.parts.flags && !this.parts.precomputed;
  }

  /** @internal */
  public getAgeMs(): number | undefined {
    const fetchedAt = this.getFetchedAt();
    if (!fetchedAt) {
      return undefined;
    }
    return Date.now() - fetchedAt.getTime();
  }

  /** @internal */
  public isStale(maxAgeSeconds: number): boolean {
    const age = this.getAgeMs();
    return !!age && age > maxAgeSeconds * 1000;
  }

  /**
   * Returns flag configuration for the given flag key. Obfuscation is
   * handled automatically.
   *
   * @internal
   */
  public getFlag(flagKey: string): Flag | null {
    if (!this.parts.flags) {
      return null;
    }

    if (this.parts.flags.response.format === FormatEnum.SERVER) {
      return this.parts.flags.response.flags[flagKey] ?? null;
    } else {
      // Obfuscated configuration
      const flag = this.parts.flags.response.flags[getMD5Hash(flagKey)];
      return flag ? decodeFlag(flag as ObfuscatedFlag) : null;
    }
  }

  /** @internal */
  public getBanditConfiguration(): BanditsConfig | undefined {
    return this.parts.bandits;
  }

  /** @internal */
  public getPrecomputedConfiguration(): PrecomputedConfig | undefined {
    return this.parts.precomputed;
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
      return this.parts.bandits?.response.bandits[banditKey] ?? null;
    }
    return null;
  }
}

function indexBanditVariationsByFlagKey(
  flagsResponse: IUniversalFlagConfigResponse,
): Record<string, BanditVariation[]> {
  const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
  Object.values(flagsResponse.banditReferences ?? {}).forEach((banditReference) => {
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
    etag?: string;
    fetchedAt?: string;
    subjectKey: string;
    subjectAttributes?: ContextAttributes;
    banditActions?: Record<
      /* flagKey: */ string,
      Record</* actionKey: */ string, ContextAttributes>
    >;
  };
};
