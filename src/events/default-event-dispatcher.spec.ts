import ArrayBackedNamedEventQueue from './array-backed-named-event-queue';
import BatchEventProcessor from './batch-event-processor';
import DefaultEventDispatcher, {
  EventDispatcherConfig,
  newDefaultEventDispatcher,
} from './default-event-dispatcher';
import Event from './event';
import NetworkStatusListener from './network-status-listener';
import NoOpEventDispatcher from './no-op-event-dispatcher';

global.fetch = jest.fn();

const mockNetworkStatusListener = {
  isOffline: () => false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onNetworkStatusChange: (_: (_: boolean) => void) => null as unknown as void,
};

const createDispatcher = (
  configOverrides: Partial<
    EventDispatcherConfig & { networkStatusListener: NetworkStatusListener }
  > = {},
  eventQueue = new ArrayBackedNamedEventQueue<Event>('test-queue'),
) => {
  const batchSize = 2;
  const defaultConfig: EventDispatcherConfig = {
    ingestionUrl: 'http://example.com',
    deliveryIntervalMs: 100,
    retryIntervalMs: 300,
    maxRetryDelayMs: 5000,
    maxRetries: 3,
    sdkKey: 'test-sdk-key',
  };
  const config = { ...defaultConfig, ...configOverrides };
  const batchProcessor = new BatchEventProcessor(eventQueue, batchSize);
  // force batch size to 2 for testing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  batchProcessor['batchSize'] = 2;
  const dispatcher = new DefaultEventDispatcher(
    batchProcessor,
    configOverrides.networkStatusListener || mockNetworkStatusListener,
    config,
  );
  return { dispatcher, batchProcessor };
};

describe('DefaultEventDispatcher', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('BatchEventProcessor', () => {
    it('processes events in batches of the configured size', () => {
      const { dispatcher, batchProcessor } = createDispatcher();

      // Add three events to the queue
      dispatcher.dispatch({
        uuid: 'foo-1',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: 'foo-2',
        payload: { foo: 'event2' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: 'foo-3',
        payload: { foo: 'event3' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      const batch1 = batchProcessor.nextBatch();
      expect(batch1).toHaveLength(2);
      const batch2 = batchProcessor.nextBatch();
      expect(batch2).toHaveLength(1);
      const batch3 = batchProcessor.nextBatch();
      expect(batch3).toHaveLength(0);
      expect(batchProcessor.isEmpty()).toBe(true);
    });
  });

  describe('deliverNextBatch', () => {
    it('delivers the next batch of events using fetch', async () => {
      const { dispatcher } = createDispatcher();
      dispatcher.dispatch({
        uuid: 'foo-1',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: 'foo-2',
        payload: { foo: 'event2' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: 'foo-3',
        payload: { foo: 'event3' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      const fetch = global.fetch as jest.Mock;
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-eppo-token': 'test-sdk-key' },
        }),
      );

      let fetchOptions = fetch.mock.calls[0][1];
      let payload = JSON.parse(fetchOptions.body);
      expect(payload).toEqual({
        eppo_events: [
          expect.objectContaining({ payload: { foo: 'event1' } }),
          expect.objectContaining({ payload: { foo: 'event2' } }),
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-eppo-token': 'test-sdk-key' },
        }),
      );

      fetchOptions = fetch.mock.calls[1][1];
      payload = JSON.parse(fetchOptions.body);
      expect(payload).toEqual({
        eppo_events: [expect.objectContaining({ payload: { foo: 'event3' } })],
      });
    });

    it('does not schedule delivery if the queue is empty', async () => {
      createDispatcher();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('offline handling', () => {
    it('skips delivery when offline', async () => {
      let isOffline = false;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let cb = (_: boolean) => null as unknown as void;
      const networkStatusListener = {
        isOffline: () => isOffline,
        onNetworkStatusChange: (callback: (isOffline: boolean) => void) => {
          cb = callback;
        },
        triggerNetworkStatusChange: () => cb(isOffline),
      };
      const { dispatcher } = createDispatcher({ networkStatusListener });
      dispatcher.dispatch({
        uuid: '1',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: '2',
        payload: { foo: 'event2' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      isOffline = true;
      // simulate the network going offline
      networkStatusListener.triggerNetworkStatusChange();

      // Fast-forward, should not attempt delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('resumes delivery when back online', async () => {
      let isOffline = true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let cb = (_: boolean) => null as unknown as void;
      const networkStatusListener = {
        isOffline: () => isOffline,
        onNetworkStatusChange: (callback: (isOffline: boolean) => void) => {
          cb = callback;
        },
        triggerNetworkStatusChange: () => cb(isOffline),
      };
      const { dispatcher } = createDispatcher({ networkStatusListener });
      dispatcher.dispatch({
        uuid: '1',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });
      dispatcher.dispatch({
        uuid: '2',
        payload: { foo: 'event2' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      const fetch = global.fetch as jest.Mock;
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      isOffline = true;
      // simulate the network going offline
      networkStatusListener.triggerNetworkStatusChange();

      // Fast-forward, should not attempt delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).not.toHaveBeenCalled();

      isOffline = false;
      // simulate the network going back online
      networkStatusListener.triggerNetworkStatusChange();

      // Fast-forward, should attempt delivery
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('retry logic', () => {
    it('retries failed deliveries after the retry interval', async () => {
      const { dispatcher } = createDispatcher();
      dispatcher.dispatch({
        uuid: 'foo',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      // Simulate fetch failure on the first attempt
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false }) // First attempt fails
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }); // Second attempt succeeds

      // Fast-forward to trigger the first attempt
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Fast-forward to trigger the retry
      await new Promise((resolve) => setTimeout(resolve, 100));
      // no retries yet since retry interval is 300ms
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('re-enqueues failed retries', async () => {
      const eventQueue = new ArrayBackedNamedEventQueue<Event>('test-queue');
      const { dispatcher } = createDispatcher({ maxRetries: 1 }, eventQueue);
      dispatcher.dispatch({
        uuid: 'foo',
        payload: { foo: 'event1' },
        timestamp: new Date().getTime(),
        type: 'foo',
      });

      // Simulate fetch failure on two attempt
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false }) // First attempt fails
        .mockResolvedValueOnce({ ok: false }); // Second attempt fails

      // Fast-forward to trigger the first attempt
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Fast-forward to trigger the retry
      await new Promise((resolve) => setTimeout(resolve, 100));
      // no retries yet since retry interval is 300ms
      expect(global.fetch).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // ensure that failed retry has been re-enqueued
      expect(eventQueue.length).toBe(1);
    });
  });

  describe('newDefaultEventDispatcher', () => {
    it('should fallback to no-op dispatcher if SDK key is invalid', () => {
      const eventDispatcher = newDefaultEventDispatcher(
        new ArrayBackedNamedEventQueue('test-queue'),
        mockNetworkStatusListener,
        'invalid-sdk-key',
      );
      expect(eventDispatcher).toBeInstanceOf(NoOpEventDispatcher);
    });

    it('should create a new DefaultEventDispatcher with the provided configuration', () => {
      const eventQueue = new ArrayBackedNamedEventQueue<Event>('test-queue');
      const dispatcher = newDefaultEventDispatcher(
        eventQueue,
        mockNetworkStatusListener,
        'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk',
      );
      expect(dispatcher).toBeInstanceOf(DefaultEventDispatcher);
    });
  });

  describe('validation', () => {
    it('should throw an error if the serialized event is too long', () => {
      const { dispatcher } = createDispatcher();
      // craft a payload that is over the limit
      const payload = 'a'.repeat(5000);
      expect(() =>
        dispatcher.dispatch({
          uuid: 'foo-1',
          payload: { foo: payload },
          timestamp: new Date().getTime(),
          type: 'foo',
        }),
      ).toThrow();
    });

    it('should not throw an error if the serialized event is within the limit', () => {
      const { dispatcher } = createDispatcher();
      const payload = 'a'.repeat(4000);
      const fetch = global.fetch as jest.Mock;
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      expect(() =>
        dispatcher.dispatch({
          uuid: 'foo-1',
          payload: { foo: payload },
          timestamp: new Date().getTime(),
          type: 'foo',
        }),
      ).not.toThrow();
    });
  });
});
