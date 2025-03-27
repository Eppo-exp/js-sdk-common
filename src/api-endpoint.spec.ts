import * as td from 'testdouble';

import ApiEndpoints from './api-endpoints';
import { BASE_URL as DEFAULT_BASE_URL, DEFAULT_EVENT_DOMAIN } from './constants';
import EnhancedSdkToken from './enhanced-sdk-token';

describe('ApiEndpoints', () => {
  it('should append query parameters to the URL', () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://api.example.com',
      queryParams: {
        apiKey: '12345',
        sdkVersion: 'foobar',
        sdkName: 'ExampleSDK',
      },
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      'http://api.example.com/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      'http://api.example.com/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
  });

  it('should use default base URL if not provided', () => {
    const apiEndpoints = new ApiEndpoints({
      queryParams: {
        apiKey: '12345',
        sdkVersion: 'foobar',
        sdkName: 'ExampleSDK',
      },
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      `${DEFAULT_BASE_URL}/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK`,
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      `${DEFAULT_BASE_URL}/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK`,
    );
  });

  it('should not append query parameters if not provided', () => {
    const apiEndpoints = new ApiEndpoints({});
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(`${DEFAULT_BASE_URL}/data`);
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      `${DEFAULT_BASE_URL}/flag-config/v1/config`,
    );
  });

  describe('Base URL determination', () => {
    it('should use custom baseUrl when provided', () => {
      const customBaseUrl = 'https://custom-domain.com';
      const endpoints = new ApiEndpoints({ baseUrl: customBaseUrl });
      expect(endpoints.endpoint('')).toContain(customBaseUrl);
    });

    it('should use subdomain from SDK token when valid', () => {
      //  cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });
      expect(endpoints.endpoint('/data')).toBe('https://test-subdomain.fscdn.eppo.cloud/api/data');
    });

    it('should prefer custom baseUrl over SDK token subdomain', () => {
      const customBaseUrl = 'https://custom-domain.com';
      //  cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({
        baseUrl: customBaseUrl,
        sdkToken: new EnhancedSdkToken(sdkToken),
      });

      expect(endpoints.endpoint('')).toContain(customBaseUrl);
    });

    it('should not allow custom baseUrl to be the default base url', () => {
      const customBaseUrl = 'https://custom-domain.com';
      //  cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({
        baseUrl: DEFAULT_BASE_URL,
        sdkToken: new EnhancedSdkToken(sdkToken),
      });

      expect(endpoints.endpoint('/data')).toBe('https://test-subdomain.fscdn.eppo.cloud/api/data');
    });

    it('should fallback to DEFAULT_BASE_URL when SDK token has no subdomain', () => {
      // eh=event-hostname
      const sdkToken = 'abc.ZWg9ZXZlbnQtaG9zdG5hbWU=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });
      expect(endpoints.endpoint('').startsWith(DEFAULT_BASE_URL)).toBeTruthy();
    });

    it('should fallback to DEFAULT_BASE_URL when SDK token is invalid', () => {
      const invalidToken = new EnhancedSdkToken('invalid-token');
      const endpoints = new ApiEndpoints({ sdkToken: invalidToken });
      expect(endpoints.endpoint('').startsWith(DEFAULT_BASE_URL)).toBeTruthy();
    });
  });

  describe('Endpoint URL construction', () => {
    it('should use effective base URL for UFC endpoint', () => {
      //  cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });

      expect(endpoints.ufcEndpoint()).toContain(
        'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/config',
      );
    });

    it('should use effective base URL for bandit parameters endpoint', () => {
      // cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });

      expect(endpoints.banditParametersEndpoint()).toContain(
        'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/bandits',
      );
    });

    it('should use the subdomain and default base URL for precomputed flags endpoint', () => {
      // cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({
        sdkToken: new EnhancedSdkToken(sdkToken),
        defaultUrl: 'default.eppo.cloud',
      });

      expect(endpoints.precomputedFlagsEndpoint()).toContain('default.eppo.cloud');
      expect(endpoints.precomputedFlagsEndpoint()).toContain('test-subdomain');
    });

    it('should have exactly one slash between base URL and resource', () => {
      const baseUrlWithSlash = 'https://domain.com/';
      const baseUrlWithoutSlash = 'https://domain.com';
      const resourceWithSlash = '/resource';
      const resourceWithoutSlash = 'resource';

      const endpoints1 = new ApiEndpoints({ baseUrl: baseUrlWithSlash });
      const endpoints2 = new ApiEndpoints({ baseUrl: baseUrlWithoutSlash });

      // Test all combinations to ensure we avoid double slashes and always have one slash
      expect(endpoints1.endpoint(resourceWithSlash)).toBe('https://domain.com/resource');
      expect(endpoints1.endpoint(resourceWithoutSlash)).toBe('https://domain.com/resource');
      expect(endpoints2.endpoint(resourceWithSlash)).toBe('https://domain.com/resource');
      expect(endpoints2.endpoint(resourceWithoutSlash)).toBe('https://domain.com/resource');
    });
  });

  describe('Event Url generation', () => {
    const hostnameToken = new EnhancedSdkToken(
      'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk',
    );
    const mockedToken = td.object<EnhancedSdkToken>();
    beforeAll(() => {
      td.when(mockedToken.isValid()).thenReturn(true);
    });

    it('should decode the event ingestion hostname from the SDK key', () => {
      const endpoints = new ApiEndpoints({ sdkToken: hostnameToken });
      const hostname = endpoints.eventIngestionEndpoint();
      expect(hostname).toEqual('https://123456.e.testing.eppo.cloud/v0/i');
    });

    it('should decode strings with non URL-safe characters', () => {
      // this is not a really valid ingestion URL, but it's useful for testing the decoder
      td.when(mockedToken.getEventIngestionHostname()).thenReturn('12 3456/.e.testing.eppo.cloud');
      const endpoints = new ApiEndpoints({ sdkToken: mockedToken });
      const hostname = endpoints.eventIngestionEndpoint();
      expect(hostname).toEqual('https://12 3456/.e.testing.eppo.cloud/v0/i');
    });

    it("should return null if the SDK key doesn't contain the event ingestion hostname", () => {
      td.when(mockedToken.isValid()).thenReturn(false);
      const endpoints = new ApiEndpoints({ sdkToken: mockedToken });
      const hostname = endpoints.eventIngestionEndpoint();
      expect(hostname).toBeNull();
    });
  });

  describe('Query parameter handling', () => {
    it('should append query parameters to endpoint URLs', () => {
      const queryParams = { apiKey: 'test-key', sdkName: 'js-sdk', sdkVersion: '1.0.0' };
      const endpoints = new ApiEndpoints({ queryParams });

      const url = endpoints.ufcEndpoint();

      expect(url).toContain('?');
      expect(url).toContain('apiKey=test-key');
      expect(url).toContain('sdkName=js-sdk');
      expect(url).toContain('sdkVersion=1.0.0');
    });

    it('should properly encode query parameters with special characters', () => {
      const queryParams = {
        apiKey: 'test-key',
        sdkName: 'value with spaces',
        sdkVersion: 'a+b=c&d',
      };
      const endpoints = new ApiEndpoints({ queryParams });

      const url = endpoints.ufcEndpoint();

      expect(url).toContain('sdkName=value+with+spaces');
      expect(url).toContain('sdkVersion=a%2Bb%3Dc%26d');
    });
  });
});

describe('ApiEndpoints - Additional Tests', () => {
  describe('URL normalization', () => {
    it('should preserve different protocol types', () => {
      const httpEndpoints = new ApiEndpoints({ baseUrl: 'http://example.com' });
      const httpsEndpoints = new ApiEndpoints({ baseUrl: 'https://example.com' });
      const protocolRelativeEndpoints = new ApiEndpoints({ baseUrl: '//example.com' });

      expect(httpEndpoints.endpoint('test')).toEqual('http://example.com/test');
      expect(httpsEndpoints.endpoint('test')).toEqual('https://example.com/test');
      expect(protocolRelativeEndpoints.endpoint('test')).toEqual('//example.com/test');
    });

    it('should add https:// to URLs without protocols', () => {
      const endpoints = new ApiEndpoints({ baseUrl: 'example.com' });
      expect(endpoints.endpoint('test')).toEqual('https://example.com/test');
    });

    it('should handle multiple slashes', () => {
      const endpoints = new ApiEndpoints({ baseUrl: 'example.com/' });
      expect(endpoints.endpoint('/test')).toEqual('https://example.com/test');
    });
  });

  describe('Subdomain handling', () => {
    it('should correctly integrate subdomain with base URLs containing paths', () => {
      const sdkToken = new EnhancedSdkToken('abc.Y3M9dGVzdC1zdWJkb21haW4='); // cs=test-subdomain
      const endpoints = new ApiEndpoints({
        sdkToken,
        defaultUrl: 'example.com/api/v2',
      });

      expect(endpoints.endpoint('')).toContain('https://test-subdomain.example.com/api/v2');
    });

    it('should handle subdomains with special characters', () => {
      // Token with cs=test-sub.domain-special encoded
      const sdkToken = new EnhancedSdkToken('abc.Y3M9dGVzdC1zdWIuZG9tYWluLXNwZWNpYWw=');
      const endpoints = new ApiEndpoints({ sdkToken });

      expect(endpoints.endpoint('')).toContain('test-sub.domain-special');
    });
  });

  describe('Event ingestion endpoint', () => {
    it('should use subdomain with DEFAULT_EVENT_DOMAIN when hostname is not available', () => {
      // Create a mock token with only a subdomain
      const mockToken = {
        isValid: () => true,
        getEventIngestionHostname: () => null,
        getSubdomain: () => 'test-subdomain',
      } as EnhancedSdkToken;

      const endpoints = new ApiEndpoints({ sdkToken: mockToken });
      expect(endpoints.eventIngestionEndpoint()).toEqual(
        `https://test-subdomain.${DEFAULT_EVENT_DOMAIN}/v0/i`,
      );
    });

    it('should prioritize hostname over subdomain if both are available', () => {
      const mockToken = {
        isValid: () => true,
        getEventIngestionHostname: () => 'event-host.example.com',
        getSubdomain: () => 'test-subdomain',
      } as EnhancedSdkToken;

      const endpoints = new ApiEndpoints({ sdkToken: mockToken });
      expect(endpoints.eventIngestionEndpoint()).toEqual('https://event-host.example.com/v0/i');
    });

    it('should return null when token is valid but no hostname or subdomain is available', () => {
      const mockToken = {
        isValid: () => true,
        getEventIngestionHostname: () => null,
        getSubdomain: () => null,
      } as EnhancedSdkToken;

      const endpoints = new ApiEndpoints({ sdkToken: mockToken });
      expect(endpoints.eventIngestionEndpoint()).toBeNull();
    });
  });
});
