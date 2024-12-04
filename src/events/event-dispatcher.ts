import { Event } from '@eppo/protobuf-schemas';

export default interface EventDispatcher {
  /** Dispatches (enqueues) an event for eventual delivery. */
  dispatch(event: Event): void;
}
