import {
  MOCK_PRECOMPUTED_WIRE_FILE,
  readMockConfigurationWireResponse,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import { IObfuscatedPrecomputedBandit, PrecomputedFlag } from '../interfaces';
import PrecomputedFlagRequestor from '../precomputed-requestor';

import EppoPrecomputedClient from './eppo-precomputed-client';

describe('EppoPrecomputedClient Bandits E2E test', () => {
  const precomputedFlagStore = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
  const precomputedBanditStore = new MemoryOnlyConfigurationStore<IObfuscatedPrecomputedBandit>();
  let client: EppoPrecomputedClient;
  const mockLogAssignment = jest.fn();
  const mockLogBanditAction = jest.fn();

  const obfuscatedConfigurationWire = readMockConfigurationWireResponse(MOCK_PRECOMPUTED_WIRE_FILE);
  const obfuscatedResponse = JSON.parse(obfuscatedConfigurationWire).precomputed.response;

  const testModes = ['offline'];

  testModes.forEach((mode) => {
    describe(`${mode} mode`, () => {
      beforeAll(async () => {
        if (mode === 'online') {
          // Mock fetch for online mode
          global.fetch = jest.fn(() => {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(JSON.parse(obfuscatedResponse)),
            });
          }) as jest.Mock;

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
              'not-a-bandit-flag': {},
            },
          );
          await configurationRequestor.fetchAndStorePrecomputedFlags();
        } else if (mode === 'offline') {
          const parsed = JSON.parse(obfuscatedResponse);
          // Offline mode: directly populate stores with precomputed response
          precomputedFlagStore.salt = parsed.salt;
          precomputedBanditStore.salt = parsed.salt;
          await precomputedFlagStore.setEntries(parsed.flags);
          await precomputedBanditStore.setEntries(parsed.bandits);
        }
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

      afterEach(() => {
        jest.clearAllMocks();
      });

      afterAll(() => {
        jest.restoreAllMocks();
      });

      it(`should return the default action for the banner_bandit_flag in ${mode} mode`, () => {
        const precomputedConfiguration = client.getBanditAction('banner_bandit_flag', 'nike');
        expect(precomputedConfiguration).toEqual({ action: null, variation: 'nike' });
      });

      it('should return the assigned variation if a flag is not a bandit', () => {
        const precomputedConfiguration = client.getBanditAction('not-a-bandit-flag', 'default');
        expect(precomputedConfiguration).toEqual({ action: null, variation: 'control' });
        expect(mockLogBanditAction).not.toHaveBeenCalled();
      });

      it('should return the bandit variation and action if a flag is a bandit', () => {
        const precomputedConfiguration = client.getBanditAction('string-flag', 'default');
        expect(precomputedConfiguration).toEqual({
          action: 'show_red_button',
          variation: 'red',
        });
        expect(mockLogBanditAction).toHaveBeenCalled();
      });
    });
  });
});
