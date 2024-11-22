import NamedEventQueue from './named-event-queue';

/** A named event queue backed by an array. */
export default class ArrayBackedNamedEventQueue<T> implements NamedEventQueue<T> {
  private readonly events: T[] = [];

  constructor(public readonly name: string) {}

  get length(): number {
    return this.events.length;
  }

  set length(value: number) {
    this.events.length = value;
  }

  push(event: T): void {
    this.events.push(event);
  }

  [Symbol.iterator](): IterableIterator<T> {
    return this.events[Symbol.iterator]();
  }

  shift(): T | undefined {
    return this.events.shift();
  }
}
