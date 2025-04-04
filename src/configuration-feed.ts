import { Configuration } from './configuration';
import { BroadcastChannel } from './broadcast';

/**
 * Enumeration of possible configuration sources.
 */
export enum ConfigurationSource {
  /**
   * Configuration was loaded from the local cache.
   */
  Cache = 'cache',
  /**
   * Configuration was loaded from the network.
   */
  Network = 'network'
}

/**
 * ConfigurationFeed provides a mechanism for components to communicate about the latest
 * configurations (without necessarily activating them).
 *
 * It serves as a central communication point for configuration updates, allowing components like
 * poller, cache, and activation to coordinate without tight coupling.
 *
 * @internal
 */
export type ConfigurationFeed = BroadcastChannel<[Configuration, ConfigurationSource]>;
