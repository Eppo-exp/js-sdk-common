import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient, {
  ISwitchbacksConfigResponse,
  IUniversalFlagConfigResponse,
} from '../http-client';
import { BanditVariation, VariationType, Flag, BanditParameters, FormatEnum, Switchback } from '../interfaces';

import EppoClient from './eppo-client';

describe('EppoClient Switchbacks E2E test', () => {
  const flagStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  const banditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  const switchbackStore = new MemoryOnlyConfigurationStore<Switchback>();
  let client: EppoClient;
  let configurationRequestor: ConfigurationRequestor;
  let httpClient: FetchHttpClient;
  const mockLogAssignment = jest.fn();
  const mockLogBanditAction = jest.fn();

  beforeAll(async () => {
    // Mock out fetch to return the switchback flag configuration and model parameters
    global.fetch = jest.fn((url: string) => {
      let response: IUniversalFlagConfigResponse | ISwitchbacksConfigResponse;
      if (url.includes('switchbacks')) {
        response = {
          switchbacks: {
            'my-switchback': {
              key: 'my-switchback',
              subjectAttributeKey: 'city',
              startAt: '2025-01-01T13:00:00Z',
              endAt: '2025-05-01T13:59:59Z',
              assignmentWindowInMinutes: 60,
              variations: [
                {
                  key: 'control',
                  value: 'control',
                },
                {
                  key: 'treatment',
                  value: 'treatment',
                },
              ],
            },
          },
          subjectAttributes: {
            city: [
              'St. Louis',
              'Denver',
              'Los Angeles',
              'San Francisco',
              'New York',
              'Washington DC',
            ],
          },
        };
      } else {
        response = {
          flags: {
            'my-switchback': {
              key: 'my-switchback',
              enabled: true,
              variationType: VariationType.STRING,
              variations: {
                control: {
                  key: 'control',
                  value: 'control',
                },
                'my-switchback': {
                  key: 'my-switchback',
                  value: 'my-switchback',
                },
              },
              totalShards: 10000,
              allocations: [
                {
                  key: 'allocation-112',
                  splits: [
                    {
                      variationKey: 'my-switchback',
                      shards: [
                        {
                          salt: 'upsell-bandit-112-split',
                          ranges: [
                            {
                              start: 0,
                              end: 10000,
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  doLog: false,
                },
              ],
            },
          },
          createdAt: '2024-01-01T00:00:00Z',
          format: FormatEnum.SERVER,
          environment: { name: 'test' },
          banditReferences: {},
        };
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });
    }) as jest.Mock;

    // Initialize a configuration requestor
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      },
    });
    httpClient = new FetchHttpClient(apiEndpoints, 1000);
    configurationRequestor = new ConfigurationRequestor(
      httpClient,
      flagStore,
      banditVariationStore,
      banditModelStore,
      switchbackStore,
    );
    await configurationRequestor.fetchAndStoreConfigurations();
  });

  beforeEach(() => {
    client = new EppoClient({
      flagConfigurationStore: flagStore,
      banditVariationConfigurationStore: banditVariationStore,
      banditModelConfigurationStore: banditModelStore,
      isObfuscated: false,
    });
    client.setIsGracefulFailureMode(false);
    client.setAssignmentLogger({ logAssignment: mockLogAssignment });
    client.setBanditLogger({ logBanditAction: mockLogBanditAction });
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should correctly handle both switchback and flag configurations', async () => {
    // Fetch configurations
    await configurationRequestor.fetchAndStoreConfigurations();

    // Verify flag configuration
    const flag = flagStore.get('my-switchback');
    expect(flag).toBeDefined();
    expect(flag?.enabled).toBe(true);
    expect(flag?.variationType).toBe(VariationType.STRING);
    expect(flag?.variations).toBeDefined();
    expect(flag?.variations['control']).toBeDefined();
    expect(flag?.variations['my-switchback']).toBeDefined();

    // Verify switchback configuration
    const switchback = await httpClient.getSwitchbacksConfiguration();
    expect(switchback).toBeDefined();
    expect(switchback?.switchbacks['my-switchback']).toBeDefined();
    expect(switchback?.switchbacks['my-switchback'].subjectAttributeKey).toBe('city');
    expect(switchback?.subjectAttributes.city).toContain('St. Louis');
  });

  describe('Shared test cases', () => {
    // ... existing code ...
  });
});
