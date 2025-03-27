import ApiEndpoints from './api-endpoints';
import { BASE_URL as DEFAULT_BASE_URL } from './constants';
import EnhancedSdkToken from './enhanced-sdk-token';

describe('ApiEndpoints', () => {
  it('should append query parameters to the URL', () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'https://api.example.com',
      queryParams: {
        apiKey: '12345',
        sdkVersion: 'foobar',
        sdkName: 'ExampleSDK',
      },
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      'https://api.example.com/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      'https://api.example.com/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
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
      // This token has cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });
      expect(endpoints.getEffectiveBaseUrl()).toBe('https://test-subdomain.fscdn.eppo.cloud/api');
    });

    it('should prefer custom baseUrl over SDK token subdomain', () => {
      const customBaseUrl = 'https://custom-domain.com';
      // This token has cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({
        baseUrl: customBaseUrl,
        sdkToken: new EnhancedSdkToken(sdkToken),
      });
      expect(endpoints.getEffectiveBaseUrl()).toBe(customBaseUrl);
    });

    it('should fallback to DEFAULT_BASE_URL when SDK token has no subdomain', () => {
      // This token has no cs parameter
      const sdkToken = 'abc.ZWg9ZXZlbnQtaG9zdG5hbWU=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });
      expect(endpoints.getEffectiveBaseUrl()).toBe(DEFAULT_BASE_URL);
    });

    it('should fallback to DEFAULT_BASE_URL when SDK token is invalid', () => {
      const invalidToken = new EnhancedSdkToken('invalid-token');
      const endpoints = new ApiEndpoints({ sdkToken: invalidToken });
      expect(endpoints.getEffectiveBaseUrl()).toBe(DEFAULT_BASE_URL);
    });
  });

  describe('Endpoint URL construction', () => {
    it('should use effective base URL for UFC endpoint', () => {
      // This token has cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });

      expect(endpoints.ufcEndpoint()).toContain(
        'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/config',
      );
    });

    it('should use effective base URL for bandit parameters endpoint', () => {
      // This token has cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({ sdkToken: new EnhancedSdkToken(sdkToken) });

      expect(endpoints.banditParametersEndpoint()).toContain(
        'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/bandits',
      );
    });

    it('should use the sub-domain and default base URL for precomputed flags endpoint', () => {
      // This token has cs=test-subdomain
      const sdkToken = 'abc.Y3M9dGVzdC1zdWJkb21haW4=';
      const endpoints = new ApiEndpoints({
        sdkToken: new EnhancedSdkToken(sdkToken),
        defaultUrl: 'default.eppo.cloud',
      });

      expect(endpoints.precomputedFlagsEndpoint()).toContain('default.eppo.cloud');
      expect(endpoints.precomputedFlagsEndpoint()).toContain('test-subdomain');
    });

    it('should handle slash management between base URL and resource', () => {
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
