import NamedEventQueue from "./named-event-queue";

/**
 * @internal
 * A named event queue backed by an **unbounded** array.
 * This class probably should NOT be used directly, but only as a backing store for
 * {@link BoundedEventQueue}.
 */
export default class ArrayBackedNamedEventQueue<T>
  implements NamedEventQueue<T>
{
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

  splice(count: number): T[] {
    return this.events.splice(0, count);
  }

  isEmpty(): boolean {
    return this.events.length === 0;
  }
}
