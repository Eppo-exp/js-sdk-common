import { logger } from '../application-logger';

import BatchEventProcessor from './batch-event-processor';
import BatchRetryManager from './batch-retry-manager';
import Event from './event';
import EventDelivery from './event-delivery';
import EventDispatcher from './event-dispatcher';
import NamedEventQueue from './named-event-queue';
import NetworkStatusListener from './network-status-listener';
import NoOpEventDispatcher from './no-op-event-dispatcher';
import SdkKeyDecoder from './sdk-key-decoder';

export type EventDispatcherConfig = {
  // The Eppo SDK key
  sdkKey: string;
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

export type EventContext = Record<string, string | number | boolean | null>;

const MAX_CONTEXT_SERIALIZED_LENGTH = 2048;
const MAX_EVENT_SERIALIZED_LENGTH = 4096;

export const DEFAULT_EVENT_DISPATCHER_BATCH_SIZE = 1_000;
export const DEFAULT_EVENT_DISPATCHER_CONFIG: Omit<
  EventDispatcherConfig,
  'ingestionUrl' | 'sdkKey'
> = {
  deliveryIntervalMs: 10_000,
  retryIntervalMs: 5_000,
  maxRetryDelayMs: 30_000,
  maxRetries: 3,
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
  private readonly context: EventContext = {};
  private dispatchTimer: NodeJS.Timeout | null = null;
  private isOffline = false;

  constructor(
    private readonly batchProcessor: BatchEventProcessor,
    private readonly networkStatusListener: NetworkStatusListener,
    config: EventDispatcherConfig,
  ) {
    this.ensureConfigFields(config);
    const { sdkKey, ingestionUrl, retryIntervalMs, maxRetryDelayMs, maxRetries = 3 } = config;
    this.eventDelivery = new EventDelivery(sdkKey, ingestionUrl);
    this.retryManager = new BatchRetryManager(this.eventDelivery, {
      retryIntervalMs,
      maxRetryDelayMs,
      maxRetries,
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

  attachContext(key: string, value: string | number | boolean | null): void {
    this.ensureValidContext(key, value);
    this.context[key] = value;
  }

  dispatch(event: Event) {
    this.ensureValidEvent(event);
    this.batchProcessor.push(event);
    this.maybeScheduleNextDelivery();
  }

  private ensureValidContext(key: string, value: string | number | boolean | null) {
    if (value && (typeof value === 'object' || Array.isArray(value))) {
      throw new Error('Context value must be a string, number, boolean, or null');
    }
    if (
      value &&
      JSON.stringify({ ...this.context, [key]: value }).length > MAX_CONTEXT_SERIALIZED_LENGTH
    ) {
      throw new Error(
        `Context value must be less than ${MAX_CONTEXT_SERIALIZED_LENGTH} characters`,
      );
    }
  }

  private ensureValidEvent(event: Event) {
    if (JSON.stringify(event).length > MAX_EVENT_SERIALIZED_LENGTH) {
      throw new Error(
        `Event serialized length exceeds maximum allowed length of #{MAX_EVENT_SERIALIZED_LENGTH}`,
      );
    }
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

    // make a defensive copy of the context to avoid mutating the original
    const context = { ...this.context };
    const { failedEvents } = await this.eventDelivery.deliver(batch, context);
    if (failedEvents.length > 0) {
      logger.warn('[EventDispatcher] Failed to deliver some events from batch, retrying...');
      const failedRetry = await this.retryManager.retry(failedEvents, context);
      if (failedRetry.length > 0) {
        // re-enqueue events that failed to retry
        this.batchProcessor.push(...failedRetry);
      }
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

  private ensureConfigFields(config: EventDispatcherConfig) {
    if (!config.ingestionUrl) {
      throw new Error('Missing required ingestionUrl in EventDispatcherConfig');
    }
    if (!config.deliveryIntervalMs) {
      throw new Error('Missing required deliveryIntervalMs in EventDispatcherConfig');
    }
    if (!config.retryIntervalMs) {
      throw new Error('Missing required retryIntervalMs in EventDispatcherConfig');
    }
    if (!config.maxRetryDelayMs) {
      throw new Error('Missing required maxRetryDelayMs in EventDispatcherConfig');
    }
  }
}

/** Creates a new {@link DefaultEventDispatcher} with the provided configuration. */
export function newDefaultEventDispatcher(
  eventQueue: NamedEventQueue<Event>,
  networkStatusListener: NetworkStatusListener,
  sdkKey: string,
  batchSize: number = DEFAULT_EVENT_DISPATCHER_BATCH_SIZE,
  config: Omit<EventDispatcherConfig, 'ingestionUrl' | 'sdkKey'> = DEFAULT_EVENT_DISPATCHER_CONFIG,
): EventDispatcher {
  const sdkKeyDecoder = new SdkKeyDecoder();
  const ingestionUrl = sdkKeyDecoder.decodeEventIngestionUrl(sdkKey);
  if (!ingestionUrl) {
    logger.debug(
      'Unable to parse Event ingestion URL from SDK key, falling back to no-op event dispatcher',
    );
    return new NoOpEventDispatcher();
  }
  return new DefaultEventDispatcher(
    new BatchEventProcessor(eventQueue, batchSize),
    networkStatusListener,
    { ...config, ingestionUrl, sdkKey },
  );
}
