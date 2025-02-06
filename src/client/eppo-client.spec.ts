import * as base64 from 'js-base64';
import { times } from 'lodash';
import * as td from 'testdouble';

import {
  ASSIGNMENT_TEST_DATA_DIR,
  IAssignmentTestCase,
  MOCK_UFC_RESPONSE_FILE,
  OBFUSCATED_MOCK_UFC_RESPONSE_FILE,
  SubjectTestCase,
  getTestAssignments,
  readMockUFCResponse,
  testCasesByFileName,
  validateTestAssignments,
} from '../../test/testHelpers';
import { IAssignmentLogger } from '../assignment-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';
import {
  IConfigurationWire,
  IObfuscatedPrecomputedConfigurationResponse,
  ObfuscatedPrecomputedConfigurationResponse,
} from '../configuration';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { MAX_EVENT_QUEUE_SIZE, DEFAULT_POLL_INTERVAL_MS, POLL_JITTER_PCT } from '../constants';
import { decodePrecomputedFlag } from '../decoding';
import { Flag, ObfuscatedFlag, Variation, VariationType } from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import { AttributeType } from '../types';

import EppoClient, { FlagConfigurationRequestParameters, checkTypeMatch } from './eppo-client';
import { initConfiguration } from './test-utils';

// Use a known salt to produce deterministic hashes
const salt = base64.fromUint8Array(new Uint8Array([7, 53, 17, 78]));

describe('EppoClient E2E test', () => {
  global.fetch = jest.fn(() => {
    const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ufc),
    });
  }) as jest.Mock;
  const storage = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();

  beforeAll(async () => {
    await initConfiguration(storage);
  });

  const flagKey = 'mock-flag';

  const variationA = {
    key: 'a',
    value: 'variation-a',
  };
  const variationAEncoded = 'dmFyaWF0aW9uLWE=';
  const variationBEncoded = 'dmFyaWF0aW9uLWI=';

  const variationB = {
    key: 'b',
    value: 'variation-b',
  };

  const mockFlag: Flag = {
    key: flagKey,
    enabled: true,
    variationType: VariationType.STRING,
    variations: { a: variationA, b: variationB },
    allocations: [
      {
        key: 'allocation-a',
        rules: [],
        splits: [
          {
            shards: [],
            variationKey: 'a',
          },
        ],
        doLog: true,
      },
    ],
    totalShards: 10000,
  };

  describe('error encountered', () => {
    let client: EppoClient;

    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
      client = new EppoClient({ flagConfigurationStore: storage });

      td.replace(EppoClient.prototype, 'getAssignmentDetail', function () {
        throw new Error('Mock test error');
      });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns default value when graceful failure if error encountered', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getBoolAssignment(flagKey, 'subject-identifier', {}, true)).toBe(true);
      expect(client.getBoolAssignment(flagKey, 'subject-identifier', {}, false)).toBe(false);
      expect(client.getBooleanAssignment(flagKey, 'subject-identifier', {}, true)).toBe(true);
      expect(client.getBooleanAssignment(flagKey, 'subject-identifier', {}, false)).toBe(false);
      expect(client.getNumericAssignment(flagKey, 'subject-identifier', {}, 1)).toBe(1);
      expect(client.getNumericAssignment(flagKey, 'subject-identifier', {}, 0)).toBe(0);
      expect(client.getJSONAssignment(flagKey, 'subject-identifier', {}, {})).toEqual({});
      expect(
        client.getJSONAssignment(flagKey, 'subject-identifier', {}, { hello: 'world' }),
      ).toEqual({
        hello: 'world',
      });
      expect(client.getStringAssignment(flagKey, 'subject-identifier', {}, 'default')).toBe(
        'default',
      );
    });

    it('throws error when graceful failure is false', async () => {
      client.setIsGracefulFailureMode(false);

      expect(() => {
        client.getBoolAssignment(flagKey, 'subject-identifier', {}, true);
        client.getBooleanAssignment(flagKey, 'subject-identifier', {}, true);
      }).toThrow();

      expect(() => {
        client.getJSONAssignment(flagKey, 'subject-identifier', {}, {});
      }).toThrow();

      expect(() => {
        client.getNumericAssignment(flagKey, 'subject-identifier', {}, 1);
      }).toThrow();

      expect(() => {
        client.getStringAssignment(flagKey, 'subject-identifier', {}, 'default');
      }).toThrow();
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient({ flagConfigurationStore: storage });
      client.getStringAssignment(flagKey, 'subject-to-be-logged', {}, 'default-value');
      client.setAssignmentLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient({ flagConfigurationStore: storage });

      client.getStringAssignment(flagKey, 'subject-to-be-logged', {}, 'default-value');
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoClient({ flagConfigurationStore: storage });

      times(MAX_EVENT_QUEUE_SIZE + 100, (i) =>
        client.getStringAssignment(flagKey, `subject-to-be-logged-${i}`, {}, 'default-value'),
      );
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  describe('check type match', () => {
    it('returns false when types do not match', () => {
      expect(checkTypeMatch(VariationType.JSON, VariationType.STRING)).toBe(false);
    });
  });

  describe('precomputed flags', () => {
    beforeAll(() => {
      storage.setEntries({
        [flagKey]: mockFlag,
        disabledFlag: { ...mockFlag, enabled: false },
        anotherFlag: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-b',
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'b',
                },
              ],
              doLog: true,
            },
          ],
        },
      });
    });

    let client: EppoClient;
    beforeEach(() => {
      client = new EppoClient({ flagConfigurationStore: storage });
    });

    it('skips disabled flags', () => {
      const encodedPrecomputedWire = client.getPrecomputedConfiguration('subject', {}, {}, salt);
      const { precomputed } = JSON.parse(encodedPrecomputedWire) as IConfigurationWire;
      if (!precomputed) {
        fail('Precomputed data not in Configuration response');
      }
      const precomputedResponse = JSON.parse(
        precomputed.response,
      ) as ObfuscatedPrecomputedConfigurationResponse;

      expect(precomputedResponse).toBeTruthy();
      const precomputedFlags = precomputedResponse?.flags ?? {};

      expect(Object.keys(precomputedFlags)).toHaveLength(2);
      expect(Object.keys(precomputedFlags)).toContain(getMD5Hash('anotherFlag', salt));
      expect(Object.keys(precomputedFlags)).toContain(getMD5Hash(flagKey, salt));
      expect(Object.keys(precomputedFlags)).not.toContain(getMD5Hash('disabledFlag', salt));
    });

    it('evaluates and returns assignments', () => {
      const encodedPrecomputedWire = client.getPrecomputedConfiguration('subject', {}, {}, salt);
      const { precomputed } = JSON.parse(encodedPrecomputedWire) as IConfigurationWire;
      if (!precomputed) {
        fail('Precomputed data not in Configuration response');
      }
      const precomputedResponse = JSON.parse(
        precomputed.response,
      ) as IObfuscatedPrecomputedConfigurationResponse;

      expect(precomputedResponse).toBeTruthy();
      const precomputedFlags = precomputedResponse?.flags ?? {};
      const firstFlag = precomputedFlags[getMD5Hash(flagKey, salt)];
      const secondFlag = precomputedFlags[getMD5Hash('anotherFlag', salt)];
      expect(firstFlag.variationValue).toEqual(variationAEncoded);
      expect(secondFlag.variationValue).toEqual(variationBEncoded);
    });

    it('obfuscates assignments', () => {
      const encodedPrecomputedWire = client.getPrecomputedConfiguration('subject', {}, {}, salt);
      const { precomputed } = JSON.parse(encodedPrecomputedWire) as IConfigurationWire;
      if (!precomputed) {
        fail('Precomputed data not in Configuration response');
      }
      const precomputedResponse = JSON.parse(precomputed.response);

      expect(precomputedResponse).toBeTruthy();
      expect(precomputedResponse.salt).toEqual('BzURTg==');

      const precomputedFlags = precomputedResponse?.flags ?? {};
      expect(Object.keys(precomputedFlags)).toContain('61b6df4b153fdc8ee4498a008d0e40dc'); // flagKey, md5 hashed
      expect(Object.keys(precomputedFlags)).toContain('23ade17a2c18c4c3b8c9f780dca19fc1'); // 'anotherFlag', md5 hashed

      const decodedFirstFlag = decodePrecomputedFlag(
        precomputedFlags['61b6df4b153fdc8ee4498a008d0e40dc'],
      );
      expect(decodedFirstFlag.flagKey).toEqual('61b6df4b153fdc8ee4498a008d0e40dc');
      expect(decodedFirstFlag.variationType).toEqual(VariationType.STRING);
      expect(decodedFirstFlag.variationKey).toEqual('a');
      expect(decodedFirstFlag.variationValue).toEqual('variation-a');
      expect(decodedFirstFlag.doLog).toEqual(true);
      expect(decodedFirstFlag.extraLogging).toEqual({});

      const decodedSecondFlag = decodePrecomputedFlag(
        precomputedFlags['23ade17a2c18c4c3b8c9f780dca19fc1'],
      );
      expect(decodedSecondFlag.flagKey).toEqual('23ade17a2c18c4c3b8c9f780dca19fc1');
      expect(decodedSecondFlag.variationType).toEqual(VariationType.STRING);
      expect(decodedSecondFlag.variationKey).toEqual('b');
      expect(decodedSecondFlag.variationValue).toEqual('variation-b');
      expect(decodedSecondFlag.doLog).toEqual(true);
      expect(decodedSecondFlag.extraLogging).toEqual({});
    });
  });

  describe('UFC Shared Test Cases', () => {
    const testCases = testCasesByFileName<IAssignmentTestCase>(ASSIGNMENT_TEST_DATA_DIR);

    describe('Not obfuscated', () => {
      beforeAll(async () => {
        global.fetch = jest.fn(() => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
          });
        }) as jest.Mock;

        await initConfiguration(storage);
      });

      afterAll(() => {
        jest.restoreAllMocks();
      });

      it.each(Object.keys(testCases))('test variation assignment splits - %s', async (fileName) => {
        const { flag, variationType, defaultValue, subjects } = testCases[fileName];
        const client = new EppoClient({ flagConfigurationStore: storage });
        client.setIsGracefulFailureMode(false);

        let assignments: {
          subject: SubjectTestCase;
          assignment: string | boolean | number | null | object;
        }[] = [];

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBooleanAssignment.bind(client),
          [VariationType.NUMERIC]: client.getNumericAssignment.bind(client),
          [VariationType.INTEGER]: client.getIntegerAssignment.bind(client),
          [VariationType.STRING]: client.getStringAssignment.bind(client),
          [VariationType.JSON]: client.getJSONAssignment.bind(client),
        };

        const assignmentFn = typeAssignmentFunctions[variationType] as (
          flagKey: string,
          subjectKey: string,
          subjectAttributes: Record<string, AttributeType>,
          defaultValue: boolean | string | number | object,
        ) => never;
        if (!assignmentFn) {
          throw new Error(`Unknown variation type: ${variationType}`);
        }

        assignments = getTestAssignments(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
        );

        validateTestAssignments(assignments, flag);
      });
    });

    describe('Obfuscated', () => {
      beforeAll(async () => {
        global.fetch = jest.fn(() => {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(readMockUFCResponse(OBFUSCATED_MOCK_UFC_RESPONSE_FILE)),
          });
        }) as jest.Mock;

        await initConfiguration(storage);
      });

      afterAll(() => {
        jest.restoreAllMocks();
      });

      it.each(Object.keys(testCases))('test variation assignment splits - %s', async (fileName) => {
        const { flag, variationType, defaultValue, subjects } = testCases[fileName];
        const client = new EppoClient({ flagConfigurationStore: storage, isObfuscated: true });
        client.setIsGracefulFailureMode(false);

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBooleanAssignment.bind(client),
          [VariationType.NUMERIC]: client.getNumericAssignment.bind(client),
          [VariationType.INTEGER]: client.getIntegerAssignment.bind(client),
          [VariationType.STRING]: client.getStringAssignment.bind(client),
          [VariationType.JSON]: client.getJSONAssignment.bind(client),
        };

        const assignmentFn = typeAssignmentFunctions[variationType] as (
          flagKey: string,
          subjectKey: string,
          subjectAttributes: Record<string, AttributeType>,
          defaultValue: boolean | string | number | object,
        ) => never;
        if (!assignmentFn) {
          throw new Error(`Unknown variation type: ${variationType}`);
        }

        const assignments = getTestAssignments(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
        );

        validateTestAssignments(assignments, flag);
      });
    });
  });

  it('returns null if getStringAssignment was called for the subject before any UFC was loaded', () => {
    const localClient = new EppoClient({
      flagConfigurationStore: new MemoryOnlyConfigurationStore(),
    });
    expect(localClient.getStringAssignment(flagKey, 'subject-1', {}, 'hello world')).toEqual(
      'hello world',
    );
    expect(localClient.isInitialized()).toBe(false);
  });

  it('returns default value when key does not exist', async () => {
    const client = new EppoClient({ flagConfigurationStore: storage });

    const nonExistentFlag = 'non-existent-flag';

    expect(client.getBoolAssignment(nonExistentFlag, 'subject-identifier', {}, true)).toBe(true);
    expect(client.getBooleanAssignment(nonExistentFlag, 'subject-identifier', {}, true)).toBe(true);
    expect(client.getNumericAssignment(nonExistentFlag, 'subject-identifier', {}, 1)).toBe(1);
    expect(client.getJSONAssignment(nonExistentFlag, 'subject-identifier', {}, {})).toEqual({});
    expect(client.getStringAssignment(nonExistentFlag, 'subject-identifier', {}, 'default')).toBe(
      'default',
    );
  });

  it('logs variation assignment and experiment key', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient({ flagConfigurationStore: storage });
    client.setAssignmentLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      flagKey,
      'subject-10',
      subjectAttributes,
      'default',
    );

    expect(assignment).toEqual(variationA.value);
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

    const loggedAssignmentEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];
    expect(loggedAssignmentEvent.subject).toEqual('subject-10');
    expect(loggedAssignmentEvent.featureFlag).toEqual(flagKey);
    expect(loggedAssignmentEvent.experiment).toEqual(`${flagKey}-${mockFlag.allocations[0].key}`);
    expect(loggedAssignmentEvent.allocation).toEqual(mockFlag.allocations[0].key);
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient({ flagConfigurationStore: storage });
    client.setAssignmentLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      flagKey,
      'subject-10',
      subjectAttributes,
      'default',
    );

    expect(assignment).toEqual('variation-a');
  });

  it('exports flag configuration', () => {
    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient({ flagConfigurationStore: storage });
    expect(client.getFlagConfigurations()).toEqual({ [flagKey]: mockFlag });
  });

  describe('assignment logging deduplication', () => {
    let client: EppoClient;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();

      storage.setEntries({ [flagKey]: mockFlag });
      client = new EppoClient({ flagConfigurationStore: storage });
      client.setAssignmentLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', async () => {
      client.disableAssignmentCache();

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', async () => {
      client.useNonExpiringInMemoryAssignmentCache();
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', () => {
      client.useLRUInMemoryAssignmentCache(2);

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // logged
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cached

      client.getStringAssignment(flagKey, 'subject-11', {}, 'default'); // logged
      client.getStringAssignment(flagKey, 'subject-11', {}, 'default'); // cached

      client.getStringAssignment(flagKey, 'subject-12', {}, 'default'); // cache evicted subject-10, logged
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // previously evicted, logged
      client.getStringAssignment(flagKey, 'subject-12', {}, 'default'); // cached

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      client.setAssignmentLogger(mockLogger);

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // call count should be 2 because the first call had an exception
      // therefore we are not sure the logger was successful and try again.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs for each unique flag', async () => {
      await storage.setEntries({
        [flagKey]: mockFlag,
        'flag-2': {
          ...mockFlag,
          key: 'flag-2',
        },
        'flag-3': {
          ...mockFlag,
          key: 'flag-3',
        },
      });

      client.useNonExpiringInMemoryAssignmentCache();

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(3);
    });

    it('logs twice for the same flag when allocations change', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      storage.setEntries({
        [flagKey]: {
          ...mockFlag,

          allocations: [
            {
              key: 'allocation-a-2',
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'a',
                },
              ],
              doLog: true,
            },
          ],
        },
      });
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-a-3',
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'a',
                },
              ],
              doLog: true,
            },
          ],
        },
      });
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the variation
      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-a', // note: same key
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'b', // but different variation!
                },
              ],
              doLog: true,
            },
          ],
        },
      });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // important: log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the allocation
      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-b', // note: different key
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'b', // variation has been seen before
                },
              ],
              doLog: true,
            },
          ],
        },
      });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });
  });

  describe('Eppo Client constructed with configuration request parameters', () => {
    let client: EppoClient;
    let thisFlagStorage: IConfigurationStore<Flag | ObfuscatedFlag>;
    let requestConfiguration: FlagConfigurationRequestParameters;

    const flagKey = 'numeric_flag';
    const subject = 'alice';
    const pi = 3.1415926;

    const maxRetryDelay = DEFAULT_POLL_INTERVAL_MS * POLL_JITTER_PCT;

    beforeAll(async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
        });
      }) as jest.Mock;
    });

    beforeEach(async () => {
      requestConfiguration = {
        apiKey: 'dummy key',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      };

      thisFlagStorage = new MemoryOnlyConfigurationStore();

      // We only want to fake setTimeout() and clearTimeout()
      jest.useFakeTimers({
        advanceTimers: true,
        doNotFake: [
          'Date',
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
        ],
      });
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('Fetches initial configuration with parameters in constructor', async () => {
      client = new EppoClient({
        flagConfigurationStore: thisFlagStorage,
        configurationRequestParameters: requestConfiguration,
      });
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 123.4);
      expect(variation).toBe(123.4);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
    });

    it('Fetches initial configuration with parameters provided later', async () => {
      client = new EppoClient({ flagConfigurationStore: thisFlagStorage });
      client.setIsGracefulFailureMode(false);
      client.setConfigurationRequestParameters(requestConfiguration);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
    });

    describe('Poll after successful start', () => {
      it('Continues to poll when cache has not expired', async () => {
        class MockStore<T> extends MemoryOnlyConfigurationStore<T> {
          public static expired = false;

          async isExpired(): Promise<boolean> {
            return MockStore.expired;
          }
        }

        client = new EppoClient({
          flagConfigurationStore: new MockStore(),
          configurationRequestParameters: {
            ...requestConfiguration,
            pollAfterSuccessfulInitialization: true,
          },
        });
        client.setIsGracefulFailureMode(false);
        // no configuration loaded
        let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
        expect(variation).toBe(0.0);

        // have client fetch configurations; cache is not expired so assignment stays
        await client.fetchFlagConfigurations();
        variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
        expect(variation).toBe(0.0);

        // Expire the cache and advance time until a reload should happen
        MockStore.expired = true;
        await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS * 1.5);

        variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
        expect(variation).toBe(pi);
      });
    });
    it('Does not fetch configurations if the configuration store is unexpired', async () => {
      class MockStore<T> extends MemoryOnlyConfigurationStore<T> {
        async isExpired(): Promise<boolean> {
          return false;
        }
      }

      client = new EppoClient({
        flagConfigurationStore: new MockStore(),
        configurationRequestParameters: requestConfiguration,
      });
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
    });

    it.each([
      { pollAfterSuccessfulInitialization: false },
      { pollAfterSuccessfulInitialization: true },
    ])('retries initial configuration request with config %p', async (configModification) => {
      let callCount = 0;

      global.fetch = jest.fn(() => {
        if (++callCount === 1) {
          // Simulate an error for the first call
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error('Server error')),
          });
        } else {
          // Return a successful response for subsequent calls
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => {
              return readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
            },
          });
        }
      }) as jest.Mock;

      const { pollAfterSuccessfulInitialization } = configModification;
      requestConfiguration = {
        ...requestConfiguration,
        pollAfterSuccessfulInitialization,
      };
      client = new EppoClient({
        flagConfigurationStore: thisFlagStorage,
        configurationRequestParameters: requestConfiguration,
      });
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const fetchPromise = client.fetchFlagConfigurations();

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Await so it can finish its initialization before this test proceeds
      await fetchPromise;

      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
      expect(callCount).toBe(2);

      await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS);
      // By default, no more polling
      expect(callCount).toBe(pollAfterSuccessfulInitialization ? 3 : 2);
    });

    it.each([
      {
        pollAfterFailedInitialization: false,
        throwOnFailedInitialization: false,
      },
      { pollAfterFailedInitialization: false, throwOnFailedInitialization: true },
      { pollAfterFailedInitialization: true, throwOnFailedInitialization: false },
      { pollAfterFailedInitialization: true, throwOnFailedInitialization: true },
    ])('initial configuration request fails with config %p', async (configModification) => {
      let callCount = 0;

      global.fetch = jest.fn(() => {
        if (++callCount === 1) {
          // Simulate an error for the first call
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error('Server error')),
          } as Response);
        } else {
          // Return a successful response for subsequent calls
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
          } as Response);
        }
      });

      const { pollAfterFailedInitialization, throwOnFailedInitialization } = configModification;

      // Note: fake time does not play well with errors bubbled up after setTimeout (event loop,
      // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
      const numInitialRequestRetries = 0;

      requestConfiguration = {
        ...requestConfiguration,
        numInitialRequestRetries,
        throwOnFailedInitialization,
        pollAfterFailedInitialization,
      };
      client = new EppoClient({
        flagConfigurationStore: thisFlagStorage,
        configurationRequestParameters: requestConfiguration,
      });
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      expect(client.getNumericAssignment(flagKey, subject, {}, 0.0)).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      if (throwOnFailedInitialization) {
        await expect(client.fetchFlagConfigurations()).rejects.toThrow();
      } else {
        await expect(client.fetchFlagConfigurations()).resolves.toBeUndefined();
      }
      expect(callCount).toBe(1);
      // still no configuration loaded
      expect(client.getNumericAssignment(flagKey, subject, {}, 10.0)).toBe(10.0);

      // Advance timers so a post-init poll can take place
      await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS * 1.5);

      // if pollAfterFailedInitialization = true, we will poll later and get a config, otherwise not
      expect(callCount).toBe(pollAfterFailedInitialization ? 2 : 1);
      expect(client.getNumericAssignment(flagKey, subject, {}, 0.0)).toBe(
        pollAfterFailedInitialization ? pi : 0.0,
      );
    });
  });

  describe('flag overrides', () => {
    let client: EppoClient;
    let mockLogger: IAssignmentLogger;
    let overrideStore: IConfigurationStore<Variation>;

    beforeEach(() => {
      storage.setEntries({ [flagKey]: mockFlag });
      mockLogger = td.object<IAssignmentLogger>();
      overrideStore = new MemoryOnlyConfigurationStore<Variation>();
      client = new EppoClient({
        flagConfigurationStore: storage,
        overrideStore: overrideStore,
      });
      client.setAssignmentLogger(mockLogger);
      client.useNonExpiringInMemoryAssignmentCache();
    });

    it('returns override values for all supported types', () => {
      overrideStore.setEntries({
        'string-flag': {
          key: 'override-variation',
          value: 'override-string',
        },
        'boolean-flag': {
          key: 'override-variation',
          value: true,
        },
        'numeric-flag': {
          key: 'override-variation',
          value: 42.5,
        },
        'json-flag': {
          key: 'override-variation',
          value: '{"foo": "bar"}',
        },
      });

      expect(client.getStringAssignment('string-flag', 'subject-10', {}, 'default')).toBe(
        'override-string',
      );
      expect(client.getBooleanAssignment('boolean-flag', 'subject-10', {}, false)).toBe(true);
      expect(client.getNumericAssignment('numeric-flag', 'subject-10', {}, 0)).toBe(42.5);
      expect(client.getJSONAssignment('json-flag', 'subject-10', {}, {})).toEqual({ foo: 'bar' });
    });

    it('does not log assignments when override is applied', () => {
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);
    });

    it('includes override details in assignment details', () => {
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      const result = client.getStringAssignmentDetails(
        flagKey,
        'subject-10',
        { foo: 3 },
        'default',
      );

      expect(result).toMatchObject({
        variation: 'override-value',
        evaluationDetails: {
          flagEvaluationCode: 'MATCH',
          flagEvaluationDescription: 'Flag override applied',
        },
      });
    });

    it('does not update assignment cache when override is applied', () => {
      const mockAssignmentCache = td.object<AssignmentCache>();
      td.when(mockAssignmentCache.has(td.matchers.anything())).thenReturn(false);
      td.when(mockAssignmentCache.set(td.matchers.anything())).thenReturn();
      client.useCustomAssignmentCache(mockAssignmentCache);

      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      // First call with override
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // Verify cache was not used at all
      expect(td.explain(mockAssignmentCache.set).callCount).toBe(0);

      // Remove override
      overrideStore.setEntries({});

      // Second call without override
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // Now cache should be used
      expect(td.explain(mockAssignmentCache.set).callCount).toBe(1);
    });

    it('uses normal assignment when no override exists for flag', () => {
      // Set override for a different flag
      overrideStore.setEntries({
        'other-flag': {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      const result = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // Should get the normal assignment value from mockFlag
      expect(result).toBe(variationA.value);
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('uses normal assignment when no overrides store is configured', () => {
      // Create client without overrides store
      const clientWithoutOverrides = new EppoClient({
        flagConfigurationStore: storage,
      });
      clientWithoutOverrides.setAssignmentLogger(mockLogger);

      const result = clientWithoutOverrides.getStringAssignment(
        flagKey,
        'subject-10',
        {},
        'default',
      );

      // Should get the normal assignment value from mockFlag
      expect(result).toBe(variationA.value);
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('respects override after initial assignment without override', () => {
      // First call without override
      const initialAssignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(initialAssignment).toBe(variationA.value);
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);

      // Set override and make second call
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      const overriddenAssignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(overriddenAssignment).toBe('override-value');
      // No additional logging should occur when using override
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('reverts to normal assignment after removing override', () => {
      // Set initial override
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      const overriddenAssignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(overriddenAssignment).toBe('override-value');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);

      // Remove override and make second call
      overrideStore.setEntries({});

      const normalAssignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(normalAssignment).toBe(variationA.value);
      // Should log the normal assignment
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('reverts to normal assignment after unsetting overrides store', () => {
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      client.unsetOverrideStore();

      const normalAssignment = client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(normalAssignment).toBe(variationA.value);
    });

    it('returns a mapping of flag key to variation key for all active overrides', () => {
      overrideStore.setEntries({
        [flagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
        'other-flag': {
          key: 'other-variation',
          value: 'other-value',
        },
      });

      expect(client.getOverrideVariationKeys()).toEqual({
        [flagKey]: 'override-variation',
        'other-flag': 'other-variation',
      });
    });
  });
});
