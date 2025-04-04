import { logger } from '../application-logger';
import { Configuration } from '../configuration';
import { ConfigurationFeed } from '../configuration-feed';
import { BroadcastChannel } from '../broadcast';

export type ActivationStrategy = {
  /**
   * Always activate new configuration.
   */
  type: 'always';
} | {
  /**
   * Activate new configuration if the current configuration is stale (older than maxAgeSeconds).
   */
  type: 'stale';
  maxAgeSeconds: number;
} | {
  /**
   * Activate new configuration if the current configuration is empty.
   */
  type: 'empty';
} | {
  /**
   * Never activate new configuration.
   */
  type: 'never';
};

/**
 * `ConfigurationStore` answers a simple question: what configuration is currently active?
 *
 * @internal `ConfigurationStore` shall only be used inside Eppo SDKs.
 */
export class ConfigurationStore {
  private configuration: Configuration;
  private readonly listeners: BroadcastChannel<[Configuration]> = new BroadcastChannel();

  public constructor(configuration: Configuration = Configuration.empty()) {
    this.configuration = configuration;
  }

  /**
   * Register configuration store to receive updates from a configuration feed using the specified
   * activation strategy.
   */
  public register(configurationFeed: ConfigurationFeed, activationStrategy: ActivationStrategy): void {
    if (activationStrategy.type === 'never') {
      // No need to subscribe to configuration feed if we don't want to activate any configuration.
      return;
    }

    configurationFeed.addListener((configuration) => {
      const currentConfiguration = this.getConfiguration();
      const shouldActivate = activationStrategy.type === 'always'
        || (activationStrategy.type === 'stale' && currentConfiguration.isStale(activationStrategy.maxAgeSeconds))
        || (activationStrategy.type === 'empty' && currentConfiguration.isEmpty());

      if (shouldActivate) {
        this.setConfiguration(configuration);
      } else {
        logger.debug('[Eppo SDK] Skipping activation of new configuration');
      }
    });
  }

  public getConfiguration(): Configuration {
    return this.configuration;
  }

  public setConfiguration(configuration: Configuration): void {
    if (this.configuration !== configuration) {
      // Only broadcast if the configuration has changed.
      logger.debug('[Eppo SDK] Activating new configuration');
      this.configuration = configuration;
      this.listeners.broadcast(configuration);
    }
  }

  /**
   * Subscribe to configuration changes. The callback will be called
   * every time configuration is changed.
   *
   * Returns a function to unsubscribe from future updates.
   */
  public onConfigurationChange(listener: (configuration: Configuration) => void): () => void {
    return this.listeners.addListener(listener);
  }
}