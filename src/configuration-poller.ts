import ConfigurationRequestor from './configuration-requestor';
import { Listeners } from './listener';
import { Configuration } from './configuration';
import { randomJitterMs } from './poller';
import { logger } from './application-logger';

/**
 * Polls for new configurations from the Eppo server. When a new configuration is fetched,
 * it is passed to the subscribers of `onConfigurationFetched`.
 * 
 * The poller is created in the stopped state. Call `start` to begin polling.
 * 
 * @internal
 */
export class ConfigurationPoller {
  private readonly listeners = new Listeners<[Configuration]>();
  private readonly basePollingIntervalMs: number;
  private readonly maxPollingIntervalMs: number;
  private isRunning = false;

  public constructor(
    private readonly configurationRequestor: ConfigurationRequestor,
    options: {
      basePollingIntervalMs: number;
      maxPollingIntervalMs: number;
    },
  ) {
    this.basePollingIntervalMs = options.basePollingIntervalMs;
    this.maxPollingIntervalMs = options.maxPollingIntervalMs;
  }

  /**
   * Starts the configuration poller.
   * 
   * This method will start polling for new configurations from the Eppo server.
   * It will continue to poll until the `stop` method is called.
   */
  public start(): void {
    if (!this.isRunning) {
      this.isRunning = true;
      this.poll().finally(() => {
        // Just to be safe, reset isRunning if the poll() method throws an error or exits (it
        // shouldn't).
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
    this.isRunning = false;
  }

  /**
   * Register a listener to be notified when new configuration is fetched.
   * @param listener Callback function that receives the fetched `Configuration` object
   * @returns A function that can be called to unsubscribe the listener.
   */
  public onConfigurationFetched(listener: (configuration: Configuration) => void): () => void {
    return this.listeners.addListener(listener);
  }

  /**
   * Fetch configuration immediately without waiting for the next polling cycle.
   * 
   * Note: This does not coordinate with active polling - polling intervals will not be adjusted
   * when using this method.
   * 
   * @throws If there is an error fetching the configuration
   */
  public async fetchImmediate(): Promise<Configuration | null> {
    const configuration = await this.configurationRequestor.fetchConfiguration();
    if (configuration) {
      this.listeners.notify(configuration);
    }
    return configuration;
  }

  private async poll(): Promise<void> {
    // Number of failures we've seen in a row.
    let consecutiveFailures = 0;

    while (this.isRunning) {
      try {
        const configuration = await this.configurationRequestor.fetchConfiguration();
        if (configuration && this.isRunning) {
          this.listeners.notify(configuration);
        }
        // Reset failure counter on success
        consecutiveFailures = 0;
      } catch (err) {
        logger.warn('Eppo SDK encountered an error polling configurations', { err });
        consecutiveFailures++;
      }

      if (consecutiveFailures === 0) {
        await timeout(this.basePollingIntervalMs + randomJitterMs(this.basePollingIntervalMs));
      } else {
        // Exponential backoff capped at maxPollingIntervalMs.
        const baseDelayMs = Math.min((Math.pow(2, consecutiveFailures) * this.basePollingIntervalMs), this.maxPollingIntervalMs);
        const delayMs = baseDelayMs + randomJitterMs(baseDelayMs);

        logger.warn('Eppo SDK will try polling again', {
          delayMs,
          consecutiveFailures,
        });

        await timeout(delayMs);
      }
    }
  }
}

function timeout(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

