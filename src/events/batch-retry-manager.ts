import { logger } from '../application-logger';
import { EventContext } from './default-event-dispatcher';

import Event from './event';
import { EventDeliveryResult } from './event-delivery';

export interface IEventDelivery {
  deliver(batch: Event[], context: EventContext): Promise<EventDeliveryResult>;
};

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
    private readonly delivery: IEventDelivery,
    private readonly config: {
      retryIntervalMs: number;
      maxRetryDelayMs: number;
      maxRetries: number;
    },
  ) {}

  /** Re-attempts delivery of the provided batch, returns the UUIDs of events that failed retry. */
  async retry(batch: Event[], context: EventContext, attempt = 0): Promise<Event[]> {
    const { retryIntervalMs, maxRetryDelayMs, maxRetries } = this.config;
    const delay = Math.min(retryIntervalMs * Math.pow(2, attempt), maxRetryDelayMs);
    logger.info(
      `[BatchRetryManager] Retrying batch delivery of ${batch.length} events in ${delay}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));

    const { failedEvents } = await this.delivery.deliver(batch, context);
    if (failedEvents.length === 0) {
      logger.info(`[BatchRetryManager] Batch delivery successfully after ${attempt + 1} tries.`);
      return [];
    }
    // attempts are zero-indexed while maxRetries is not
    if (attempt < maxRetries - 1) {
      return this.retry(failedEvents, context, attempt + 1);
    } else {
      logger.warn(`[BatchRetryManager] Failed to deliver batch after ${maxRetries} tries, bailing`);
      return batch;
    }
  }
}
