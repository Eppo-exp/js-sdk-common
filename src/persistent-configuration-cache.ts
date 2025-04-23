import { logger } from './application-logger';
import { Configuration } from './configuration';
import { ConfigurationFeed, ConfigurationSource } from './configuration-feed';

/**
 * Persistent configuration storages are responsible for persisting
 * configuration between SDK reloads.
 */
export interface PersistentConfigurationStorage {
  /**
   * Load configuration from the persistent storage.
   *
   * The method may fail to load a configuration or throw an
   * exception (which is generally ignored).
   */
  loadConfiguration(): PromiseLike<Configuration | null>;

  /**
   * Store configuration to the persistent storage.
   *
   * The method is allowed to do async work (which is not awaited) or
   * throw exceptions (which are ignored).
   */
  storeConfiguration(configuration: Configuration | null): PromiseLike<void>;
}

/**
 * ConfigurationCache is a helper class that subscribes to a configuration feed and stores latest
 * configuration in persistent storage.
 *
 * @internal
 */
export class PersistentConfigurationCache {
  constructor(
    private readonly storage: PersistentConfigurationStorage,
    private readonly configurationFeed?: ConfigurationFeed,
  ) {
    configurationFeed?.addListener(async (configuration, source) => {
      if (source !== ConfigurationSource.Cache) {
        try {
          await this.storage.storeConfiguration(configuration);
        } catch (err) {
          logger.error({ err }, '[Eppo SDK] Failed to store configuration to persistent storage');
        }
      }
    });
  }

  public async loadConfiguration({
    maxStaleSeconds = Infinity,
  }: { maxStaleSeconds?: number } = {}): Promise<Configuration | null> {
    try {
      const configuration = await this.storage.loadConfiguration();
      if (configuration) {
        const age = configuration.getAgeMs();
        if (age !== undefined && age > maxStaleSeconds * 1000) {
          logger.debug(
            { age, maxStaleSeconds },
            '[Eppo SDK] Cached configuration is too old to be used',
          );
          return null;
        }

        this.configurationFeed?.broadcast(configuration, ConfigurationSource.Cache);
      }
      return configuration;
    } catch (err) {
      logger.error({ err }, '[Eppo SDK] Failed to load configuration from persistent storage');
      return null;
    }
  }
}
