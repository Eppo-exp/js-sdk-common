import {
  Environment,
  FormatEnum,
  IObfuscatedPrecomputedBandit,
  IPrecomputedBandit,
  PrecomputedFlag,
} from './interfaces';
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
