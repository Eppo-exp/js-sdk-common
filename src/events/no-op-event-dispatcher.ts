import Event from './event';
import EventDispatcher from './event-dispatcher';

export default class NoOpEventDispatcher implements EventDispatcher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dispatch(_: Event): void {
    // Do nothing
  }
}
