import ArrayBackedNamedEventQueue from './array-backed-named-event-queue';
import BatchEventProcessor from './batch-event-processor';
import Event from './event';

describe('BatchEventProcessor', () => {
  describe('nextBatch', () => {
    it('should return a batch and remove items from the queue', () => {
      const eventQueue = new ArrayBackedNamedEventQueue<Event>('test-queue');
      const processor = new BatchEventProcessor(eventQueue, 2);
      expect(processor.isEmpty()).toBeTruthy();
      expect(processor.nextBatch()).toHaveLength(0);
      const timestamp = new Date().getTime();
      const type = 'test';
      const event1 = { uuid: 'foo-1', payload: { id: 'event1' }, timestamp, type };
      const event2 = { uuid: 'foo-2', payload: { id: 'event2' }, timestamp, type };
      const event3 = { uuid: 'foo-3', payload: { id: 'event3' }, timestamp, type };
      processor.push(event1);
      processor.push(event2);
      processor.push(event3);
      expect(processor.isEmpty()).toBeFalsy();
      const batch = processor.nextBatch();
      expect(batch).toEqual([event1, event2]);
      expect(processor.nextBatch()).toEqual([event3]);
      expect(processor.isEmpty()).toBeTruthy();
    });
  });

  describe('batchSize', () => {
    const queue = new ArrayBackedNamedEventQueue<Event>('test-queue');

    it('should clamp batch size to min', () => {
      const processor = new BatchEventProcessor(queue, 2);
      expect(processor['batchSize']).toBe(100);
    });

    it('should clamp batch size to max', () => {
      const processor = new BatchEventProcessor(queue, 100_000_000);
      expect(processor['batchSize']).toBe(10_000);
    });

    it('should set batch size if within bounds', () => {
      const processor = new BatchEventProcessor(queue, 1_000);
      expect(processor['batchSize']).toBe(1_000);
    });
  });
});
