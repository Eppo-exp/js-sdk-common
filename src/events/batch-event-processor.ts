import Event from './event';
import NamedEventQueue from './named-event-queue';

const MIN_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 10_000;

export default class BatchEventProcessor {
  private readonly batchSize: number;

  constructor(
    private readonly eventQueue: NamedEventQueue<Event>,
    batchSize: number,
  ) {
    // clamp batch size between min and max
    this.batchSize = Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, batchSize));
  }

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
