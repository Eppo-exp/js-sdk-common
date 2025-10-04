import { logger } from '../application-logger';

import { IEventDelivery } from './batch-retry-manager';
import { EventContext } from './default-event-dispatcher';
import Event from './event';

export type EventDeliveryResult = {
  failedEvents: Event[];
};

export default class EventDelivery implements IEventDelivery {
  constructor(
    private readonly sdkKey: string,
    private readonly ingestionUrl: string,
  ) {}

  /**
   * Delivers a batch of events to the ingestion URL endpoint. Returns the UUIDs of any events from
   * the batch that failed ingestion.
   */
  async deliver(batch: Event[], context: EventContext): Promise<EventDeliveryResult> {
    try {
      logger.info(
        `[EventDispatcher] Delivering batch of ${batch.length} events to ${this.ingestionUrl}...`,
      );
      const response = await fetch(this.ingestionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-eppo-token': this.sdkKey },
        body: JSON.stringify({ eppo_events: batch, context }),
      });
      if (response.ok) {
        return await this.parseFailedEvents(response, batch);
      } else {
        return { failedEvents: batch };
      }
    } catch (e: any) {
      logger.warn(e, `Failed to upload event batch`);
      return { failedEvents: batch };
    }
  }

  private async parseFailedEvents(
    response: Response,
    batch: Event[],
  ): Promise<EventDeliveryResult> {
    logger.info('[EventDispatcher] Batch delivered successfully.');
    const responseBody = (await response.json()) as { failed_events?: string[] };
    const failedEvents = new Set(responseBody?.failed_events || []);
    if (failedEvents.size > 0) {
      logger.warn(
        `[EventDispatcher] ${failedEvents.size}/${batch.length} events failed ingestion.`,
      );
      // even though some events may have failed to successfully deliver, we'll still consider
      // the batch as a whole to have been delivered successfully and just re-enqueue the failed
      // events for retry later
      return { failedEvents: batch.filter(({ uuid }) => failedEvents.has(uuid)) };
    } else {
      return { failedEvents: [] };
    }
  }
}
