import { Rule } from './rules';

export enum VariationType {
  STRING = 'string',
  INTEGER = 'integer',
  NUMERIC = 'numeric',
  BOOLEAN = 'boolean',
  JSON = 'json',
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
  rules: Rule[];
  startAt?: Date;
  endAt?: Date;
  splits: Split[];
  doLog: boolean;
}

export interface Flag {
  key: string;
  enabled: boolean;
  variationType: VariationType;
  variations: Record<string, Variation>;
  allocations: Allocation[];
  totalShards: number;
}
