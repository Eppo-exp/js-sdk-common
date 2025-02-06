import Event from './event';
import EventDispatcher from './event-dispatcher';

export default class NoOpEventDispatcher implements EventDispatcher {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  attachContext(key: string, value: string | number | boolean | null): void {
    // Do nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dispatch(_: Event): void {
    // Do nothing
  }
}
