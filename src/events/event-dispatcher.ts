export type Event = {
  uuid: string;
  timestamp: number;
  type: string;
  payload: Record<string, unknown>;
};

export default interface EventDispatcher {
  /** Dispatches (enqueues) an event for eventual delivery. */
  dispatch(event: Event): void;
}
