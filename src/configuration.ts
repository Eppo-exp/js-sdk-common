import {
  Environment,
  FormatEnum,
  IObfuscatedPrecomputedBandit,
  IPrecomputedBandit,
  PrecomputedFlag,
} from './interfaces';
import {
  generateSalt,
  obfuscatePrecomputedBanditMap,
  obfuscatePrecomputedFlags,
} from './obfuscation';
import { ContextAttributes, MD5String } from './types';

export interface IPrecomputedConfigurationResponse {
  // `format` is always `PRECOMPUTED`
  readonly format: FormatEnum;
  readonly obfuscated: boolean; // Always false.
  readonly createdAt: string;
  // Environment might be missing if configuration was absent during evaluation.
  readonly environment?: Environment;
  readonly flags: Record<string, PrecomputedFlag>;
  readonly bandits: Record<string, IPrecomputedBandit>;
}

export interface IObfuscatedPrecomputedConfigurationResponse {
  // `format` is always `PRECOMPUTED`
  readonly format: FormatEnum;
  readonly obfuscated: boolean; // Always true.
  // Salt used for hashing md5-encoded strings.
  readonly salt: string;
  readonly createdAt: string;
  // Environment might be missing if configuration was absent during evaluation.
  readonly environment?: Environment;
  readonly flags: Record<MD5String, PrecomputedFlag>;
  readonly bandits: Record<MD5String, IObfuscatedPrecomputedBandit>;
}

export interface IPrecomputedConfiguration {
  // JSON encoded `IObfuscatedPrecomputedConfigurationResponse` (but could be `IPrecomputedConfigurationResponse` in the future)
  readonly response: string;
  readonly subjectKey: string;
  readonly subjectAttributes?: ContextAttributes;
}

export class PrecomputedConfiguration implements IPrecomputedConfiguration {
  private constructor(
    public readonly response: string,
    public readonly subjectKey: string,
    public readonly subjectAttributes?: ContextAttributes,
  ) {}

  public static obfuscated(
    subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    bandits: Record<string, IPrecomputedBandit>,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ): IPrecomputedConfiguration {
    const response = new ObfuscatedPrecomputedConfigurationResponse(
      subjectKey,
      flags,
      bandits,
      subjectAttributes,
      environment,
    );

    return new PrecomputedConfiguration(JSON.stringify(response), subjectKey, subjectAttributes);
  }

  public static unobfuscated(
    subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    bandits: Record<string, IPrecomputedBandit>,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ): IPrecomputedConfiguration {
    const response = new PrecomputedConfigurationResponse(
      subjectKey,
      flags,
      bandits,
      subjectAttributes,
      environment,
    );

    return new PrecomputedConfiguration(JSON.stringify(response), subjectKey, subjectAttributes);
  }
}

export class PrecomputedConfigurationResponse implements IPrecomputedConfigurationResponse {
  readonly createdAt: string;
  readonly format = FormatEnum.PRECOMPUTED;
  readonly obfuscated = false;

  constructor(
    public readonly subjectKey: string,
    public readonly flags: Record<string, PrecomputedFlag>,
    public readonly bandits: Record<string, IPrecomputedBandit>,
    public readonly subjectAttributes?: ContextAttributes,
    public readonly environment?: Environment,
  ) {
    this.createdAt = '';
  }
}

export class ObfuscatedPrecomputedConfigurationResponse
  implements IObfuscatedPrecomputedConfigurationResponse
{
  readonly bandits: Record<MD5String, IObfuscatedPrecomputedBandit>;
  readonly createdAt: string;
  readonly flags: Record<string, PrecomputedFlag>;
  readonly format = FormatEnum.PRECOMPUTED;
  readonly obfuscated = true;
  readonly salt: string;

  constructor(
    readonly subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    bandits: Record<string, IPrecomputedBandit>,
    readonly subjectAttributes?: ContextAttributes,
    readonly environment?: Environment,
  ) {
    this.salt = generateSalt();
    this.createdAt = '';

    this.bandits = obfuscatePrecomputedBanditMap(this.salt, bandits);

    this.flags = obfuscatePrecomputedFlags(this.salt, flags);
  }
}

// "Wire" in the name means "in-transit"/"file" format.
// In-memory representation may differ significantly and is up to SDKs.
export interface IConfigurationWire {
  /**
   * Version field should be incremented for breaking format changes.
   * For example, removing required fields or changing field type/meaning.
   */
  readonly version: number;

  // TODO: Add flags and bandits for offline/non-precomputed initialization
  readonly precomputed?: IPrecomputedConfiguration;
}

export class ConfigurationWireV1 implements IConfigurationWire {
  public readonly version = 1;
  constructor(readonly precomputed?: IPrecomputedConfiguration) {}
}
