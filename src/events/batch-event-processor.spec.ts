import ArrayBackedNamedEventQueue from './array-backed-named-event-queue';
import BatchEventProcessor from './batch-event-processor';

describe('BatchEventProcessor', () => {
  describe('nextBatch', () => {
    it('should return a batch and remove items from the queue', () => {
      const eventQueue = new ArrayBackedNamedEventQueue('test-queue');
      const processor = new BatchEventProcessor(eventQueue, 2);
      expect(processor.isEmpty()).toBeTruthy();
      expect(processor.nextBatch()).toHaveLength(0);
      processor.push({ id: 'foo-1', data: 'event1', params: {} });
      processor.push({ id: 'foo-2', data: 'event2', params: {} });
      processor.push({ id: 'foo-3', data: 'event3', params: {} });
      expect(processor.isEmpty()).toBeFalsy();
      const batch = processor.nextBatch();
      expect(batch).toEqual([
        { id: 'foo-1', data: 'event1', params: {} },
        { id: 'foo-2', data: 'event2', params: {} },
      ]);
      expect(processor.nextBatch()).toEqual([{ id: 'foo-3', data: 'event3', params: {} }]);
      expect(processor.isEmpty()).toBeTruthy();
    });
  });
});
