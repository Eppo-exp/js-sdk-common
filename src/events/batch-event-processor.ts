import Event from './event';
import NamedEventQueue from './named-event-queue';

export default class BatchEventProcessor {
  constructor(
    private readonly eventQueue: NamedEventQueue<Event>,
    private readonly batchSize: number,
  ) {}

  nextBatch(): Event[] {
    return this.eventQueue.splice(this.batchSize);
  }

  push(...events: Event[]): void {
    this.eventQueue.push(...events);
  }

  isEmpty(): boolean {
    return this.eventQueue.isEmpty();
  }
}
