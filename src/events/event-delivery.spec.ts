import Event from './event';
import EventDelivery from './event-delivery';

describe('EventDelivery', () => {
  global.fetch = jest.fn();
  const sdkKey = 'test-sdk-key';
  const ingestionUrl = 'https://test-ingestion.url';
  const testBatch: Event[] = [
    { uuid: '1', timestamp: Date.now(), type: 'test_event', payload: { key: 'value1' } },
    { uuid: '2', timestamp: Date.now(), type: 'test_event', payload: { key: 'value2' } },
    { uuid: '3', timestamp: Date.now(), type: 'test_event', payload: { key: 'value3' } },
  ];
  let eventDelivery: EventDelivery;

  beforeEach(() => {
    jest.clearAllMocks();
    eventDelivery = new EventDelivery(sdkKey, ingestionUrl);
  });

  it('should deliver events successfully when response is OK', async () => {
    const mockResponse = { ok: true, json: async () => ({}) };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    const result = await eventDelivery.deliver(testBatch, {});
    expect(result).toEqual({ failedEvents: [] });
    expect(global.fetch).toHaveBeenCalledWith(ingestionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-eppo-token': sdkKey },
      body: JSON.stringify({ eppo_events: testBatch, context: {} }),
    });
  });

  it('should return failed result if response is not OK', async () => {
    const mockResponse = { ok: false };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    const result = await eventDelivery.deliver(testBatch, {});
    expect(result).toEqual({ failedEvents: testBatch });
  });

  it('should return failed events when response includes failed events', async () => {
    const failedEvents = ['1', '2'];
    const mockResponse = { ok: true, json: async () => ({ failed_events: failedEvents }) };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    const result = await eventDelivery.deliver(testBatch, {});
    expect(result).toEqual({ failedEvents: [testBatch[0], testBatch[1]] });
  });

  it('should return success=true if no failed events in the response', async () => {
    const mockResponse = { ok: true, json: async () => ({}) };
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
    const result = await eventDelivery.deliver(testBatch, {});
    expect(result).toEqual({ failedEvents: [] });
  });

  it('should handle fetch errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
    const result = await eventDelivery.deliver(testBatch, {});
    expect(result).toEqual({ failedEvents: testBatch });
  });
});
