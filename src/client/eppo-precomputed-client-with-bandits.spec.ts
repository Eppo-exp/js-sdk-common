import {
  readMockConfigurationWireResponse,
  MOCK_PRECOMPUTED_WIRE_FILE,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IPrecomputedConfigurationResponse } from '../configuration';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import { PrecomputedFlag, IObfuscatedPrecomputedBandit } from '../interfaces';
import PrecomputedFlagRequestor from '../precomputed-requestor';

import EppoPrecomputedClient from './eppo-precomputed-client';

describe('EppoPrecomputedClient Bandits E2E test', () => {
  const precomputedFlagStore = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
  const precomputedBanditStore = new MemoryOnlyConfigurationStore<IObfuscatedPrecomputedBandit>();
  let client: EppoPrecomputedClient;
  const mockLogAssignment = jest.fn();
  const mockLogBanditAction = jest.fn();

  const precomputedConfigurationWire = readMockConfigurationWireResponse(
    MOCK_PRECOMPUTED_WIRE_FILE,
  );
  const unparsedPrecomputedResponse = JSON.parse(precomputedConfigurationWire).precomputed.response;
  const precomputedResponse: IPrecomputedConfigurationResponse = JSON.parse(
    unparsedPrecomputedResponse,
  );

  beforeAll(async () => {
    // Mock out fetch to return the bandit flag configuration and model parameters
    global.fetch = jest.fn((url: string) => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(precomputedResponse),
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
    const httpClient = new FetchHttpClient(apiEndpoints, 1000);
    const configurationRequestor = new PrecomputedFlagRequestor(
      httpClient,
      precomputedFlagStore,
      'test-subject',
      {
        numericAttributes: {},
        categoricalAttributes: {},
      },
      precomputedBanditStore,
      {
        banner_bandit_flag: {
          nike: {
            numericAttributes: { brand_affinity: -2.5 },
            categoricalAttributes: { loyalty_tier: 'bronze' },
          },
        },
      },
    );
    await configurationRequestor.fetchAndStorePrecomputedFlags();
  });

  beforeEach(() => {
    // Create precomputed client with required subject and stores
    client = new EppoPrecomputedClient({
      precomputedFlagStore,
      precomputedBanditStore,
      subject: {
        subjectKey: 'test-subject',
        subjectAttributes: {
          numericAttributes: {},
          categoricalAttributes: {},
        },
      },
    });
    client.setAssignmentLogger({ logAssignment: mockLogAssignment });
    client.setBanditLogger({ logBanditAction: mockLogBanditAction });
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should return the default action for the banner_bandit_flag', () => {
    const precomputedConfiguration = client.getBanditAction('banner_bandit_flag', 'nike');
    expect(precomputedConfiguration).toEqual({ action: null, variation: 'nike' });
  });
});
