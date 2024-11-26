import SdkKeyDecoder from './sdk-key-decoder';

describe('SdkKeyDecoder', () => {
  it('should decode the event ingestion hostname from the SDK key', () => {
    const decoder = new SdkKeyDecoder();
    const hostname = decoder.decodeEventIngestionHostName(
      'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk',
    );
    expect(hostname).toEqual('123456.e.testing.eppo.cloud');
  });

  it("should return null if the SDK key doesn't contain the event ingestion hostname", () => {
    const decoder = new SdkKeyDecoder();
    expect(decoder.decodeEventIngestionHostName('zCsQuoHJxVPp895')).toBeNull();
    expect(decoder.decodeEventIngestionHostName('zCsQuoHJxVPp895.xxxxxx')).toBeNull();
  });
});
