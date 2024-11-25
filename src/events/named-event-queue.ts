/** A queue of events that can be named. */
export default interface NamedEventQueue<T> {
  length: number;

  name: string;

  /** Add an element to the end of the array */
  push(event: T): void;

  [Symbol.iterator](): IterableIterator<T>;

  /** changes the contents of an array by removing count elements from the start of the queue */
  splice(count: number): T[];

  /** Returns true if the queue is empty */
  isEmpty(): boolean;
}