import ConfigurationRequestor from './configuration-requestor';
import { logger } from './application-logger';
import { POLL_JITTER_PCT } from './constants';
import { ConfigurationFeed, ConfigurationSource } from './configuration-feed';

/**
 * Polls for new configurations from the Eppo server. When a new configuration is fetched,
 * it is published to the configuration feed.
 *
 * The poller is created in the stopped state. Call `start` to begin polling.
 *
 * @internal
 */
export class ConfigurationPoller {
  private readonly configurationFeed?: ConfigurationFeed;
  private readonly basePollingIntervalMs: number;
  private readonly maxPollingIntervalMs: number;
  private readonly maxAgeMs: number;

  private isRunning = false;

  // We're watching configuration feed and recording the latest known fetch time (in milliseconds
  // since Unix epoch), so we don't poll for configuration too often.
  private lastFetchTime?: number;

  public constructor(
    private readonly configurationRequestor: ConfigurationRequestor,
    options: {
      configurationFeed?: ConfigurationFeed;
      basePollingIntervalMs: number;
      maxPollingIntervalMs: number;
      maxAgeMs: number;
    },
  ) {
    this.basePollingIntervalMs = options.basePollingIntervalMs;
    this.maxPollingIntervalMs = options.maxPollingIntervalMs;
    this.maxAgeMs = options.maxAgeMs;
    this.configurationFeed = options.configurationFeed;

    this.configurationFeed?.addListener((configuration) => {
      const fetchedAt = configuration.getFetchedAt()?.getTime();
      if (!fetchedAt) {
        return;
      }

      if (this.lastFetchTime !== undefined && fetchedAt < this.lastFetchTime) {
        // Ignore configuration if it's not the latest.
        return;
      }

      // Math.min() ensures that we don't use a fetchedAt time that is in the future. If the time is
      // in the future, we use the current time.
      this.lastFetchTime = Math.min(fetchedAt, Date.now());
    });
  }

  /**
   * Starts the configuration poller.
   *
   * This method will start polling for new configurations from the Eppo server.
   * It will continue to poll until the `stop` method is called.
   */
  public start(): void {
    if (!this.isRunning) {
      logger.debug('[Eppo SDK] starting configuration poller');
      this.isRunning = true;
      this.poll().finally(() => {
        // Just to be safe, reset isRunning if the poll() method throws an error or exits
        // unexpectedly (it shouldn't).
        this.isRunning = false;
      });
    }
  }

  /**
   * Stops the configuration poller.
   *
   * This method will stop polling for new configurations from the Eppo server. Note that it will
   * not interrupt the current poll cycle / active fetch, but it will make sure that configuration
   * listeners are not notified of any new configurations after this method is called.
   */
  public stop(): void {
    logger.debug('[Eppo SDK] stopping configuration poller');
    this.isRunning = false;
  }

  private async poll(): Promise<void> {
    let consecutiveFailures = 0;

    while (this.isRunning) {
      if (this.lastFetchTime !== undefined && Date.now() - this.lastFetchTime < this.maxAgeMs) {
        // Configuration is still fresh, so we don't need to poll. Skip this iteration.
        logger.debug('[Eppo SDK] configuration is still fresh, skipping poll');
      } else {
        try {
          logger.debug('[Eppo SDK] polling for new configuration');
          const configuration = await this.configurationRequestor.fetchConfiguration();
          if (configuration && this.isRunning) {
            logger.debug('[Eppo SDK] fetched configuration');
            this.configurationFeed?.broadcast(configuration, ConfigurationSource.Network);
          }

          // Reset failure counter on success
          consecutiveFailures = 0;
        } catch (err) {
          logger.warn({ err }, '[Eppo SDK] encountered an error polling configurations');
          consecutiveFailures++;
        }
      }

      if (consecutiveFailures === 0) {
        await timeout(this.basePollingIntervalMs + randomJitterMs(this.basePollingIntervalMs));
      } else {
        // Exponential backoff capped at maxPollingIntervalMs.
        const baseDelayMs = Math.min(
          Math.pow(2, consecutiveFailures) * this.basePollingIntervalMs,
          this.maxPollingIntervalMs,
        );
        const delayMs = baseDelayMs + randomJitterMs(baseDelayMs);

        logger.warn({ delayMs, consecutiveFailures }, '[Eppo SDK] will try polling again');

        await timeout(delayMs);
      }
    }
  }
}

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @internal
 *
 * Compute a random jitter as a percentage of the polling interval.
 * Will be (5%,10%) of the interval assuming POLL_JITTER_PCT = 0.1
 */
export function randomJitterMs(intervalMs: number) {
  const halfPossibleJitter = (intervalMs * POLL_JITTER_PCT) / 2;
  // We want the randomly chosen jitter to be at least 1ms so total jitter is slightly more than
  // half the max possible.
  //
  // This makes things easy for automated tests as two polls cannot execute within the maximum
  // possible time waiting for one.
  const randomOtherHalfJitter = Math.max(
    Math.floor((Math.random() * intervalMs * POLL_JITTER_PCT) / 2),
    1,
  );
  return halfPossibleJitter + randomOtherHalfJitter;
}
