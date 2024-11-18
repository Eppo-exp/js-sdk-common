import ApiEndpoints from './api-endpoints';
import { IConfigurationStore } from './configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import FetchHttpClient, { IHttpClient } from './http-client';
import { PrecomputedFlag } from './interfaces';
import ConfigurationRequestor from './precomputed-requestor';

const MOCK_PRECOMPUTED_RESPONSE = {
  flags: {
    'precomputed-flag-1': {
      allocationKey: 'default',
      variationKey: 'true-variation',
      variationType: 'BOOLEAN',
      variationValue: 'true',
      extraLogging: {},
      doLog: true,
    },
    'precomputed-flag-2': {
      allocationKey: 'test-group',
      variationKey: 'variation-a',
      variationType: 'STRING',
      variationValue: 'variation-a',
      extraLogging: {},
      doLog: true,
    },
  },
  environment: {
    name: 'production',
  },
  format: 'PRECOMPUTED',
  createdAt: '2024-03-20T00:00:00Z',
};

describe('PrecomputedRequestor', () => {
  let precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  let httpClient: IHttpClient;
  let configurationRequestor: ConfigurationRequestor;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      },
    });
    httpClient = new FetchHttpClient(apiEndpoints, 1000);
    precomputedFlagStore = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
    configurationRequestor = new ConfigurationRequestor(httpClient, precomputedFlagStore);

    fetchSpy = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(MOCK_PRECOMPUTED_RESPONSE),
      });
    }) as jest.Mock;
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Precomputed flags', () => {
    it('Fetches and stores precomputed flag configuration', async () => {
      await configurationRequestor.fetchAndStorePrecomputedFlags();

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      expect(precomputedFlagStore.getKeys().length).toBe(2);

      const flag1 = precomputedFlagStore.get('precomputed-flag-1');
      expect(flag1?.allocationKey).toBe('default');
      expect(flag1?.variationKey).toBe('true-variation');
      expect(flag1?.variationType).toBe('BOOLEAN');
      expect(flag1?.variationValue).toBe('true');
      expect(flag1?.extraLogging).toEqual({});
      expect(flag1?.doLog).toBe(true);

      const flag2 = precomputedFlagStore.get('precomputed-flag-2');
      expect(flag2?.allocationKey).toBe('test-group');
      expect(flag2?.variationKey).toBe('variation-a');
      expect(flag2?.variationType).toBe('STRING');
      expect(flag2?.variationValue).toBe('variation-a');
      expect(flag2?.extraLogging).toEqual({});
      expect(flag2?.doLog).toBe(true);

      // TODO: create a method get format from the response
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const response = await fetchSpy.mock.results[0].value.json();
      expect(response.format).toBe('PRECOMPUTED');

      expect(precomputedFlagStore.getEnvironment()).toBe({ name: 'production' });
      expect(precomputedFlagStore.getConfigPublishedAt()).toBe('2024-03-20T00:00:00Z');
    });

    it('Handles empty response gracefully', async () => {
      fetchSpy.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ flags: null }),
        }),
      );

      await configurationRequestor.fetchAndStorePrecomputedFlags();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(precomputedFlagStore.getKeys().length).toBe(0);
    });
  });
});
