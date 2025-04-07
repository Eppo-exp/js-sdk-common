import * as td from 'testdouble';

import ApiEndpoints from './api-endpoints';
import { BASE_URL as DEFAULT_BASE_URL, DEFAULT_EVENT_DOMAIN } from './constants';
import SdkTokenDecoder from './sdk-token-decoder';

describe('ApiEndpoints', () => {
  describe('Query parameters', () => {
    describe('should correctly handle query parameters in various scenarios', () => {
      const testCases = [
        {
          name: 'with custom base URL and query params',
          params: {
            baseUrl: 'http://api.example.com',
            queryParams: {
              apiKey: '12345',
              sdkVersion: 'foobar',
              sdkName: 'ExampleSDK',
            },
          },
          expected:
            'http://api.example.com/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
        },
        {
          name: 'with default base URL and query params',
          params: {
            queryParams: {
              apiKey: '12345',
              sdkVersion: 'foobar',
              sdkName: 'ExampleSDK',
            },
          },
          expected: `${DEFAULT_BASE_URL}/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK`,
        },
        {
          name: 'without query params',
          params: {},
          expected: `${DEFAULT_BASE_URL}/flag-config/v1/config`,
        },
        {
          name: 'with special characters in query params',
          params: {
            queryParams: {
              apiKey: 'test-key',
              sdkName: 'value with spaces',
              sdkVersion: 'a+b=c&d',
            },
          },
          expected:
            'https://fscdn.eppo.cloud/api/flag-config/v1/config?apiKey=test-key&sdkName=value+with+spaces&sdkVersion=a%2Bb%3Dc%26d',
        },
      ];

      testCases.forEach(({ name, params, expected }) => {
        it(`${name}`, () => {
          const apiEndpoints = new ApiEndpoints(params);
          const result = apiEndpoints.ufcEndpoint();

          expect(result).toEqual(expected);
        });
      });
    });
  });

  describe('Base URL determination', () => {
    const testCases = [
      {
        name: 'should use custom baseUrl when provided',
        params: { baseUrl: 'https://custom-domain.com' },
        expected: 'https://custom-domain.com/assignments',
      },
      {
        name: 'should use subdomain from SDK token when valid',
        params: { sdkTokenDecoder: new SdkTokenDecoder('abc.Y3M9dGVzdC1zdWJkb21haW4=') },
        expected: 'https://test-subdomain.fscdn.eppo.cloud/api/assignments',
      },
      {
        name: 'should prefer custom baseUrl over SDK token subdomain',
        params: {
          baseUrl: 'https://custom-domain.com',
          sdkTokenDecoder: new SdkTokenDecoder('abc.Y3M9dGVzdC1zdWJkb21haW4='),
        },
        expected: 'https://custom-domain.com/assignments',
      },
      {
        name: 'should not allow custom baseUrl to be the default base url',
        params: {
          baseUrl: DEFAULT_BASE_URL,
          sdkTokenDecoder: new SdkTokenDecoder('abc.Y3M9dGVzdC1zdWJkb21haW4='),
        },
        expected: 'https://test-subdomain.fscdn.eppo.cloud/api/assignments',
      },
      {
        name: 'should fallback to DEFAULT_BASE_URL when SDK token has no subdomain',
        params: { sdkTokenDecoder: new SdkTokenDecoder('abc.ZWg9ZXZlbnQtaG9zdG5hbWU=') },
        expected: 'https://fscdn.eppo.cloud/api/assignments',
      },
      {
        name: 'should fallback to DEFAULT_BASE_URL when SDK token has nothing encoded',
        params: { sdkTokenDecoder: new SdkTokenDecoder('invalid-token') },
        expected: 'https://fscdn.eppo.cloud/api/assignments',
      },
    ];

    testCases.forEach(({ name, params, expected }) => {
      it(name, () => {
        const endpoints = new ApiEndpoints(params);
        const result = endpoints.precomputedFlagsEndpoint();

        expect(result).toBe(expected);
      });
    });
  });

  describe('Endpoint URL construction', () => {
    const sdkTokenDecoder = new SdkTokenDecoder('abc.Y3M9dGVzdC1zdWJkb21haW4='); // cs=test-subdomain

    const endpointTestCases = [
      {
        name: 'UFC endpoint with subdomain',
        factory: (api: ApiEndpoints) => api.ufcEndpoint(),
        expected: 'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/config',
      },
      {
        name: 'bandit parameters endpoint with subdomain',
        factory: (api: ApiEndpoints) => api.banditParametersEndpoint(),
        expected: 'https://test-subdomain.fscdn.eppo.cloud/api/flag-config/v1/bandits',
      },
    ];

    endpointTestCases.forEach(({ name, factory, expected }) => {
      it(name, () => {
        const endpoints = new ApiEndpoints({ sdkTokenDecoder: sdkTokenDecoder });
        const result = factory(endpoints);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Event ingestion URL', () => {
    const hostnameToken = new SdkTokenDecoder(
      'zCsQuoHJxVPp895.ZWg9MTIzNDU2LmUudGVzdGluZy5lcHBvLmNsb3Vk',
    );
    let mockedDecoder: SdkTokenDecoder;

    beforeEach(() => {
      mockedDecoder = td.object<SdkTokenDecoder>();
      td.when(mockedDecoder.isValid()).thenReturn(true);
    });

    const eventUrlTestCases = [
      {
        name: 'should decode the event ingestion hostname from the SDK key',
        setupDecoder: () => hostnameToken,
        expected: 'https://123456.e.testing.eppo.cloud/v0/i',
      },
      {
        name: 'should decode strings with non URL-safe characters',
        setupDecoder: () => {
          td.when(mockedDecoder.getEventIngestionHostname()).thenReturn(
            '12 3456/.e.testing.eppo.cloud',
          );
          return mockedDecoder;
        },
        expected: 'https://12 3456/.e.testing.eppo.cloud/v0/i',
      },
      {
        name: 'should return null if the SDK key is invalid',
        setupDecoder: () => {
          td.when(mockedDecoder.isValid()).thenReturn(false);
          return mockedDecoder;
        },
        expected: null,
      },
      {
        name: 'should use subdomain with DEFAULT_EVENT_DOMAIN when hostname is not available',
        setupDecoder: () => {
          td.when(mockedDecoder.getEventIngestionHostname()).thenReturn(null);
          td.when(mockedDecoder.getSubdomain()).thenReturn('test-subdomain');
          return mockedDecoder;
        },
        expected: `https://test-subdomain.${DEFAULT_EVENT_DOMAIN}/v0/i`,
      },
      {
        name: 'should prioritize hostname over subdomain if both are available',
        setupDecoder: () => {
          td.when(mockedDecoder.getEventIngestionHostname()).thenReturn('event-host.example.com');
          td.when(mockedDecoder.getSubdomain()).thenReturn('test-subdomain');
          return mockedDecoder;
        },
        expected: 'https://event-host.example.com/v0/i',
      },
      {
        name: 'should return null when token is valid but no hostname or subdomain is available',
        setupDecoder: () => {
          td.when(mockedDecoder.getEventIngestionHostname()).thenReturn(null);
          td.when(mockedDecoder.getSubdomain()).thenReturn(null);
          return mockedDecoder;
        },
        expected: null,
      },
    ];

    eventUrlTestCases.forEach(({ name, setupDecoder, expected }) => {
      it(name, () => {
        const decoder = setupDecoder();
        const endpoints = new ApiEndpoints({ sdkTokenDecoder: decoder });
        expect(endpoints.eventIngestionEndpoint()).toEqual(expected);
      });
    });
  });

  describe('URL normalization', () => {
    const urlNormalizationTestCases = [
      {
        name: 'preserve http:// protocol',
        baseUrl: 'http://example.com',
        expected: 'http://example.com/flag-config/v1/config',
      },
      {
        name: 'preserve https:// protocol',
        baseUrl: 'https://example.com',
        expected: 'https://example.com/flag-config/v1/config',
      },
      {
        name: 'preserve // protocol',
        baseUrl: '//example.com',
        expected: '//example.com/flag-config/v1/config',
      },
      {
        name: 'add https:// to URLs without protocols',
        baseUrl: 'example.com',
        expected: 'https://example.com/flag-config/v1/config',
      },
      {
        name: 'handle multiple slashes',
        baseUrl: 'example.com/',
        expected: 'https://example.com/flag-config/v1/config',
      },
    ];

    urlNormalizationTestCases.forEach(({ name, baseUrl, expected }) => {
      it(`should ${name}`, () => {
        const endpoints = new ApiEndpoints({ baseUrl });
        expect(endpoints.ufcEndpoint()).toEqual(expected);
      });
    });
  });
});
