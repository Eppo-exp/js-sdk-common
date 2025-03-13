import { IUniversalFlagConfigResponse, IBanditParametersResponse } from '../http-client';
import {
  Environment,
  FormatEnum,
  IObfuscatedPrecomputedBandit,
  IPrecomputedBandit,
  PrecomputedFlag,
} from '../interfaces';
import { obfuscatePrecomputedBanditMap, obfuscatePrecomputedFlags } from '../obfuscation';
import { ContextAttributes, FlagKey, HashedFlagKey } from '../types';

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
    salt: string,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ): IPrecomputedConfiguration {
    const response = new ObfuscatedPrecomputedConfigurationResponse(
      subjectKey,
      flags,
      bandits,
      salt,
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
    salt: string,
    subjectAttributes?: ContextAttributes,
    environment?: Environment,
  ) {
    super(subjectKey, subjectAttributes, environment);

    this.salt = salt;
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

  /**
   * Wrapper around an IUniversalFlagConfig payload
   */
  readonly config?: IConfigResponse<IUniversalFlagConfigResponse>;

  /**
   * Wrapper around an IBanditParametersResponse payload.
   */
  readonly bandits?: IConfigResponse<IBanditParametersResponse>;

  readonly precomputed?: IPrecomputedConfiguration;
}

// These response types are stringified in the wire format.
type UfcResponseType = IUniversalFlagConfigResponse | IBanditParametersResponse;

// The UFC responses are JSON-encoded strings so we can treat them as opaque blobs, but we also want to enforce type safety.
type ResponseString<T extends UfcResponseType> = string & {
  readonly __brand: unique symbol;
  readonly __type: T;
};

/**
 * A wrapper around a server response that includes the response, etag, and fetchedAt timestamp.
 */
interface IConfigResponse<T extends UfcResponseType> {
  readonly response: ResponseString<T>; // JSON-encoded server response
  readonly etag?: string; // Entity Tag - denotes a snapshot or version of the config.
  readonly fetchedAt?: string; // ISO timestamp for when this config was fetched
}

export function inflateResponse<T extends UfcResponseType>(response: ResponseString<T>): T {
  return JSON.parse(response) as T;
}

export function deflateResponse<T extends UfcResponseType>(value: T): ResponseString<T> {
  return JSON.stringify(value) as ResponseString<T>;
}

export class ConfigurationWireV1 implements IConfigurationWire {
  public readonly version = 1;

  private constructor(
    readonly precomputed?: IPrecomputedConfiguration,
    readonly config?: IConfigResponse<IUniversalFlagConfigResponse>,
    readonly bandits?: IConfigResponse<IBanditParametersResponse>,
  ) {}

  public static fromResponses(
    flagConfig: IUniversalFlagConfigResponse,
    banditConfig?: IBanditParametersResponse,
    flagConfigEtag?: string,
    banditConfigEtag?: string,
  ): ConfigurationWireV1 {
    return new ConfigurationWireV1(
      undefined,
      {
        response: deflateResponse(flagConfig),
        fetchedAt: new Date().toISOString(),
        etag: flagConfigEtag,
      },
      banditConfig
        ? {
            response: deflateResponse(banditConfig),
            fetchedAt: new Date().toISOString(),
            etag: banditConfigEtag,
          }
        : undefined,
    );
  }

  public static precomputed(precomputedConfig: IPrecomputedConfiguration) {
    return new ConfigurationWireV1(precomputedConfig);
  }

  static empty() {
    return new ConfigurationWireV1();
  }
}
