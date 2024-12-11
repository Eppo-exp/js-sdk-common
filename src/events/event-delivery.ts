import { logger } from '../application-logger';

import Event from './event';

export type EventDeliveryResult = {
  success: boolean;
  failedEvents?: string[];
};

export default class EventDelivery {
  constructor(private readonly sdkKey: string, private readonly ingestionUrl: string) {}

  /**
   * Delivers a batch of events to the ingestion URL. Returns whether the delivery succeeded and an
   * optional array of failedEvent UUIDs otherwise
   */
  async deliver(batch: Event[]): Promise<EventDeliveryResult> {
    try {
      logger.info(
        `[EventDispatcher] Delivering batch of ${batch.length} events to ${this.ingestionUrl}...`,
      );
      const response = await fetch(this.ingestionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-eppo-token': this.sdkKey },
        body: JSON.stringify({ eppo_events: batch }),
      });
      if (response.ok) {
        return await this.parseResponseBody(response);
      } else {
        return { success: false };
      }
    } catch {
      logger.warn('Failed to upload event batch');
      return { success: false };
    }
  }

  private async parseResponseBody(response: Response): Promise<EventDeliveryResult> {
    logger.info('[EventDispatcher] Batch delivered successfully.');
    const responseBody = (await response.json()) as { failed_events?: string[] };
    const failedEvents = responseBody?.failed_events || [];
    if (failedEvents.length > 0) {
      const failedEventUuids = failedEvents.join(', ');
      logger.warn(`[EventDispatcher] ${failedEventUuids.length} failed to be processed`);
      return { success: false, failedEvents };
    } else {
      return { success: true };
    }
  }
}
