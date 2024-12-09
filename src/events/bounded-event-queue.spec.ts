import { logger } from '../application-logger';

import { BoundedEventQueue } from './bounded-event-queue';

const maxSize = 5;

describe('BoundedEventQueue', () => {
  it('should initialize with the correct name and empty queue', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    expect(queue.name).toBe('testQueue');
    expect(queue.length).toBe(0);
    expect(queue.isEmpty()).toBe(true);
  });

  it('push should add events to the queue within maxSize', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    queue.push('event1', 'event2');
    expect(queue.length).toBe(2);
    expect([...queue]).toEqual(['event1', 'event2']);
  });

  it('push should drop events if maxSize is exceeded', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    const spyLoggerWarn = jest.spyOn(logger, 'warn').mockImplementation();

    queue.push('event1', 'event2', 'event3', 'event4', 'event5');
    expect(queue.length).toBe(5);

    queue.push('event6');
    expect(queue.length).toBe(5); // Max size reached, event6 should not be added
    expect(spyLoggerWarn).toHaveBeenCalledWith(
      'Dropping 1 events for queue testQueue since maxSize of 5 reached.',
    );

    spyLoggerWarn.mockRestore();
  });

  it('splice should remove the specified number of events', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    queue.push('event1', 'event2', 'event3');
    const removed = queue.splice(2);
    expect(removed).toEqual(['event3']);
    expect([...queue]).toEqual(['event1', 'event2']);
  });

  it('flush should clear the queue and return all events', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    queue.push('event1', 'event2', 'event3');
    const flushed = queue.flush();
    expect(flushed).toEqual(['event1', 'event2', 'event3']);
    expect(queue.isEmpty()).toBe(true);
  });

  it('isEmpty should return true for an empty queue', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    expect(queue.isEmpty()).toBe(true);
    queue.push('event1');
    expect(queue.isEmpty()).toBe(false);
  });

  it('[Symbol.iterator] should iterate over the queue', () => {
    const queue = new BoundedEventQueue<string>('testQueue', [], maxSize);
    queue.push('event1', 'event2', 'event3');
    const events = [...queue];
    expect(events).toEqual(['event1', 'event2', 'event3']);
  });
});
