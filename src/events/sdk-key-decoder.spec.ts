import SdkKeyDecoder from './sdk-key-decoder';

describe('SdkKeyDecoder', () => {
  const decoder = new SdkKeyDecoder();
  it('should decode the event ingestion hostname from the SDK key', () => {
    const hostname = decoder.decodeEventIngestionUrl(
      'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk',
    );
    expect(hostname).toEqual('https://123456.e.testing.eppo.cloud/v0/i');
  });

  it('should decode strings with non URL-safe characters', () => {
    // this is not a really valid ingestion URL, but it's useful for testing the decoder
    const invalidUrl = 'eh=12+3456/.e.testing.eppo.cloud';
    const encoded = Buffer.from(invalidUrl).toString('base64url');
    const hostname = decoder.decodeEventIngestionUrl(`zCsQuoHJxVPp895.${encoded}`);
    expect(hostname).toEqual('https://12 3456/.e.testing.eppo.cloud/v0/i');
  });

  it("should return null if the SDK key doesn't contain the event ingestion hostname", () => {
    expect(decoder.decodeEventIngestionUrl('zCsQuoHJxVPp895')).toBeNull();
    expect(decoder.decodeEventIngestionUrl('zCsQuoHJxVPp895.xxxxxx')).toBeNull();
  });
});
