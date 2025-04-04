import { FormatEnum } from './interfaces';

export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_BASE_POLLING_INTERVAL_MS = 30_000;
export const DEFAULT_MAX_POLLING_INTERVAL_MS = 300_000;
export const POLL_JITTER_PCT = 0.1;
export const DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES = 1;
export const DEFAULT_POLL_CONFIG_REQUEST_RETRIES = 7;
export const DEFAULT_INITIALIZATION_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_AGE_SECONDS = 30;
export const DEFAULT_MAX_STALE_SECONDS = Infinity;
export const DEFAULT_INITIALIZATION_STRATEGY = 'stale-while-revalidate';
export const DEFAULT_ACTIVATION_STRATEGY = 'stale';
export const DEFAULT_ENABLE_POLLING_CLIENT = false;
export const DEFAULT_ENABLE_POLLING_NODE = true;
export const DEFAULT_ENABLE_BANDITS = true;
export const BASE_URL = 'https://fscdn.eppo.cloud/api';
export const UFC_ENDPOINT = '/flag-config/v1/config';
export const BANDIT_ENDPOINT = '/flag-config/v1/bandits';
export const PRECOMPUTED_BASE_URL = 'https://fs-edge-assignment.eppo.cloud';
export const PRECOMPUTED_FLAGS_ENDPOINT = '/assignments';
export const SESSION_ASSIGNMENT_CONFIG_LOADED = 'eppo-session-assignment-config-loaded';
export const NULL_SENTINEL = 'EPPO_NULL';
// number of logging events that may be queued while waiting for initialization
export const MAX_EVENT_QUEUE_SIZE = 100;
export const BANDIT_ASSIGNMENT_SHARDS = 10000;
export const DEFAULT_TLRU_TTL_MS = 600_000;

/**
 * UFC Configuration formats which are obfuscated.
 *
 * We use string[] instead of FormatEnum[] to allow easy interaction with this value in its wire type (string).
 * Converting from string to enum requires a map lookup or array iteration and is much more awkward than the inverse.
 */
export const OBFUSCATED_FORMATS: string[] = [FormatEnum.CLIENT, FormatEnum.PRECOMPUTED];
