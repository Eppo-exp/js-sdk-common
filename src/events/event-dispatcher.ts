import Event from './event';

export default interface EventDispatcher {
  /** Dispatches (enqueues) an event for eventual delivery. */
  dispatch(event: Event): void;
  /**
   * Attaches a context to be included with all events dispatched by this dispatcher.
   * The context is delivered as a top-level object in the ingestion request payload.
   * An existing key can be removed by providing a `null` value.
   * Calling this method with same key multiple times causes only the last value to be used for the
   * given key.
   *
   * @param key - The context entry key.
   * @param value - The context entry value.
   */
  attachContext(key: string, value: string | number | boolean | null): void;
}
