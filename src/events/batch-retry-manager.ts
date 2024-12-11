import { logger } from '../application-logger';

import Event from './event';
import EventDelivery from './event-delivery';

/**
 * Attempts to retry delivering a batch of events to the ingestionUrl up to `maxRetries` times
 * using exponential backoff.
 */
export default class BatchRetryManager {
  /**
   * @param config.retryInterval - The minimum retry interval in milliseconds
   * @param config.maxRetryDelayMs - The maximum retry delay in milliseconds
   * @param config.maxRetries - The maximum number of retries
   */
  constructor(
    private readonly delivery: EventDelivery,
    private readonly config: {
      retryIntervalMs: number;
      maxRetryDelayMs: number;
      maxRetries: number;
    },
  ) {}

  /** Re-attempts delivery of the provided batch, returns whether the retry succeeded. */
  async retry(batch: Event[], attempt = 0): Promise<boolean> {
    const { retryIntervalMs, maxRetryDelayMs, maxRetries } = this.config;
    const delay = Math.min(retryIntervalMs * Math.pow(2, attempt), maxRetryDelayMs);
    logger.info(`[BatchRetryManager] Retrying batch delivery in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const { failedEvents } = await this.delivery.deliver(batch);
    if (failedEvents.length === 0) {
      logger.info(`[BatchRetryManager] Batch delivery successfully after ${attempt} retries.`);
      return true;
    }
    // attempts are zero-indexed while maxRetries is not
    if (attempt < maxRetries - 1) {
      return this.retry(failedEvents, attempt + 1);
    } else {
      logger.warn(
        `[BatchRetryManager] Failed to deliver batch after ${maxRetries} retries, bailing`,
      );
      return false;
    }
  }
}
