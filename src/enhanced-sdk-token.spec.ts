import EnhancedSdkToken from './enhanced-sdk-token';

describe('EnhancedSdkToken', () => {
  it('should extract the event ingestion hostname from the SDK token', () => {
    const token = new EnhancedSdkToken('zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk');
    expect(token.getEventIngestionHostname()).toEqual('123456.e.testing.eppo.cloud');
  });

  it('should extract the subdomain from the SDK token', () => {
    const token = new EnhancedSdkToken(
      'zCsQuoHJxVPp895.Y3M9ZXhwZXJpbWVudCZlaD1hYmMxMjMuZXBwby5jbG91ZA==',
    );
    expect(token.getSubdomain()).toEqual('experiment');
    expect(token.getEventIngestionHostname()).toEqual('abc123.eppo.cloud');
  });

  it('should handle tokens with non URL-safe characters', () => {
    // Include both eh and cs parameters with special characters
    const params = 'eh=12+3456/.e.testing.eppo.cloud&cs=test+subdomain/special';
    const encoded = Buffer.from(params).toString('base64url');
    const token = new EnhancedSdkToken(`zCsQuoHJxVPp895.${encoded}`);

    expect(token.getEventIngestionHostname()).toEqual('12 3456/.e.testing.eppo.cloud');
    expect(token.getSubdomain()).toEqual('test subdomain/special');
  });

  it('should return null for tokens without the required parameter', () => {
    const tokenWithoutEh = new EnhancedSdkToken('zCsQuoHJxVPp895.Y3M9ZXhwZXJpbWVudA=='); // only cs=experiment
    expect(tokenWithoutEh.getEventIngestionHostname()).toBeNull();
    expect(tokenWithoutEh.getSubdomain()).toEqual('experiment');
    expect(tokenWithoutEh.isValid()).toBeTruthy();

    const tokenWithoutCs = new EnhancedSdkToken('zCsQuoHJxVPp895.ZWg9YWJjMTIzLmVwcG8uY2xvdWQ='); // only eh=abc123.eppo.cloud
    expect(tokenWithoutCs.getEventIngestionHostname()).toEqual('abc123.eppo.cloud');
    expect(tokenWithoutCs.getSubdomain()).toBeNull();
    expect(tokenWithoutCs.isValid()).toBeTruthy();
  });

  it('should handle invalid tokens', () => {
    const invalidToken = new EnhancedSdkToken('zCsQuoHJxVPp895');
    expect(invalidToken.getEventIngestionHostname()).toBeNull();
    expect(invalidToken.getSubdomain()).toBeNull();
    expect(invalidToken.isValid()).toBeFalsy();

    const invalidEncodingToken = new EnhancedSdkToken('zCsQuoHJxVPp895.%%%');
    expect(invalidEncodingToken.getEventIngestionHostname()).toBeNull();
    expect(invalidEncodingToken.getSubdomain()).toBeNull();
    expect(invalidEncodingToken.isValid()).toBeFalsy();
  });

  it('should provide access to the original token string', () => {
    const tokenString = 'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk';
    const token = new EnhancedSdkToken(tokenString);
    expect(token.getToken()).toEqual(tokenString);
  });
});
