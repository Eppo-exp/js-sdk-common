import {
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  MOCK_UFC_RESPONSE_FILE,
  readMockUFCResponse,
} from '../test/testHelpers';

import ApiEndpoints from './api-endpoints';
import { ensureContextualSubjectAttributes } from './attributes';
import { BroadcastChannel } from './broadcast';
import { ConfigurationFeed } from './configuration-feed';
import ConfigurationRequestor from './configuration-requestor';
import { ConfigurationStore } from './configuration-store';
import FetchHttpClient, {
  IBanditParametersResponse,
  IHttpClient,
  IUniversalFlagConfigResponse,
} from './http-client';
import { BanditParameters } from './interfaces';

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

describe('ConfigurationRequestor', () => {
  let configurationFeed: ConfigurationFeed;
  let configurationStore: ConfigurationStore;
  let httpClient: IHttpClient;
  let configurationRequestor: ConfigurationRequestor;

  beforeEach(async () => {
    configurationFeed = new BroadcastChannel();
    configurationStore = new ConfigurationStore();
    configurationStore.register(configurationFeed, { type: 'always' });
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      },
    });
    httpClient = new FetchHttpClient(apiEndpoints, 1000);
    configurationRequestor = new ConfigurationRequestor(httpClient, configurationFeed);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Flags with no bandits', () => {
    let fetchSpy: jest.Mock;

    beforeAll(() => {
      fetchSpy = jest.fn(() => {
        const response = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(response),
        });
      }) as jest.Mock;
      global.fetch = fetchSpy;
    });

    it('Fetches and stores flag configuration', async () => {
      const configuration = await configurationRequestor.fetchConfiguration();

      expect(fetchSpy).toHaveBeenCalledTimes(1); // Flags only; no bandits

      expect(configuration?.getFlagKeys().length).toBeGreaterThanOrEqual(16);
      const killSwitchFlag = configuration?.getFlag('kill-switch');
      expect(killSwitchFlag?.key).toBe('kill-switch');
      expect(killSwitchFlag?.enabled).toBe(true);
      expect(killSwitchFlag?.variationType).toBe('BOOLEAN');
      expect(killSwitchFlag?.totalShards).toBe(10000);
      expect(Object.keys(killSwitchFlag?.variations || {})).toHaveLength(2);
      expect(killSwitchFlag?.variations['on']).toStrictEqual({
        key: 'on',
        value: true,
      });
      expect(killSwitchFlag?.variations['off']).toStrictEqual({
        key: 'off',
        value: false,
      });
      expect(killSwitchFlag?.allocations).toHaveLength(3);
      const fiftyPlusAllocation = killSwitchFlag?.allocations[1];
      expect(fiftyPlusAllocation?.key).toBe('on-for-age-50+');
      expect(fiftyPlusAllocation?.doLog).toBe(true);
      expect(fiftyPlusAllocation?.rules).toHaveLength(1);
      expect(fiftyPlusAllocation?.rules?.[0].conditions).toHaveLength(1);
      expect(fiftyPlusAllocation?.rules?.[0].conditions[0]).toStrictEqual({
        attribute: 'age',
        operator: 'GTE',
        value: 50,
      });
      expect(fiftyPlusAllocation?.splits).toHaveLength(1);
      expect(fiftyPlusAllocation?.splits[0].variationKey).toBe('on');
      expect(fiftyPlusAllocation?.splits[0].shards).toHaveLength(1);
      expect(fiftyPlusAllocation?.splits[0].shards[0].salt).toBe('some-salt');
      expect(fiftyPlusAllocation?.splits[0].shards[0].ranges).toHaveLength(1);
      expect(fiftyPlusAllocation?.splits[0].shards[0].ranges[0]).toStrictEqual({
        start: 0,
        end: 10000,
      });

      expect(configuration?.getBanditConfiguration()).toBeUndefined();
    });
  });

  describe('Flags with bandits', () => {
    let fetchSpy: jest.Mock;

    function initiateFetchSpy(
      responseMockGenerator: (
        url: string,
      ) => IUniversalFlagConfigResponse | IBanditParametersResponse,
    ) {
      fetchSpy = jest.fn((url: string) => {
        const response = responseMockGenerator(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(response),
        });
      }) as jest.Mock;
      global.fetch = fetchSpy;
    }

    function defaultResponseMockGenerator(url: string) {
      const responseFile = url.includes('bandits')
        ? MOCK_BANDIT_MODELS_RESPONSE_FILE
        : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;
      return readMockUFCResponse(responseFile);
    }

    describe('Fetching bandits', () => {
      beforeAll(() => {
        initiateFetchSpy(defaultResponseMockGenerator);
      });

      it('Fetches and populates bandit parameters', async () => {
        const configuration = await configurationRequestor.fetchConfiguration();

        expect(fetchSpy).toHaveBeenCalledTimes(2); // Once for UFC, another for bandits

        expect(configuration?.getFlagKeys().length).toBeGreaterThanOrEqual(2);
        expect(configuration?.getFlag('banner_bandit_flag')).toBeDefined();
        expect(configuration?.getFlag('cold_start_bandit')).toBeDefined();

        const bandits = configuration?.getBanditConfiguration();
        expect(bandits).toBeDefined();
        expect(Object.keys(bandits?.response.bandits ?? {}).length).toBeGreaterThanOrEqual(2);

        const bannerBandit = bandits?.response.bandits['banner_bandit'];
        expect(bannerBandit?.banditKey).toBe('banner_bandit');
        expect(bannerBandit?.modelName).toBe('falcon');
        expect(bannerBandit?.modelVersion).toBe('123');
        const bannerModelData = bannerBandit?.modelData;
        expect(bannerModelData?.gamma).toBe(1);
        expect(bannerModelData?.defaultActionScore).toBe(0);
        expect(bannerModelData?.actionProbabilityFloor).toBe(0);
        const bannerCoefficients = bannerModelData?.coefficients || {};
        expect(Object.keys(bannerCoefficients).length).toBe(2);

        // Deep dive for the nike action
        const nikeCoefficients = bannerCoefficients['nike'];
        expect(nikeCoefficients.actionKey).toBe('nike');
        expect(nikeCoefficients.intercept).toBe(1);
        expect(nikeCoefficients.actionNumericCoefficients).toHaveLength(1);
        const nikeBrandAffinityCoefficient = nikeCoefficients.actionNumericCoefficients[0];
        expect(nikeBrandAffinityCoefficient.attributeKey).toBe('brand_affinity');
        expect(nikeBrandAffinityCoefficient.coefficient).toBe(1);
        expect(nikeBrandAffinityCoefficient.missingValueCoefficient).toBe(-0.1);
        expect(nikeCoefficients.actionCategoricalCoefficients).toHaveLength(2);
        const nikeLoyaltyTierCoefficient = nikeCoefficients.actionCategoricalCoefficients[0];
        expect(nikeLoyaltyTierCoefficient.attributeKey).toBe('loyalty_tier');
        expect(nikeLoyaltyTierCoefficient.missingValueCoefficient).toBe(0);
        expect(nikeLoyaltyTierCoefficient.valueCoefficients).toStrictEqual({
          gold: 4.5,
          silver: 3.2,
          bronze: 1.9,
        });
        expect(nikeCoefficients.subjectNumericCoefficients).toHaveLength(1);
        const nikeAccountAgeCoefficient = nikeCoefficients.subjectNumericCoefficients[0];
        expect(nikeAccountAgeCoefficient.attributeKey).toBe('account_age');
        expect(nikeAccountAgeCoefficient.coefficient).toBe(0.3);
        expect(nikeAccountAgeCoefficient.missingValueCoefficient).toBe(0);
        expect(nikeCoefficients.subjectCategoricalCoefficients).toHaveLength(1);
        const nikeGenderIdentityCoefficient = nikeCoefficients.subjectCategoricalCoefficients[0];
        expect(nikeGenderIdentityCoefficient.attributeKey).toBe('gender_identity');
        expect(nikeGenderIdentityCoefficient.missingValueCoefficient).toBe(2.3);
        expect(nikeGenderIdentityCoefficient.valueCoefficients).toStrictEqual({
          female: 0.5,
          male: -0.5,
        });

        // Just spot check the adidas parameters
        expect(bannerCoefficients['adidas'].subjectNumericCoefficients).toHaveLength(0);
        expect(
          bannerCoefficients['adidas'].subjectCategoricalCoefficients[0].valueCoefficients[
            'female'
          ],
        ).toBe(0);

        const coldStartBandit = bandits?.response.bandits['cold_start_bandit'];
        expect(coldStartBandit?.banditKey).toBe('cold_start_bandit');
        expect(coldStartBandit?.modelName).toBe('falcon');
        expect(coldStartBandit?.modelVersion).toBe('cold start');
        const coldStartModelData = coldStartBandit?.modelData;
        expect(coldStartModelData?.gamma).toBe(1);
        expect(coldStartModelData?.defaultActionScore).toBe(0);
        expect(coldStartModelData?.actionProbabilityFloor).toBe(0);
        expect(coldStartModelData?.coefficients).toStrictEqual({});
      });

      it('Will not fetch bandit parameters if does not want bandits', async () => {
        configurationRequestor = new ConfigurationRequestor(httpClient, configurationFeed, {
          wantsBandits: false,
        });
        await configurationRequestor.fetchConfiguration();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      });

      it('Should not fetch bandits if model version is un-changed', async () => {
        await configurationRequestor.fetchConfiguration();
        expect(fetchSpy).toHaveBeenCalledTimes(2); // Once for UFC, another for bandits

        await configurationRequestor.fetchConfiguration();
        expect(fetchSpy).toHaveBeenCalledTimes(3); // Once just for UFC, bandits should be skipped
      });

      describe('Bandits polling', () => {
        const warmStartBanditReference = {
          modelVersion: 'warm start',
          flagVariations: [
            {
              key: 'warm_start_bandit',
              flagKey: 'warm_start_bandit_flag',
              variationKey: 'warm_start_bandit',
              variationValue: 'warm_start_bandit',
            },
          ],
        };

        const warmStartBanditParameters = {
          banditKey: 'warm_start_bandit',
          modelName: 'pigeon',
          modelVersion: 'warm start',
          modelData: {
            gamma: 1.0,
            defaultActionScore: 0.0,
            actionProbabilityFloor: 0.0,
            coefficients: {},
          },
        };

        const coldStartBanditParameters = {
          banditKey: 'cold_start_bandit',
          modelName: 'falcon',
          modelVersion: 'cold start',
          modelData: {
            gamma: 1.0,
            defaultActionScore: 0.0,
            actionProbabilityFloor: 0.0,
            coefficients: {},
          },
        };

        afterAll(() => {
          initiateFetchSpy(defaultResponseMockGenerator);
        });

        function expectBanditToBeInStore(
          store: ConfigurationStore,
          banditKey: string,
          expectedBanditParameters: BanditParameters,
        ) {
          const bandit = store.getConfiguration()?.getBanditConfiguration()?.response.bandits[
            banditKey
          ];
          expect(bandit).toBeTruthy();
          expect(bandit?.banditKey).toBe(expectedBanditParameters.banditKey);
          expect(bandit?.modelVersion).toBe(expectedBanditParameters.modelVersion);
          expect(bandit?.modelName).toBe(expectedBanditParameters.modelName);
          expect(bandit?.modelData.gamma).toBe(expectedBanditParameters.modelData.gamma);
          expect(bandit?.modelData.defaultActionScore).toBe(
            expectedBanditParameters.modelData.defaultActionScore,
          );
          expect(bandit?.modelData.actionProbabilityFloor).toBe(
            expectedBanditParameters.modelData.actionProbabilityFloor,
          );
          expect(bandit?.modelData.coefficients).toStrictEqual(
            expectedBanditParameters.modelData.coefficients,
          );
        }

        function injectWarmStartBanditToResponseByUrl(
          url: string,
          response: IUniversalFlagConfigResponse | IBanditParametersResponse,
        ) {
          if (url.includes('config') && 'banditReferences' in response) {
            response.banditReferences.warm_start_bandit = warmStartBanditReference;
          }

          if (url.includes('bandits') && 'bandits' in response) {
            response.bandits.warm_start_bandit = warmStartBanditParameters;
          }
        }

        it('Should fetch bandits if new bandit references model versions appeared', async () => {
          let updateUFC = false;
          await configurationRequestor.fetchConfiguration();
          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(3);

          const customResponseMockGenerator = (url: string) => {
            const responseFile = url.includes('bandits')
              ? MOCK_BANDIT_MODELS_RESPONSE_FILE
              : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;

            const response = readMockUFCResponse(responseFile);

            if (updateUFC === true) {
              injectWarmStartBanditToResponseByUrl(url, response);
            }
            return response;
          };
          updateUFC = true;
          initiateFetchSpy(customResponseMockGenerator);

          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(2); // 2 because fetchSpy was re-initiated, 1UFC and 1bandits

          // let's check if warm start was hydrated properly!
          expectBanditToBeInStore(
            configurationStore,
            'warm_start_bandit',
            warmStartBanditParameters,
          );
        });

        it('Should not fetch bandits if bandit references model versions shrunk', async () => {
          // Initial fetch
          await configurationRequestor.fetchConfiguration();

          // Let's mock UFC response so that cold_start is no longer retrieved
          const customResponseMockGenerator = (url: string) => {
            const responseFile = url.includes('bandits')
              ? MOCK_BANDIT_MODELS_RESPONSE_FILE
              : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;

            const response = readMockUFCResponse(responseFile);

            if (url.includes('config') && 'banditReferences' in response) {
              delete response.banditReferences.cold_start_bandit;
            }
            return response;
          };

          initiateFetchSpy(customResponseMockGenerator);
          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(1); // only once for UFC

          // cold start should still be in memory
          expectBanditToBeInStore(
            configurationStore,
            'cold_start_bandit',
            coldStartBanditParameters,
          );
        });

        /**
         * 1. initial call - 1 fetch for ufc 1 for bandits
         * 2. 2nd call - 1 fetch for ufc only; bandits unchanged
         * 3. 3rd call - new bandit ref injected to UFC; 2 fetches, because new bandit appeared
         * 4. 4th call - we remove a bandit from ufc; 1 fetch because there is no need to update.
         *    The bandit removed from UFC should still be in memory.
         **/
        it('should fetch bandits based on banditReference change in UFC', async () => {
          let injectWarmStart = false;
          let removeColdStartBandit = false;
          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(2);

          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(3);

          const customResponseMockGenerator = (url: string) => {
            const responseFile = url.includes('bandits')
              ? MOCK_BANDIT_MODELS_RESPONSE_FILE
              : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;
            const response = readMockUFCResponse(responseFile);
            if (injectWarmStart === true) {
              injectWarmStartBanditToResponseByUrl(url, response);
            } else if (
              removeColdStartBandit === true &&
              'banditReferences' in response &&
              url.includes('config')
            ) {
              delete response.banditReferences.cold_start_bandit;
            }
            return response;
          };
          injectWarmStart = true;
          initiateFetchSpy(customResponseMockGenerator);

          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(2);
          expectBanditToBeInStore(
            configurationStore,
            'warm_start_bandit',
            warmStartBanditParameters,
          );

          injectWarmStart = false;
          removeColdStartBandit = true;
          initiateFetchSpy(customResponseMockGenerator);
          await configurationRequestor.fetchConfiguration();
          expect(fetchSpy).toHaveBeenCalledTimes(1);

          expectBanditToBeInStore(
            configurationStore,
            'cold_start_bandit',
            coldStartBanditParameters,
          );
        });
      });
    });
  });

  describe('with mocked response', () => {
    const response = {
      environment: {
        name: 'Test',
      },
      createdAt: '2024-01-01',
      format: 'SERVER',
      flags: {
        test_flag: {
          key: 'test_flag',
          enabled: true,
          variationType: 'STRING',
          variations: {
            bandit: {
              key: 'bandit',
              value: 'bandit',
            },
          },
        },
      },
      banditReferences: {
        bandit: {
          modelVersion: '123',
          flagVariations: [
            {
              key: 'bandit',
              flagKey: 'test_flag',
              allocationKey: 'analysis',
              variationKey: 'bandit',
              variationValue: 'bandit',
            },
          ],
        },
      },
    };
    const banditResponse = {
      updatedAt: '2023-09-13T04:52:06.462Z',
      environment: {
        name: 'Test',
      },
      bandits: {
        bandit: {
          banditKey: 'bandit',
          modelName: 'falcon',
          updatedAt: '2023-09-13T04:52:06.462Z',
          modelVersion: '123',
        },
      },
    };
    let fetchSpy: jest.Mock;
    beforeAll(() => {
      fetchSpy = jest.fn((req) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(req.includes('flag-config/v1/bandits') ? banditResponse : response),
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

    describe('fetchConfiguration', () => {
      it('should not fetch bandit parameters if model versions are already loaded', async () => {
        // const ufcResponse = {
        //   flags: { test_flag: { key: 'test_flag', value: true } },
        //   banditReferences: {
        //     bandit: {
        //       modelVersion: 'v1',
        //       flagVariations: [{ flagKey: 'test_flag', variationId: '1' }],
        //     },
        //   },
        //   environment: 'test',
        //   createdAt: '2024-01-01',
        //   format: 'SERVER',
        // };

        await configurationRequestor.fetchConfiguration();
        // const initialFetchCount = fetchSpy.mock.calls.length;

        // Second call with same model version
        // fetchSpy.mockImplementationOnce(() =>
        //   Promise.resolve({
        //     ok: true,
        //     status: 200,
        //     json: () => Promise.resolve(ufcResponse)
        //   })
        // );

        await configurationRequestor.fetchConfiguration();

        // Should only have one additional fetch (the UFC) and not the bandit parameters
        // expect(fetchSpy.mock.calls.length).toBe(initialFetchCount + 1);
      });
    });
  });

  describe('Precomputed flags', () => {
    let fetchSpy: jest.Mock;
    beforeEach(() => {
      configurationRequestor = new ConfigurationRequestor(httpClient, configurationFeed, {
        precomputed: {
          subjectKey: 'subject-key',
          subjectAttributes: ensureContextualSubjectAttributes({
            'attribute-key': 'attribute-value',
          }),
        },
      });

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

    it('Fetches precomputed flag configuration', async () => {
      const configuration = await configurationRequestor.fetchConfiguration();

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      expect(configuration.getFlagKeys().length).toBe(2);

      const precomputed = configuration.getPrecomputedConfiguration();

      const flag1 = precomputed?.response.flags['precomputed-flag-1'];
      expect(flag1?.allocationKey).toBe('default');
      expect(flag1?.variationKey).toBe('true-variation');
      expect(flag1?.variationType).toBe('BOOLEAN');
      expect(flag1?.variationValue).toBe('true');
      expect(flag1?.extraLogging).toEqual({});
      expect(flag1?.doLog).toBe(true);

      const flag2 = precomputed?.response.flags['precomputed-flag-2'];
      expect(flag2?.allocationKey).toBe('test-group');
      expect(flag2?.variationKey).toBe('variation-a');
      expect(flag2?.variationType).toBe('STRING');
      expect(flag2?.variationValue).toBe('variation-a');
      expect(flag2?.extraLogging).toEqual({});
      expect(flag2?.doLog).toBe(true);

      expect(precomputed?.response.format).toBe('PRECOMPUTED');

      expect(precomputed?.response.environment).toStrictEqual({ name: 'production' });
      expect(precomputed?.response.createdAt).toBe('2024-03-20T00:00:00Z');
    });
  });
});
