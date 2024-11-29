import NamedEventQueue from './named-event-queue';

export default class BatchEventProcessor {
  constructor(
    private readonly eventQueue: NamedEventQueue<unknown>,
    private readonly batchSize: number,
  ) {}

  nextBatch(): unknown[] {
    return this.eventQueue.splice(this.batchSize);
  }

  push(event: unknown): void {
    this.eventQueue.push(event);
  }

  isEmpty(): boolean {
    return this.eventQueue.isEmpty();
  }
}
