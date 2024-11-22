import { logger } from '../application-logger';

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

  async retry(batch: unknown[], attempt = 0): Promise<void> {
    const { retryIntervalMs, maxRetryDelayMs, maxRetries } = this.config;
    const delay = Math.min(retryIntervalMs * Math.pow(2, attempt), maxRetryDelayMs);
    logger.info(`[BatchRetryManager] Retrying batch delivery in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const success = await this.delivery.deliver(batch);
    if (success) {
      logger.info(`[BatchRetryManager] Batch delivery successfully after ${attempt} retries.`);
      return;
    }
    if (attempt < maxRetries) {
      return this.retry(batch, attempt + 1);
    } else {
      // TODO: Persist batch to avoid data loss
      logger.warn(
        `[BatchRetryManager] Failed to deliver batch after ${maxRetries} retries, bailing`,
      );
    }
  }
}
