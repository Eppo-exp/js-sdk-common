import * as base64 from 'js-base64';

import {
  readMockUFCResponse,
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  testCasesByFileName,
  BanditTestCase,
  BANDIT_TEST_DATA_DIR,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluation, BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import {
  IConfigurationWire,
  IPrecomputedConfiguration,
  IObfuscatedPrecomputedConfigurationResponse,
} from '../configuration-wire-types';
import { Evaluator, FlagEvaluation } from '../evaluator';
import {
  AllocationEvaluationCode,
  IFlagEvaluationDetails,
} from '../flag-evaluation-details-builder';
import FetchHttpClient from '../http-client';
import { BanditVariation, BanditParameters, Flag } from '../interfaces';
import { attributeEncodeBase64 } from '../obfuscation';
import { Attributes, BanditActions, ContextAttributes } from '../types';

import EppoClient, { IAssignmentDetails } from './eppo-client';

describe('EppoClient Bandits E2E test', () => {
  const flagStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  const banditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  let client: EppoClient;
  const mockLogAssignment = jest.fn();
  const mockLogBanditAction = jest.fn();

  beforeAll(async () => {
    // Mock out fetch to return the bandit flag configuration and model parameters
    global.fetch = jest.fn((url: string) => {
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
    const configurationRequestor = new ConfigurationRequestor(
      httpClient,
      flagStore,
      banditVariationStore,
      banditModelStore,
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

  describe('Shared test cases', () => {
    const testCases = testCasesByFileName<BanditTestCase>(BANDIT_TEST_DATA_DIR);

    it.each(Object.keys(testCases))('Shared bandit test case - %s', async (fileName: string) => {
      const { flag: flagKey, defaultValue, subjects } = testCases[fileName];
      let numAssignmentsChecked = 0;
      subjects.forEach((subject) => {
        // test files have actions as an array, so we convert them to a map as expected by the client
        const actions: Record<string, ContextAttributes> = {};
        subject.actions.forEach((action) => {
          actions[action.actionKey] = {
            numericAttributes: action.numericAttributes,
            categoricalAttributes: action.categoricalAttributes,
          };
        });

        // get the bandit assignment for the test case
        const banditAssignment = client.getBanditAction(
          flagKey,
          subject.subjectKey,
          subject.subjectAttributes,
          actions,
          defaultValue,
        );

        // Do this check in addition to assertions to provide helpful information on exactly which
        // evaluation failed to produce an expected result
        if (
          banditAssignment.variation !== subject.assignment.variation ||
          banditAssignment.action !== subject.assignment.action
        ) {
          console.error(`Unexpected result for flag ${flagKey} and subject ${subject.subjectKey}`);
        }

        expect(banditAssignment.variation).toBe(subject.assignment.variation);
        expect(banditAssignment.action).toBe(subject.assignment.action);
        numAssignmentsChecked += 1;
      });
      // Ensure that this test case correctly checked some test assignments
      expect(numAssignmentsChecked).toBeGreaterThan(0);
    });
  });

  describe('Client-specific tests', () => {
    const testStart = Date.now();
    const flagKey = 'banner_bandit_flag'; // piggyback off a shared test data flag
    const subjectKey = 'bob';
    const subjectAttributes: Attributes = { age: 25, country: 'USA', gender_identity: 'female' };
    const actions: Record<string, Attributes> = {
      nike: { brand_affinity: 1.5, loyalty_tier: 'silver' },
      adidas: { brand_affinity: -1.0, loyalty_tier: 'bronze' },
      reebok: { brand_affinity: 0.5, loyalty_tier: 'gold' },
    };

    it('Passes the correct information to the logger', () => {
      const banditAssignment = client.getBanditAction(
        flagKey,
        subjectKey,
        subjectAttributes,
        actions,
        'control',
      );

      expect(banditAssignment.variation).toBe('banner_bandit');
      expect(banditAssignment.action).toBe('adidas');

      expect(mockLogAssignment).toHaveBeenCalledTimes(1);
      const assignmentEvent: IAssignmentEvent = mockLogAssignment.mock.calls[0][0];
      expect(new Date(assignmentEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(assignmentEvent.featureFlag).toBe(flagKey);
      expect(assignmentEvent.allocation).toBe('training');
      expect(assignmentEvent.experiment).toBe('banner_bandit_flag-training');
      expect(assignmentEvent.variation).toBe('banner_bandit');
      expect(assignmentEvent.subject).toBe(subjectKey);
      expect(assignmentEvent.subjectAttributes).toStrictEqual(subjectAttributes);
      expect(assignmentEvent.metaData?.obfuscated).toBe(false);

      expect(mockLogBanditAction).toHaveBeenCalledTimes(1);
      const banditEvent: IBanditEvent = mockLogBanditAction.mock.calls[0][0];
      expect(new Date(banditEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(banditEvent.featureFlag).toBe(flagKey);
      expect(banditEvent.bandit).toBe('banner_bandit');
      expect(banditEvent.subject).toBe(subjectKey);
      expect(banditEvent.action).toBe('adidas');
      expect(banditEvent.actionProbability).toBeCloseTo(0.099);
      expect(banditEvent.optimalityGap).toBe(7.1);
      expect(banditEvent.modelVersion).toBe('123');
      expect(banditEvent.subjectNumericAttributes).toStrictEqual({ age: 25 });
      expect(banditEvent.subjectCategoricalAttributes).toStrictEqual({
        country: 'USA',
        gender_identity: 'female',
      });
      expect(banditEvent.actionNumericAttributes).toStrictEqual({ brand_affinity: -1 });
      expect(banditEvent.actionCategoricalAttributes).toStrictEqual({ loyalty_tier: 'bronze' });
      expect(banditEvent.metaData?.obfuscated).toBe(false);

      expect(banditEvent.evaluationDetails?.configFetchedAt).toBeTruthy();
      expect(typeof banditEvent.evaluationDetails?.configFetchedAt).toBe('string');
      const expectedEvaluationDetails: IFlagEvaluationDetails = {
        configFetchedAt: expect.any(String),
        configPublishedAt: '2024-04-17T19:40:53.716Z',
        environmentName: 'Test',
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'bob belongs to the range of traffic assigned to "banner_bandit" defined in allocation "training".',
        matchedAllocation: {
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          key: 'training',
          orderPosition: 2,
        },
        matchedRule: null,
        unevaluatedAllocations: [],
        unmatchedAllocations: [
          {
            allocationEvaluationCode: AllocationEvaluationCode.TRAFFIC_EXPOSURE_MISS,
            key: 'analysis',
            orderPosition: 1,
          },
        ],
        variationKey: 'banner_bandit',
        variationValue: 'banner_bandit',
        banditKey: 'banner_bandit',
        banditAction: 'adidas',
      };
      expect(banditEvent.evaluationDetails).toEqual(expectedEvaluationDetails);
    });

    it('Flushed queued logging events when a logger is set', () => {
      client.useLRUInMemoryAssignmentCache(5);
      client.useExpiringInMemoryBanditAssignmentCache(5);
      client.setAssignmentLogger(null as unknown as IAssignmentLogger);
      client.setBanditLogger(null as unknown as IBanditLogger);
      const banditAssignment = client.getBanditAction(
        flagKey,
        subjectKey,
        subjectAttributes,
        actions,
        'control',
      );

      expect(banditAssignment.variation).toBe('banner_bandit');
      expect(banditAssignment.action).toBe('adidas');

      expect(mockLogAssignment).not.toHaveBeenCalled();
      expect(mockLogBanditAction).not.toHaveBeenCalled();

      const repeatAssignment = client.getBanditAction(
        flagKey,
        subjectKey,
        subjectAttributes,
        actions,
        'control',
      );

      expect(repeatAssignment.variation).toBe('banner_bandit');
      expect(repeatAssignment.action).toBe('adidas');

      expect(mockLogAssignment).not.toHaveBeenCalled();
      expect(mockLogBanditAction).not.toHaveBeenCalled();

      client.setAssignmentLogger({ logAssignment: mockLogAssignment });
      client.setBanditLogger({ logBanditAction: mockLogBanditAction });

      expect(mockLogAssignment).toHaveBeenCalledTimes(1);
      const assignmentEvent: IAssignmentEvent = mockLogAssignment.mock.calls[0][0];
      expect(assignmentEvent.variation).toBe('banner_bandit');

      expect(mockLogBanditAction).toHaveBeenCalledTimes(1);
      const banditEvent: IBanditEvent = mockLogBanditAction.mock.calls[0][0];
      expect(new Date(banditEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(banditEvent.action).toBe('adidas');
    });

    it('Logs assignment but not bandit action if no actions provided', () => {
      const banditAssignment = client.getBanditAction(
        'banner_bandit_flag',
        'eve',
        {},
        {},
        'control',
      );

      expect(banditAssignment.variation).toBe('banner_bandit');
      expect(banditAssignment.action).toBeNull();

      expect(mockLogAssignment).toHaveBeenCalledTimes(1);
      expect(mockLogBanditAction).not.toHaveBeenCalled();
    });

    describe('Bandit evaluation errors', () => {
      const testStart = Date.now();

      beforeEach(() => {
        jest
          .spyOn(
            (client as unknown as { banditEvaluator: BanditEvaluator }).banditEvaluator,
            'evaluateBandit',
          )
          .mockImplementation(() => {
            throw new Error('Intentional Error For Test');
          });
      });

      it('Returns null action when graceful mode is on', () => {
        client.setIsGracefulFailureMode(true);
        const banditAssignment = client.getBanditActionDetails(
          flagKey,
          subjectKey,
          subjectAttributes,
          actions,
          'control',
        );
        expect(banditAssignment.variation).toBe('banner_bandit');
        expect(banditAssignment.action).toBeNull();

        expect(
          Date.parse(banditAssignment.evaluationDetails.configFetchedAt),
        ).toBeGreaterThanOrEqual(testStart);
        const expectedEvaluationDetails: IFlagEvaluationDetails = {
          configFetchedAt: expect.any(String),
          configPublishedAt: '2024-04-17T19:40:53.716Z',
          environmentName: 'Test',
          flagEvaluationCode: 'BANDIT_ERROR',
          flagEvaluationDescription: 'Error evaluating bandit action: Intentional Error For Test',
          matchedAllocation: {
            allocationEvaluationCode: AllocationEvaluationCode.MATCH,
            key: 'training',
            orderPosition: 2,
          },
          matchedRule: null,
          unevaluatedAllocations: [],
          unmatchedAllocations: [
            {
              allocationEvaluationCode: AllocationEvaluationCode.TRAFFIC_EXPOSURE_MISS,
              key: 'analysis',
              orderPosition: 1,
            },
          ],
          variationKey: 'banner_bandit',
          variationValue: 'banner_bandit',
          banditKey: 'banner_bandit',
          banditAction: null,
        };
        expect(banditAssignment.evaluationDetails).toEqual(expectedEvaluationDetails);
      });

      it('Throws the error when graceful mode is off', () => {
        client.setIsGracefulFailureMode(false); // Note: this is superfluous to beforeEach(), but done for clarity
        expect(() =>
          client.getBanditAction(flagKey, subjectKey, subjectAttributes, actions, 'control'),
        ).toThrow();
      });
    });

    describe('Flexible arguments for attributes', () => {
      // Note these mirror the test cases in test-case-banner-bandit.dynamic-typing.json
      it('Can take non-contextual subject attributes', async () => {
        // mirror test case in test-case-banner-bandit.dynamic-typing.json
        const actions: Record<string, ContextAttributes> = {
          nike: {
            numericAttributes: { brand_affinity: -5 },
            categoricalAttributes: { loyalty_tier: 'silver' },
          },
          adidas: {
            numericAttributes: { brand_affinity: 1.0 },
            categoricalAttributes: { loyalty_tier: 'bronze' },
          },
          reebok: {
            numericAttributes: { brand_affinity: 20 },
            categoricalAttributes: { loyalty_tier: 'gold' },
          },
        };

        const subjectAttributesWithAreaCode: Attributes = {
          age: 25,
          mistake: 'oops',
          country: 'USA',
          gender_identity: 'female',
          area_code: '303', // categorical area code
        };

        let banditAssignment = client.getBanditAction(
          flagKey,
          'henry',
          subjectAttributesWithAreaCode,
          actions,
          'default',
        );
        expect(banditAssignment.action).toBe('adidas');
        expect(banditAssignment.variation).toBe('banner_bandit');

        // changing area code to a number should result in a different evaluation
        subjectAttributesWithAreaCode.area_code = 303;

        banditAssignment = client.getBanditAction(
          flagKey,
          'henry',
          subjectAttributesWithAreaCode,
          actions,
          'default',
        );
        expect(banditAssignment.action).toBe('reebok');
        expect(banditAssignment.variation).toBe('banner_bandit');
      });

      it('Can take non-contextual action attributes', async () => {
        const actionsWithNonContextualAttributes: Record<string, Attributes> = {
          nike: { brand_affinity: -15, loyalty_tier: 'silver', zip: '81427' },
          adidas: { brand_affinity: 0.0, loyalty_tier: 'bronze' },
          reebok: { brand_affinity: 15, loyalty_tier: 'gold' },
        };

        let banditAssignment = client.getBanditAction(
          flagKey,
          'imogene',
          subjectAttributes,
          actionsWithNonContextualAttributes,
          'default',
        );
        expect(banditAssignment.action).toBe('nike');
        expect(banditAssignment.variation).toBe('banner_bandit');

        // changing zip code to a number should result in a different evaluation
        actionsWithNonContextualAttributes.nike.zip = 81427;

        banditAssignment = client.getBanditAction(
          flagKey,
          'imogene',
          subjectAttributes,
          actionsWithNonContextualAttributes,
          'default',
        );
        expect(banditAssignment.action).toBe('adidas');
        expect(banditAssignment.variation).toBe('banner_bandit');
      });

      it('Can take actions without any context', async () => {
        const actionNamesOnly = ['nike', 'adidas', 'reebok'];

        let banditAssignment = client.getBanditAction(
          flagKey,
          'imogene',
          subjectAttributes,
          actionNamesOnly,
          'default',
        );
        expect(banditAssignment.action).toBe('nike');
        expect(banditAssignment.variation).toBe('banner_bandit');

        expect(mockLogBanditAction).toHaveBeenCalledTimes(1);
        expect(mockLogBanditAction.mock.calls[0][0].actionProbability).toBeCloseTo(0.256);

        // Duplicates should be ignored and not change anything
        actionNamesOnly.push('nike');

        banditAssignment = client.getBanditAction(
          flagKey,
          'imogene',
          subjectAttributes,
          actionNamesOnly,
          'default',
        );
        expect(banditAssignment.action).toBe('nike');
        expect(banditAssignment.variation).toBe('banner_bandit');

        expect(mockLogBanditAction).toHaveBeenCalledTimes(2);
        expect(mockLogBanditAction.mock.calls[1][0].actionProbability).toBeCloseTo(0.256);
      });
    });

    describe('Best bandit action', () => {
      it('Selects the highest scoring action', async () => {
        const actions: Record<string, ContextAttributes> = {
          nike: {
            numericAttributes: { brand_affinity: 1.0 },
            categoricalAttributes: {},
          },
          adidas: {
            numericAttributes: { brand_affinity: 1.0 },
            categoricalAttributes: {},
          },
          reebok: {
            numericAttributes: { brand_affinity: 2.0 },
            categoricalAttributes: {},
          },
        };

        const subjectAttributesWithAreaCode: Attributes = {
          age: 25,
          mistake: 'oops',
          country: 'USA',
          gender_identity: 'female',
          area_code: '303', // categorical area code
        };

        const banditAssignment = client.getBestAction(
          flagKey,
          subjectAttributesWithAreaCode,
          actions,
          'default',
        );
        expect(banditAssignment).toBe('adidas');
      });
    });

    describe('Assignment logging deduplication', () => {
      let mockEvaluateFlag: jest.SpyInstance;
      let mockEvaluateBandit: jest.SpyInstance;
      // The below two variables allow easily changing what the mock evaluation functions return throughout the test
      let variationToReturn: string;
      let actionToReturn: string | null;

      // Convenience method for repeatedly making the exact same assignment call
      function requestClientBanditAction(): Omit<IAssignmentDetails<string>, 'evaluationDetails'> {
        return client.getBanditAction(
          flagKey,
          subjectKey,
          subjectAttributes,
          ['toyota', 'honda'],
          'control',
        );
      }

      beforeAll(() => {
        mockEvaluateFlag = jest
          .spyOn(Evaluator.prototype, 'evaluateFlag')
          .mockImplementation(() => {
            return {
              flagKey,
              subjectKey,
              subjectAttributes,
              allocationKey: 'mock-allocation',
              variation: { key: variationToReturn, value: variationToReturn },
              extraLogging: {},
              doLog: true,
              flagEvaluationDetails: {
                flagEvaluationCode: 'MATCH',
                flagEvaluationDescription: 'Mocked evaluation',
              },
            } as FlagEvaluation;
          });

        mockEvaluateBandit = jest
          .spyOn(BanditEvaluator.prototype, 'evaluateBandit')
          .mockImplementation(() => {
            return {
              flagKey,
              subjectKey,
              subjectAttributes: { numericAttributes: {}, categoricalAttributes: {} },
              actionKey: actionToReturn,
              actionAttributes: { numericAttributes: {}, categoricalAttributes: {} },
              actionScore: 10,
              actionWeight: 0.5,
              gamma: 1.0,
              optimalityGap: 5,
            } as BanditEvaluation;
          });
      });

      beforeEach(() => {
        client.useNonExpiringInMemoryAssignmentCache();
        client.useNonExpiringInMemoryBanditAssignmentCache();
      });

      afterEach(() => {
        client.disableAssignmentCache();
        client.disableBanditAssignmentCache();
      });

      afterAll(() => {
        mockEvaluateFlag.mockClear();
        mockEvaluateBandit.mockClear();
        jest.restoreAllMocks();
      });

      it('handles bandit actions appropriately', async () => {
        // First assign to non-bandit variation
        variationToReturn = 'non-bandit';
        actionToReturn = null;
        const firstNonBanditAssignment = requestClientBanditAction();

        expect(firstNonBanditAssignment.variation).toBe('non-bandit');
        expect(firstNonBanditAssignment.action).toBeNull();
        expect(mockLogAssignment).toHaveBeenCalledTimes(1); // new variation assignment
        expect(mockLogBanditAction).not.toHaveBeenCalled(); // no bandit assignment

        // Assign bandit action
        variationToReturn = 'banner_bandit';
        actionToReturn = 'toyota';
        const firstBanditAssignment = requestClientBanditAction();

        expect(firstBanditAssignment.variation).toBe('banner_bandit');
        expect(firstBanditAssignment.action).toBe('toyota');
        expect(mockLogAssignment).toHaveBeenCalledTimes(2); // new variation assignment
        expect(mockLogBanditAction).toHaveBeenCalledTimes(1); // new bandit assignment

        // Repeat bandit action assignment
        variationToReturn = 'banner_bandit';
        actionToReturn = 'toyota';
        const secondBanditAssignment = requestClientBanditAction();

        expect(secondBanditAssignment.variation).toBe('banner_bandit');
        expect(secondBanditAssignment.action).toBe('toyota');
        expect(mockLogAssignment).toHaveBeenCalledTimes(2); // repeat variation assignment
        expect(mockLogBanditAction).toHaveBeenCalledTimes(1); // repeat bandit assignment

        // New bandit action assignment
        variationToReturn = 'banner_bandit';
        actionToReturn = 'honda';
        const thirdBanditAssignment = requestClientBanditAction();

        expect(thirdBanditAssignment.variation).toBe('banner_bandit');
        expect(thirdBanditAssignment.action).toBe('honda');
        expect(mockLogAssignment).toHaveBeenCalledTimes(2); // repeat variation assignment
        expect(mockLogBanditAction).toHaveBeenCalledTimes(2); // new bandit assignment

        // Flip-flop to an earlier action assignment
        variationToReturn = 'banner_bandit';
        actionToReturn = 'toyota';
        const fourthBanditAssignment = requestClientBanditAction();

        expect(fourthBanditAssignment.variation).toBe('banner_bandit');
        expect(fourthBanditAssignment.action).toBe('toyota');
        expect(mockLogAssignment).toHaveBeenCalledTimes(2); // repeat variation assignment
        expect(mockLogBanditAction).toHaveBeenCalledTimes(3); // "new" bandit assignment

        // Flip-flop back to non-bandit assignment
        variationToReturn = 'non-bandit';
        actionToReturn = null;
        const secondNonBanditAssignment = requestClientBanditAction();

        expect(secondNonBanditAssignment.variation).toBe('non-bandit');
        expect(secondNonBanditAssignment.action).toBeNull();
        expect(mockLogAssignment).toHaveBeenCalledTimes(3); // "new" variation assignment
        expect(mockLogBanditAction).toHaveBeenCalledTimes(3); // no bandit assignment
      });
    });
  });

  describe('precomputed bandits', () => {
    const bob = 'bob';

    const bobInfo: ContextAttributes = {
      numericAttributes: { age: 30, account_age: 10 },
      categoricalAttributes: { country: 'UK', gender_identity: 'male' },
    };

    const bobActions: Record<string, BanditActions> = {
      banner_bandit_flag: {
        nike: {
          numericAttributes: { brand_affinity: -2.5 },
          categoricalAttributes: { loyalty_tier: 'bronze' },
        },
        adidas: {
          numericAttributes: { brand_affinity: -2.5 },
          categoricalAttributes: { loyalty_tier: 'bronze' },
        },
        reebok: {
          numericAttributes: { brand_affinity: -2.5 },
          categoricalAttributes: { loyalty_tier: 'bronze' },
        },
      },
    };

    function getPrecomputedResults(
      client: EppoClient,
      subjectKey: string,
      subjectAttributes: ContextAttributes,
      banditActions: Record<string, BanditActions>,
    ): IPrecomputedConfiguration {
      const salt = base64.fromUint8Array(new Uint8Array([101, 112, 112, 111]));
      const precomputedResults = client.getPrecomputedConfiguration(
        subjectKey,
        subjectAttributes,
        banditActions,
        salt,
      );

      const { precomputed } = JSON.parse(precomputedResults) as IConfigurationWire;
      if (!precomputed) {
        fail('precomputed result was not parsed');
      }
      return precomputed;
    }

    describe('obfuscated results', () => {
      it('obfuscates precomputed bandits', () => {
        const bannerBanditFlagMd5 = '3ac89e06235484aa6f2aec8c33109a02';
        const brandAffinityB64 = 'YnJhbmRfYWZmaW5pdHk=';
        const loyaltyTierB64 = 'bG95YWx0eV90aWVy';
        const bronzeB64 = 'YnJvbnpl';
        const adidasB64 = 'YWRpZGFz';
        const modelB64 = 'MTIz'; // 123

        const precomputed = getPrecomputedResults(client, bob, bobInfo, bobActions);

        const response = JSON.parse(
          precomputed.response,
        ) as IObfuscatedPrecomputedConfigurationResponse;

        const numericAttrs = response.bandits[bannerBanditFlagMd5]['actionNumericAttributes'];
        const categoricalAttrs =
          response.bandits[bannerBanditFlagMd5]['actionCategoricalAttributes'];
        expect(response.bandits[bannerBanditFlagMd5]['action']).toEqual(adidasB64);
        expect(response.bandits[bannerBanditFlagMd5]['modelVersion']).toEqual(modelB64);
        expect(categoricalAttrs[loyaltyTierB64]).toEqual(bronzeB64);
        expect(numericAttrs[brandAffinityB64]).toEqual(attributeEncodeBase64(-2.5));
      });
    });
  });
});
