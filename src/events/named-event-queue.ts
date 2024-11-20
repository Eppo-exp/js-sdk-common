/** A queue of events that can be named. */
export default interface NamedEventQueue<T> {
  length: number;

  name: string;

  push(event: T): void;

  [Symbol.iterator](): IterableIterator<T>;

  shift(): T | undefined;
}
