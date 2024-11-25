import { logger } from '../application-logger';

import BatchEventProcessor from './batch-event-processor';
import BatchRetryManager from './batch-retry-manager';
import EventDelivery from './event-delivery';
import EventDispatcher, { Event } from './event-dispatcher';
import NetworkStatusListener from './network-status-listener';

export type EventDispatcherConfig = {
  // target url to deliver events to
  ingestionUrl: string;
  // number of milliseconds to wait between each batch delivery
  deliveryIntervalMs: number;
  // minimum amount of milliseconds to wait before retrying a failed delivery
  retryIntervalMs: number;
  // maximum amount of milliseconds to wait before retrying a failed delivery
  maxRetryDelayMs: number;
  // maximum number of retry attempts before giving up on a batch delivery
  maxRetries?: number;
};

/**
 * @internal
 * An {@link EventDispatcher} that, given the provided config settings, delivers events in batches
 * to the ingestionUrl and retries failed deliveries. Also reacts to network status changes to
 * determine when to deliver events.
 */
export default class DefaultEventDispatcher implements EventDispatcher {
  private readonly eventDelivery: EventDelivery;
  private readonly retryManager: BatchRetryManager;
  private readonly deliveryIntervalMs: number;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private isOffline = false;

  constructor(
    private readonly batchProcessor: BatchEventProcessor,
    private readonly networkStatusListener: NetworkStatusListener,
    config: EventDispatcherConfig,
  ) {
    this.eventDelivery = new EventDelivery(config.ingestionUrl);
    this.retryManager = new BatchRetryManager(this.eventDelivery, {
      retryIntervalMs: config.retryIntervalMs,
      maxRetryDelayMs: config.maxRetryDelayMs,
      maxRetries: config.maxRetries || 3,
    });
    this.deliveryIntervalMs = config.deliveryIntervalMs;
    this.networkStatusListener.onNetworkStatusChange((isOffline) => {
      logger.info(`[EventDispatcher] Network status change, isOffline=${isOffline}.`);
      this.isOffline = isOffline;
      if (isOffline) {
        this.dispatchTimer = null;
      } else {
        this.maybeScheduleNextDelivery();
      }
    });
  }

  dispatch(event: Event) {
    this.batchProcessor.push(event);
    this.maybeScheduleNextDelivery();
  }

  private async deliverNextBatch() {
    if (this.isOffline) {
      logger.warn('[EventDispatcher] Skipping delivery; network status is offline.');
      return;
    }

    const batch = this.batchProcessor.nextBatch();
    if (batch.length === 0) {
      // nothing to deliver
      this.dispatchTimer = null;
      return;
    }

    logger.info(`[EventDispatcher] Delivering batch of ${batch.length} events...`);
    const success = await this.eventDelivery.deliver(batch);
    if (!success) {
      logger.warn('[EventDispatcher] Failed to deliver batch, retrying...');
      await this.retryManager.retry(batch);
    }
    logger.debug(`[EventDispatcher] Delivered batch of ${batch.length} events.`);
    this.dispatchTimer = null;
    this.maybeScheduleNextDelivery();
  }

  private maybeScheduleNextDelivery() {
    // schedule next event delivery when:
    // 1. we're not offline
    // 2. there are enqueued events
    // 3. there isn't already a scheduled delivery
    if (!this.isOffline && !this.batchProcessor.isEmpty() && !this.dispatchTimer) {
      logger.info(`[EventDispatcher] Scheduling next delivery in ${this.deliveryIntervalMs}ms.`);
      this.dispatchTimer = setTimeout(() => this.deliverNextBatch(), this.deliveryIntervalMs);
    }
  }
}
