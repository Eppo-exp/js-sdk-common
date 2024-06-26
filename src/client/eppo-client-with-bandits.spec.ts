import {
  readMockUFCResponse,
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  readTestData,
  BanditTestCase,
  BANDIT_TEST_DATA_DIR,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import { BanditParameters, Flag } from '../interfaces';
import { Attributes } from '../types';

import EppoClient from './eppo-client';

describe('EppoClient Bandits E2E test', () => {
  const flagStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditStore = new MemoryOnlyConfigurationStore<BanditParameters>();
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
    const configurationRequestor = new ConfigurationRequestor(httpClient, flagStore, banditStore);
    await configurationRequestor.fetchAndStoreConfigurations();
  });

  beforeEach(() => {
    client = new EppoClient(flagStore, banditStore);
    client.setIsGracefulFailureMode(false);
    client.setAssignmentLogger({ logAssignment: mockLogAssignment });
    client.setBanditLogger({ logBanditAction: mockLogBanditAction });
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Shared test cases', () => {
    const testData = readTestData<BanditTestCase>(BANDIT_TEST_DATA_DIR);
    // Build a map for more useful test names
    const testsByFlagKey: Record<string, BanditTestCase> = {};
    testData.forEach((testCase) => (testsByFlagKey[testCase.flag] = testCase));

    it.each(Object.keys(testsByFlagKey))(
      'Shared bandit test case - %s',
      async (flagKey: string) => {
        const { defaultValue, subjects } = testsByFlagKey[flagKey];
        let numAssignmentsChecked = 0;
        subjects.forEach((subject) => {
          const actions: Record<string, Attributes> = {};
          subject.actions.forEach((action) => {
            actions[action.actionKey] = {
              ...action.numericAttributes,
              ...action.categoricalAttributes,
            };
          });

          // TODO: handle already-bucketed attributes
          const subjectAttributes: Attributes = {};
          Object.entries(subject.subjectAttributes.numericAttributes).forEach(
            ([attribute, value]) => {
              if (typeof attribute === 'number') {
                subjectAttributes[attribute] = value;
              }
            },
          );
          Object.entries(subject.subjectAttributes.categoricalAttributes).forEach(
            ([attribute, value]) => {
              if (value) {
                subjectAttributes[attribute] = value.toString();
              }
            },
          );

          const banditAssignment = client.getBanditAction(
            flagKey,
            subject.subjectKey,
            subjectAttributes,
            actions,
            defaultValue,
          );

          // Do this check in addition to assertions to provide helpful information on exactly which
          // evaluation failed to produce an expected result
          if (
            banditAssignment.variation !== subject.assignment.variation ||
            banditAssignment.action !== subject.assignment.action
          ) {
            console.error(
              `Unexpected result for flag ${flagKey} and subject ${subject.subjectKey}`,
            );
          }

          expect(banditAssignment.variation).toBe(subject.assignment.variation);
          expect(banditAssignment.action).toBe(subject.assignment.action);
          numAssignmentsChecked += 1;
        });
        // Ensure that this test case correctly checked some test assignments
        expect(numAssignmentsChecked).toBeGreaterThan(0);
      },
    );

    //TODO: make this a shared data test case
    it('Returns default value if no actions provided', () => {
      const banditAssignment = client.getBanditAction(
        'banner_bandit_flag',
        'eve',
        {},
        {},
        'control',
      );

      expect(banditAssignment.variation).toBe('control');
      expect(banditAssignment.action).toBeNull();
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

      // TODO: update shared bandit test UFC to have doLog: true for bandit
      /*
      expect(mockLogAssignment).toHaveBeenCalledTimes(1);
      const assignmentEvent: IAssignmentEvent = mockLogAssignment.mock.calls[0][0];
      expect(new Date(assignmentEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(assignmentEvent.featureFlag).toBe(flagKey);
      expect(assignmentEvent.allocation).toBe('analysis');
      expect(assignmentEvent.experiment).toBe('banner_bandit-analysis');
      expect(assignmentEvent.variation).toBe('banner_bandit');
      expect(assignmentEvent.subject).toBe(subjectKey);
      expect(assignmentEvent.subjectAttributes).toStrictEqual(subjectAttributes);
      expect(assignmentEvent.metaData?.obfuscated).toBe(false);
       */

      expect(mockLogBanditAction).toHaveBeenCalledTimes(1);
      const banditEvent: IBanditEvent = mockLogBanditAction.mock.calls[0][0];
      expect(new Date(banditEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(banditEvent.featureFlag).toBe(flagKey);
      expect(banditEvent.bandit).toBe('banner_bandit');
      expect(banditEvent.subject).toBe(subjectKey);
      expect(banditEvent.action).toBe('adidas');
      expect(banditEvent.actionProbability).toBeCloseTo(0.099);
      expect(banditEvent.optimalityGap).toBe(7.1);
      expect(banditEvent.modelVersion).toBe('v123');
      expect(banditEvent.subjectNumericAttributes).toStrictEqual({ age: 25 });
      expect(banditEvent.subjectCategoricalAttributes).toStrictEqual({
        country: 'USA',
        gender_identity: 'female',
      });
      expect(banditEvent.actionNumericAttributes).toStrictEqual({ brand_affinity: -1 });
      expect(banditEvent.actionCategoricalAttributes).toStrictEqual({ loyalty_tier: 'bronze' });
      expect(banditEvent.metaData?.obfuscated).toBe(false);
    });

    it('Flushed queued logging events when a logger is set', () => {
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

      client.setAssignmentLogger({ logAssignment: mockLogAssignment });
      client.setBanditLogger({ logBanditAction: mockLogBanditAction });

      // TODO: update shared bandit test UFC to have doLog: true for bandit
      /*
      expect(mockLogAssignment).toHaveBeenCalledTimes(1);
      const assignmentEvent: IAssignmentEvent = mockLogAssignment.mock.calls[0][0];
      expect(assignmentEvent.variation).toBe('banner_bandit');
      */

      expect(mockLogBanditAction).toHaveBeenCalledTimes(1);
      const banditEvent: IBanditEvent = mockLogBanditAction.mock.calls[0][0];
      expect(new Date(banditEvent.timestamp).getTime()).toBeGreaterThanOrEqual(testStart);
      expect(banditEvent.action).toBe('adidas');
    });

    describe('Bandit evaluation errors', () => {
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

      it('Returns default value when graceful mode is on', () => {
        client.setIsGracefulFailureMode(true);
        const banditAssignment = client.getBanditAction(
          flagKey,
          subjectKey,
          subjectAttributes,
          actions,
          'control',
        );
        expect(banditAssignment.variation).toBe('control');
        expect(banditAssignment.action).toBeNull();
      });

      it('Throws the error when graceful mode is off', () => {
        client.setIsGracefulFailureMode(false); // Note: this is superfluous to beforeEach(), but done for clarity
        expect(() =>
          client.getBanditAction(flagKey, subjectKey, subjectAttributes, actions, 'control'),
        ).toThrow();
      });
    });
  });
});
