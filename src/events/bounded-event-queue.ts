import { logger } from '../application-logger';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';

import NamedEventQueue from './named-event-queue';

/** A bounded event queue that drops events when it reaches its maximum size. */
export class BoundedEventQueue<T> implements NamedEventQueue<T> {
  constructor(
    private readonly queue: NamedEventQueue<T>,
    private readonly maxSize = MAX_EVENT_QUEUE_SIZE,
  ) {}

  length = this.queue.length;

  name = this.queue.name;

  splice(count: number): T[] {
    return this.queue.splice(count);
  }

  isEmpty(): boolean {
    return this.queue.isEmpty();
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.queue[Symbol.iterator]();
  }

  push(event: T) {
    if (this.queue.length < this.maxSize) {
      this.queue.push(event);
    } else {
      logger.warn(`Dropping event for queue ${this.queue.name} since the queue is full`);
    }
  }

  /** Clears all events in the queue and returns them in insertion order. */
  flush(): T[] {
    const events = [...this.queue];
    this.queue.length = 0;
    return events;
  }
}
