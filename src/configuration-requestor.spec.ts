import {
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  MOCK_UFC_RESPONSE_FILE,
  readMockUFCResponse,
} from '../test/testHelpers';

import ApiEndpoints from './api-endpoints';
import ConfigurationRequestor from './configuration-requestor';
import { IConfigurationStore } from './configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import FetchHttpClient, { IHttpClient } from './http-client';
import { BanditVariation, BanditParameters, Flag } from './interfaces';

describe('ConfigurationRequestor', () => {
  let flagStore: IConfigurationStore<Flag>;
  let banditVariationStore: IConfigurationStore<BanditVariation[]>;
  let banditModelStore: IConfigurationStore<BanditParameters>;
  let httpClient: IHttpClient;
  let configurationRequestor: ConfigurationRequestor;

  beforeEach(async () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      },
    });
    httpClient = new FetchHttpClient(apiEndpoints, 1000);
    flagStore = new MemoryOnlyConfigurationStore<Flag>();
    banditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
    banditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();
    configurationRequestor = new ConfigurationRequestor(
      httpClient,
      flagStore,
      banditVariationStore,
      banditModelStore,
    );
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
      await configurationRequestor.fetchAndStoreConfigurations();

      expect(fetchSpy).toHaveBeenCalledTimes(1); // Flags only; no bandits

      expect(flagStore.getKeys().length).toBeGreaterThanOrEqual(16);
      const killSwitchFlag = flagStore.get('kill-switch');
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

      expect(banditModelStore.getKeys().length).toBe(0);
    });
  });

  describe('Flags with bandits', () => {
    let fetchSpy: jest.Mock;

    beforeAll(() => {
      fetchSpy = jest.fn((url: string) => {
        const responseFile = url.includes('bandits')
          ? MOCK_BANDIT_MODELS_RESPONSE_FILE
          : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;
        const response = readMockUFCResponse(responseFile);

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(response),
        });
      }) as jest.Mock;
      global.fetch = fetchSpy;
    });

    it('Fetches and populates bandit parameters', async () => {
      await configurationRequestor.fetchAndStoreConfigurations();

      expect(fetchSpy).toHaveBeenCalledTimes(2); // Once for UFC, another for bandits

      expect(flagStore.getKeys().length).toBeGreaterThanOrEqual(2);
      expect(flagStore.get('banner_bandit_flag')).toBeDefined();
      expect(flagStore.get('cold_start_bandit')).toBeDefined();

      expect(banditModelStore.getKeys().length).toBeGreaterThanOrEqual(2);

      const bannerBandit = banditModelStore.get('banner_bandit');
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
        bannerCoefficients['adidas'].subjectCategoricalCoefficients[0].valueCoefficients['female'],
      ).toBe(0);

      const coldStartBandit = banditModelStore.get('cold_start_bandit');
      expect(coldStartBandit?.banditKey).toBe('cold_start_bandit');
      expect(coldStartBandit?.modelName).toBe('falcon');
      expect(coldStartBandit?.modelVersion).toBe('cold start');
      const coldStartModelData = coldStartBandit?.modelData;
      expect(coldStartModelData?.gamma).toBe(1);
      expect(coldStartModelData?.defaultActionScore).toBe(0);
      expect(coldStartModelData?.actionProbabilityFloor).toBe(0);
      expect(coldStartModelData?.coefficients).toStrictEqual({});
    });

    it('Will not fetch bandit parameters if there is no store', async () => {
      configurationRequestor = new ConfigurationRequestor(httpClient, flagStore, null, null);
      await configurationRequestor.fetchAndStoreConfigurations();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('Requests bandits only when model versions are different', async () => {
      await configurationRequestor.fetchAndStoreConfigurations();
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Once for UFC, another for bandits

      await configurationRequestor.fetchAndStoreConfigurations();
      expect(fetchSpy).toHaveBeenCalledTimes(3); // Once just for UFC, bandits should be skipped
    });
  });
});
