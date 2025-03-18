import { Base64 } from 'js-base64';

import SdkKeyDecoder from './sdk-key-decoder';

describe('SdkKeyDecoder', () => {
  let decoder: SdkKeyDecoder;
  const sdkKeyPrefix = 'zCsQuoHJxVPp895';

  beforeEach(() => {
    decoder = new SdkKeyDecoder();
  });

  it('should return null for all URLs when no hosts are encoded', () => {
    const sdkKey = 'invalid.sdk.key';
    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBeNull();
    expect(decoder.decodeAssignmentConfigurationUrl(sdkKey)).toBeNull();
    expect(decoder.decodeEdgeConfigurationUrl(sdkKey)).toBeNull();
  });

  it('should return event ingestion URL when only event ingestion host is encoded', () => {
    const sdkKey = `${sdkKeyPrefix}.${Base64.encode('eh=123456.e.testing.eppo.cloud')}.signature`;
    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBe(
      'https://123456.e.testing.eppo.cloud/v0/i',
    );
    expect(decoder.decodeAssignmentConfigurationUrl(sdkKey)).toBeNull();
    expect(decoder.decodeEdgeConfigurationUrl(sdkKey)).toBeNull();
  });

  it('should return assignment configuration URL when only configuration host is encoded', () => {
    const sdkKey = `${sdkKeyPrefix}.${Base64.encode('ch=123456.c.testing.eppo.cloud')}.signature`;
    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBeNull();
    expect(decoder.decodeAssignmentConfigurationUrl(sdkKey)).toBe(
      'https://123456.c.testing.eppo.cloud/assignment',
    );
    expect(decoder.decodeEdgeConfigurationUrl(sdkKey)).toBe(
      'https://123456.c.testing.eppo.cloud/edge',
    );
  });

  it('should decode strings with non URL-safe characters', () => {
    // this is not a really valid ingestion URL, but it's useful for testing the decoder
    const invalidUrl = 'eh=12+3456/.e.testing.eppo.cloud';
    const encoded = Buffer.from(invalidUrl).toString('base64url');
    const hostname = decoder.decodeEventIngestionUrl(`zCsQuoHJxVPp895.${encoded}`);
    expect(hostname).toEqual('https://12 3456/.e.testing.eppo.cloud/v0/i');
  });

  it('should handle malformed SDK keys gracefully', () => {
    const malformedKeys = [
      '',
      'invalid',
      'invalid.',
      'invalid.invalid',
      'invalid.invalid.invalid',
      `valid.${Base64.encode('invalid=host')}.signature`,
    ];

    malformedKeys.forEach((key) => {
      expect(decoder.decodeEventIngestionUrl(key)).toBeNull();
      expect(decoder.decodeAssignmentConfigurationUrl(key)).toBeNull();
      expect(decoder.decodeEdgeConfigurationUrl(key)).toBeNull();
    });
  });

  it('should handle URLs with existing schemes', () => {
    const hosts = ['eh=http://event.host', 'ch=https://config.host'].join('&');
    const sdkKey = `${sdkKeyPrefix}.${Base64.encode(hosts)}.signature`;

    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBe('http://event.host/v0/i');
    expect(decoder.decodeAssignmentConfigurationUrl(sdkKey)).toBe('https://config.host/assignment');
    expect(decoder.decodeEdgeConfigurationUrl(sdkKey)).toBe('https://config.host/edge');
  });

  it('should add https scheme when protocol is missing', () => {
    const hosts = ['eh=event.host', 'ch=config.host:8080'].join('&');
    const sdkKey = `${sdkKeyPrefix}.${Base64.encode(hosts)}.signature`;

    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBe('https://event.host/v0/i');
    expect(decoder.decodeAssignmentConfigurationUrl(sdkKey)).toBe(
      'https://config.host:8080/assignment',
    );
    expect(decoder.decodeEdgeConfigurationUrl(sdkKey)).toBe('https://config.host:8080/edge');
  });

  it('should handle special characters in URLs', () => {
    const specialHost = 'eh=test.host/with+special@chars?param=value';
    const sdkKey = `${sdkKeyPrefix}.${Base64.encode(specialHost)}.signature`;
    expect(decoder.decodeEventIngestionUrl(sdkKey)).toBe(
      'https://test.host/with special@chars?param=value/v0/i',
    );
  });
});
