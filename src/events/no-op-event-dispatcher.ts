import Event from './event';
import EventDispatcher from './event-dispatcher';

export default class NoOpEventDispatcher implements EventDispatcher {
  dispatch(_: Event): void {
    // Do nothing
  }
}
