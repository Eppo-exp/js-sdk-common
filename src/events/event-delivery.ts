import { logger } from '../application-logger';

export default class EventDelivery {
  constructor(private ingestionUrl: string) {}

  async deliver(batch: unknown[]): Promise<boolean> {
    try {
      const response = await fetch(this.ingestionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // TODO: Figure out proper request body encoding format for batch, using JSON for now
        body: JSON.stringify(batch),
      });
      return response.ok;
    } catch {
      logger.warn('Failed to upload event batch');
      return false;
    }
  }
}
