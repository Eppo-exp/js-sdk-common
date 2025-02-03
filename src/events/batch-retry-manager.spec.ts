import BatchRetryManager from './batch-retry-manager';
import Event from './event';

describe('BatchRetryManager', () => {
  const mockDelivery = { deliver: jest.fn() };
  const retryIntervalMs = 100;
  const maxRetryDelayMs = 1000;
  const maxRetries = 3;
  const mockConfig = { retryIntervalMs, maxRetryDelayMs, maxRetries };

  let batchRetryManager: BatchRetryManager;
  let mockBatch: Event[];

  beforeEach(() => {
    jest.clearAllMocks();
    batchRetryManager = new BatchRetryManager(mockDelivery, mockConfig);
    mockBatch = [{ uuid: 'event1' }, { uuid: 'event2' }] as Event[];
  });

  it('should successfully retry and deliver a batch with no failures', async () => {
    mockDelivery.deliver.mockResolvedValueOnce({ failedEvents: [] });
    const result = await batchRetryManager.retry(mockBatch, {});
    expect(result).toEqual([]);
    expect(mockDelivery.deliver).toHaveBeenCalledTimes(1);
    expect(mockDelivery.deliver).toHaveBeenCalledWith(mockBatch, {});
  });

  it('should retry failed deliveries up to maxRetries times and return last failed batch', async () => {
    mockDelivery.deliver.mockResolvedValue({ failedEvents: [{ id: 'event1' }] });
    const result = await batchRetryManager.retry(mockBatch, {});
    expect(result).toEqual([{ id: 'event1' }]);
    expect(mockDelivery.deliver).toHaveBeenCalledTimes(maxRetries);
  });

  it('should exponentially delay retries up to maxRetryDelayMs', async () => {
    mockDelivery.deliver
      .mockResolvedValueOnce({ failedEvents: [{ id: 'event1' }] })
      .mockResolvedValueOnce({ failedEvents: [{ id: 'event1' }] })
      .mockResolvedValueOnce({ failedEvents: [] });

    jest.useFakeTimers();

    const retryPromise = batchRetryManager.retry(mockBatch, {});

    // 1st retry: 100ms
    // 2nd retry: 200ms
    // 3rd retry: 400ms
    await jest.advanceTimersByTimeAsync(100 + 200 + 400);

    const result = await retryPromise;
    expect(result).toEqual([]);
    expect(mockDelivery.deliver).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
  });

  it('should not exceed maxRetryDelayMs for delays', async () => {
    batchRetryManager = new BatchRetryManager(mockDelivery, {
      ...mockConfig,
      maxRetryDelayMs: 300,
    });
    mockDelivery.deliver
      .mockResolvedValueOnce({ failedEvents: mockBatch })
      .mockResolvedValueOnce({ failedEvents: mockBatch })
      .mockResolvedValueOnce({ failedEvents: mockBatch })
      .mockResolvedValueOnce({ failedEvents: mockBatch });

    jest.useFakeTimers();

    const retryPromise = batchRetryManager.retry(mockBatch, {});
    // 100ms + 200ms + 300ms (maxRetryDelayMs) = 600ms
    await jest.advanceTimersByTimeAsync(600);
    const result = await retryPromise;
    expect(result).toEqual(mockBatch);
    jest.useRealTimers();
  });
});
