export type Event = {
  id: string;
  data: unknown;
  params?: Record<string, unknown>;
};

export default interface EventDispatcher {
  /** Dispatches (enqueues) an event for eventual delivery. */
  dispatch(event: Event): void;
}
