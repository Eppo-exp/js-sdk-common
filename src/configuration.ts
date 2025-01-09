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
import { ContextAttributes, FlagKey, HashedFlagKey } from './types';

// Base interface for all configuration responses
interface IBasePrecomputedConfigurationResponse {
  readonly format: FormatEnum.PRECOMPUTED;
  readonly obfuscated: boolean;
  readonly createdAt: string;
  readonly environment?: Environment;
}

export interface IPrecomputedConfigurationResponse extends IBasePrecomputedConfigurationResponse {
  readonly obfuscated: false; // Always false
  readonly flags: Record<FlagKey, PrecomputedFlag>;
  readonly bandits: Record<FlagKey, IPrecomputedBandit>;
}

export interface IObfuscatedPrecomputedConfigurationResponse
  extends IBasePrecomputedConfigurationResponse {
  readonly obfuscated: true; // Always true
  readonly salt: string; // Salt used for hashing md5-encoded strings

  // PrecomputedFlag ships values as string and uses ValueType to cast back on the client.
  // Values are obfuscated as strings, so a separate Obfuscated interface is not needed for flags.
  readonly flags: Record<HashedFlagKey, PrecomputedFlag>;
  readonly bandits: Record<HashedFlagKey, IObfuscatedPrecomputedBandit>;
}

export interface IPrecomputedConfiguration {
  // JSON encoded configuration response (obfuscated or unobfuscated)
  readonly response: string;
  readonly subjectKey: string;
  readonly subjectAttributes?: ContextAttributes;
}

// Base class for configuration responses with common fields
abstract class BasePrecomputedConfigurationResponse {
  readonly createdAt: string;
  readonly format = FormatEnum.PRECOMPUTED;

  constructor(
    public readonly subjectKey: string,
    public readonly subjectAttributes?: ContextAttributes,
    public readonly environment?: Environment,
  ) {
    this.createdAt = new Date().toISOString();
  }
}

export class PrecomputedConfiguration implements IPrecomputedConfiguration {
  private constructor(
    public readonly response: string,
    public readonly subjectKey: string,
    public readonly subjectAttributes?: ContextAttributes,
  ) {}

  public static obfuscated(
    subjectKey: string,
    flags: Record<FlagKey, PrecomputedFlag>,
    bandits: Record<FlagKey, IPrecomputedBandit>,
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
    flags: Record<FlagKey, PrecomputedFlag>,
    bandits: Record<FlagKey, IPrecomputedBandit>,
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

export class PrecomputedConfigurationResponse
  extends BasePrecomputedConfigurationResponse
  implements IPrecomputedConfigurationResponse
{
  readonly obfuscated = false;

  constructor(
    subjectKey: string,
    public readonly flags: Record<FlagKey, PrecomputedFlag>,
    public readonly bandits: Record<FlagKey, IPrecomputedBandit>,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ) {
    super(subjectKey, subjectAttributes, environment);
  }
}

export class ObfuscatedPrecomputedConfigurationResponse
  extends BasePrecomputedConfigurationResponse
  implements IObfuscatedPrecomputedConfigurationResponse
{
  readonly bandits: Record<HashedFlagKey, IObfuscatedPrecomputedBandit>;
  readonly flags: Record<HashedFlagKey, PrecomputedFlag>;
  readonly obfuscated = true;
  readonly salt: string;

  constructor(
    subjectKey: string,
    flags: Record<FlagKey, PrecomputedFlag>,
    bandits: Record<FlagKey, IPrecomputedBandit>,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ) {
    super(subjectKey, subjectAttributes, environment);

    this.salt = generateSalt();
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
