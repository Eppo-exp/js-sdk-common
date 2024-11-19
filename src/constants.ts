export const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
export const REQUEST_TIMEOUT_MILLIS = DEFAULT_REQUEST_TIMEOUT_MS; // for backwards compatibility
export const DEFAULT_POLL_INTERVAL_MS = 30000;
export const POLL_JITTER_PCT = 0.1;
export const DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES = 1;
export const DEFAULT_POLL_CONFIG_REQUEST_RETRIES = 7;
export const BASE_URL = 'https://fscdn.eppo.cloud/api';
export const UFC_ENDPOINT = '/flag-config/v1/config';
export const BANDIT_ENDPOINT = '/flag-config/v1/bandits';
export const SESSION_ASSIGNMENT_CONFIG_LOADED = 'eppo-session-assignment-config-loaded';
export const NULL_SENTINEL = 'EPPO_NULL';
// number of logging events that may be queued while waiting for initialization
export const MAX_EVENT_QUEUE_SIZE = 100;
export const BANDIT_ASSIGNMENT_SHARDS = 10000;
