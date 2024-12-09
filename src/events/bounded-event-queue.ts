import { logger } from '../application-logger';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';

import NamedEventQueue from './named-event-queue';

/** A bounded event queue that drops events when it reaches its maximum size. */
export class BoundedEventQueue<T> implements NamedEventQueue<T> {
  constructor(
    readonly name: string,
    private readonly queue = new Array<T>(),
    private readonly maxSize = MAX_EVENT_QUEUE_SIZE,
  ) {}

  get length() {
    return this.queue.length;
  }

  splice(count: number): T[] {
    return this.queue.splice(count);
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.queue[Symbol.iterator]();
  }

  push(...events: T[]) {
    const { name, maxSize, queue } = this;
    while (queue.length < maxSize && events.length > 0) {
      queue.push(...events.splice(0, 1));
    }
    if (events.length > 0) {
      logger.warn(
        `Dropping ${events.length} events for queue ${name} since maxSize of ${maxSize} reached.`,
      );
    }
  }

  /** Clears all events in the queue and returns them in insertion order. */
  flush(): T[] {
    const events = [...this.queue];
    this.queue.length = 0;
    return events;
  }
}
