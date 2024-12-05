import { IPrecomputedFlagsResponse } from './http-client';
import { Rule } from './rules';
import { Attributes, ContextAttributes } from './types';

export enum VariationType {
  STRING = 'STRING',
  INTEGER = 'INTEGER',
  NUMERIC = 'NUMERIC',
  BOOLEAN = 'BOOLEAN',
  JSON = 'JSON',
}

export interface Variation {
  key: string;
  value: string | number | boolean;
}

export interface Range {
  start: number;
  end: number;
}

export interface Shard {
  salt: string;
  ranges: Range[];
}

export interface Split {
  shards: Shard[];
  variationKey: string;
  extraLogging?: Record<string, string>;
}

export interface Allocation {
  key: string;
  rules?: Rule[];
  startAt?: string; // ISO 8601
  endAt?: string; // ISO 8601
  splits: Split[];
  doLog: boolean;
}

export interface Environment {
  name: string;
}

export interface ConfigDetails {
  configFetchedAt: string;
  configPublishedAt: string;
  configEnvironment: Environment;
  configFormat: string;
}

export interface Flag {
  key: string;
  enabled: boolean;
  variationType: VariationType;
  variations: Record<string, Variation>;
  allocations: Allocation[];
  totalShards: number;
}

export interface ObfuscatedFlag {
  key: string;
  environment: Environment;
  enabled: boolean;
  variationType: VariationType;
  variations: Record<string, ObfuscatedVariation>;
  allocations: ObfuscatedAllocation[];
  totalShards: number;
}

export interface ObfuscatedVariation {
  key: string;
  value: string;
}

export interface ObfuscatedAllocation {
  key: string;
  rules?: Rule[];
  startAt?: string; // ISO 8601
  endAt?: string; // ISO 8601
  splits: ObfuscatedSplit[];
  doLog: boolean;
}

export interface ObfuscatedSplit {
  shards: ObfuscatedShard[];
  variationKey: string;
  extraLogging?: Record<string, string>;
}

export interface ObfuscatedShard {
  salt: string;
  ranges: Range[];
}

export interface BanditVariation {
  key: string;
  flagKey: string;
  variationKey: string;
  variationValue: string;
}

export interface BanditParameters {
  banditKey: string;
  modelName: string;
  modelVersion: string;
  modelData: BanditModelData;
}

export interface BanditModelData {
  gamma: number;
  defaultActionScore: number;
  actionProbabilityFloor: number;
  coefficients: Record<string, BanditCoefficients>;
}

export interface BanditCoefficients {
  actionKey: string;
  intercept: number;
  subjectNumericCoefficients: BanditNumericAttributeCoefficients[];
  subjectCategoricalCoefficients: BanditCategoricalAttributeCoefficients[];
  actionNumericCoefficients: BanditNumericAttributeCoefficients[];
  actionCategoricalCoefficients: BanditCategoricalAttributeCoefficients[];
}

export interface BanditNumericAttributeCoefficients {
  attributeKey: string;
  coefficient: number;
  missingValueCoefficient: number;
}

export interface BanditCategoricalAttributeCoefficients {
  attributeKey: string;
  valueCoefficients: Record<string, number>;
  missingValueCoefficient: number;
}

export enum FormatEnum {
  SERVER = 'SERVER',
  CLIENT = 'CLIENT',
  PRECOMPUTED = 'PRECOMPUTED',
}

export interface PrecomputedFlag {
  allocationKey: string;
  variationKey: string;
  variationType: VariationType;
  variationValue: string;
  extraLogging: Record<string, string>;
  doLog: boolean;
}

export interface PrecomputedResponse extends IPrecomputedFlagsResponse {
  obfuscated: boolean;
  subjectKey: string;
  subjectAttributes: Attributes | ContextAttributes;
}

export interface ConfigurationWireFormat {
  precomputed?: PrecomputedResponse;
}

export interface PrecomputedFlagsDetails {
  precomputedFlagsFetchedAt: string;
  precomputedFlagsPublishedAt: string;
  precomputedFlagsEnvironment: Environment;
}

export interface PrecomputedFlagsPayload {
  subject_key: string;
  subject_attributes: Attributes;
}
