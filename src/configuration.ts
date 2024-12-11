import { Environment, FormatEnum, IPrecomputedBandit, PrecomputedFlag } from './interfaces';
import {
  generateSalt,
  obfuscatedPrecomputedBandits,
  obfuscatePrecomputedFlags,
  Salt,
} from './obfuscation';
import { Attributes, ContextAttributes } from './types';

export interface IPrecomputedConfigurationResponse {
  // `format` is always `PRECOMPUTED`
  readonly format: FormatEnum;
  readonly obfuscated: boolean;
  // Salt used for hashing md5-encoded strings.
  readonly salt: string;
  readonly createdAt: string;
  // Environment might be missing if configuration was absent during evaluation.
  readonly environment?: Environment;
  readonly flags: Record<string, PrecomputedFlag>;
  bandits: Record<string, IPrecomputedBandit>;
}

export interface IPrecomputedConfiguration {
  // JSON encoded `PrecomputedConfigurationResponse`
  readonly response: string;
  readonly subjectKey: string;
  // Optional in case server does not want to expose attributes to a client.
  readonly subjectAttributes?: Attributes | ContextAttributes;
}

export class PrecomputedConfiguration implements IPrecomputedConfiguration {
  readonly format = FormatEnum.PRECOMPUTED;
  readonly response: string;

  constructor(
    readonly subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    bandits: Record<string, IPrecomputedBandit>,
    readonly subjectAttributes?: Attributes | ContextAttributes,
    environment?: Environment,
  ) {
    const precomputedResponse: IPrecomputedConfigurationResponse = {
      format: FormatEnum.PRECOMPUTED,
      obfuscated: false,
      salt: '',
      createdAt: new Date().toISOString(),
      environment,
      flags,
      bandits,
    };
    this.response = JSON.stringify(precomputedResponse);
  }
}

export class ObfuscatedPrecomputedConfiguration implements IPrecomputedConfiguration {
  readonly format = FormatEnum.PRECOMPUTED;
  readonly response: string;
  private saltBase: Salt;

  constructor(
    readonly subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    bandits: Record<string, IPrecomputedBandit>,
    readonly subjectAttributes?: Attributes | ContextAttributes,
    environment?: Environment,
  ) {
    this.saltBase = generateSalt();

    const precomputedResponse: IPrecomputedConfigurationResponse = {
      format: FormatEnum.PRECOMPUTED,
      obfuscated: true,
      salt: this.saltBase.base64String,
      createdAt: new Date().toISOString(),
      environment,
      flags: obfuscatePrecomputedFlags(this.saltBase.saltString, flags),
      bandits: obfuscatedPrecomputedBandits(this.saltBase.saltString, bandits),
    };
    this.response = JSON.stringify(precomputedResponse);
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
  version = 1;
  constructor(readonly precomputed?: IPrecomputedConfiguration) {}
}
