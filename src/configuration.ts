import { Environment, FormatEnum, PrecomputedFlag } from './interfaces';
import { generateSalt, obfuscatePrecomputedFlags, Salt } from './obfuscation';
import { Attributes, ContextAttributes } from './types';

export interface IPrecomputedConfiguration {
  readonly createdAt: string;

  readonly subjectKey: string;

  // Optional in case server does not want to expose attributes to a client.
  readonly subjectAttributes?: Attributes | ContextAttributes;

  readonly obfuscated: boolean;

  /// `format` is always `AssignmentFormat::Precomputed`.
  readonly format: FormatEnum;

  /// Salt used for hashing md5-encoded strings.
  readonly salt: string; // base64 encoded

  // Environment might be missing if configuration was absent during evaluation.
  readonly environment?: Environment;
  readonly flags: Record<string, PrecomputedFlag>; // md5 hashed flag key
}

export class PrecomputedConfiguration implements IPrecomputedConfiguration {
  readonly salt = '';
  readonly obfuscated = false;
  readonly createdAt: string;
  readonly format = FormatEnum.PRECOMPUTED;

  constructor(
    readonly subjectKey: string,
    readonly flags: Record<string, PrecomputedFlag>,
    readonly subjectAttributes?: Attributes | ContextAttributes,
    readonly environment?: Environment,
  ) {
    this.createdAt = new Date().toISOString();
  }
}

export class ObfuscatedPrecomputedConfiguration implements IPrecomputedConfiguration {
  readonly salt: string;
  readonly obfuscated = true;
  readonly createdAt: string;
  readonly format = FormatEnum.PRECOMPUTED;
  readonly flags: Record<string, PrecomputedFlag>;
  private saltBase: Salt;

  constructor(
    readonly subjectKey: string,
    flags: Record<string, PrecomputedFlag>,
    readonly subjectAttributes?: Attributes | ContextAttributes,
    readonly environment?: Environment,
  ) {
    this.saltBase = generateSalt();
    this.salt = this.saltBase.base64String;
    this.flags = obfuscatePrecomputedFlags(this.saltBase.saltString, flags);

    this.createdAt = new Date().toISOString();
  }
}

// export class ObfuscatedPrecomputedResponse implements PrecomputedResponse {
//   createdAt: string;
//   environment: Environment;
//   flags: Record<string, PrecomputedFlag>;
//   format: FormatEnum;
//   obfuscated: boolean;
//   subjectKey: string;
//
// }

// "Wire" in the name means "in-transit"/"file" format.
// In-memory representation may differ significantly and is up to SDKs.
export interface ConfigurationWire {
  /**
   * Version field should be incremented for breaking format changes.
   * For example, removing required fields or changing field type/meaning.
   */
  readonly version: number;

  // TODO: Add flags and bandits for offline/non-precomputed initialization
  readonly precomputed?: IPrecomputedConfiguration;
}

export class ConfigurationWireV1 implements ConfigurationWire {
  constructor(readonly precomputed?: IPrecomputedConfiguration) {}

  version = 1;
}
