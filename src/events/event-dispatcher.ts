import Event from './event';

export default interface EventDispatcher {
  /** Dispatches (enqueues) an event for eventual delivery. */
  dispatch(event: Event): void;
}
