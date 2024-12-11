import { logger } from '../application-logger';

import { Event } from './event-dispatcher';

export default class EventDelivery {
  constructor(private readonly sdkKey: string, private readonly ingestionUrl: string) {}

  async deliver(batch: Event[]): Promise<boolean> {
    try {
      logger.info(
        `[EventDispatcher] Delivering batch of ${batch.length} events to ${this.ingestionUrl}...`,
      );
      const response = await fetch(this.ingestionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-eppo-token': this.sdkKey },
        body: JSON.stringify({ eppo_events: batch }),
      });
      // TODO: Parse response to check `failed_event_uploads` for any failed event ingestions in the batch
      return response.ok;
    } catch {
      logger.warn('Failed to upload event batch');
      return false;
    }
  }
}
