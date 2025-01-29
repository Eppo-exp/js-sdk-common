import * as td from 'testdouble';

import {
  MOCK_PRECOMPUTED_WIRE_FILE,
  readMockConfigurationWireResponse,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentLogger } from '../assignment-logger';
import {
  ensureContextualSubjectAttributes,
  ensureNonContextualSubjectAttributes,
} from '../attributes';
import { IPrecomputedConfigurationResponse } from '../configuration';
import { IConfigurationStore, ISyncStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { DEFAULT_POLL_INTERVAL_MS, MAX_EVENT_QUEUE_SIZE, POLL_JITTER_PCT } from '../constants';
import FetchHttpClient from '../http-client';
import {
  FormatEnum,
  IObfuscatedPrecomputedBandit,
  PrecomputedFlag,
  Variation,
  VariationType,
} from '../interfaces';
import { decodeBase64, encodeBase64, getMD5Hash } from '../obfuscation';
import PrecomputedRequestor from '../precomputed-requestor';

import EppoPrecomputedClient, {
  PrecomputedFlagsRequestParameters,
  Subject,
} from './eppo-precomputed-client';

describe('EppoPrecomputedClient E2E test', () => {
  const precomputedConfigurationWire = readMockConfigurationWireResponse(
    MOCK_PRECOMPUTED_WIRE_FILE,
  );
  const unparsedPrecomputedResponse = JSON.parse(precomputedConfigurationWire).precomputed.response;
  const precomputedResponse: IPrecomputedConfigurationResponse = JSON.parse(
    unparsedPrecomputedResponse,
  );

  global.fetch = jest.fn(() => {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(precomputedResponse),
    });
  }) as jest.Mock;
  let storage = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
  const subject: Subject = {
    subjectKey: 'test-subject',
    subjectAttributes: { attr1: 'value1' },
  };
  beforeEach(async () => {
    storage = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
    storage.setFormat(FormatEnum.PRECOMPUTED);
  });

  beforeAll(async () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '3.0.0',
      },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, 1000);
    const precomputedFlagRequestor = new PrecomputedRequestor(
      httpClient,
      storage,
      'subject-key',
      ensureContextualSubjectAttributes({
        'attribute-key': 'attribute-value',
      }),
    );
    await precomputedFlagRequestor.fetchAndStorePrecomputedFlags();
  });

  const precomputedFlagKey = 'mock-flag';
  const hashedPrecomputedFlagKey = getMD5Hash(precomputedFlagKey);
  const hashedFlag2 = getMD5Hash('flag-2');
  const hashedFlag3 = getMD5Hash('flag-3');

  const mockPrecomputedFlag: PrecomputedFlag = {
    flagKey: hashedPrecomputedFlagKey,
    variationKey: encodeBase64('a'),
    variationValue: encodeBase64('variation-a'),
    allocationKey: encodeBase64('allocation-a'),
    doLog: true,
    variationType: VariationType.STRING,
    extraLogging: {},
  };

  describe('error encountered', () => {
    let client: EppoPrecomputedClient;

    beforeAll(() => {
      storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
      client = new EppoPrecomputedClient({ precomputedFlagStore: storage, subject });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns default value when flag not found', () => {
      expect(client.getStringAssignment('non-existent-flag', 'default')).toBe('default');
    });
  });

  describe('setLogger', () => {
    let flagStorage: IConfigurationStore<PrecomputedFlag>;
    let subject: Subject;
    beforeAll(() => {
      flagStorage = new MemoryOnlyConfigurationStore();
      flagStorage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
      subject = {
        subjectKey: 'test-subject',
        subjectAttributes: { attr1: 'value1' },
      };
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoPrecomputedClient({
        precomputedFlagStore: flagStorage,
        subject,
      });
      client.getStringAssignment(precomputedFlagKey, 'default-value');
      client.setAssignmentLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoPrecomputedClient({
        precomputedFlagStore: flagStorage,
        subject,
      });

      client.getStringAssignment(precomputedFlagKey, 'default-value');
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoPrecomputedClient({
        precomputedFlagStore: flagStorage,
        subject,
      });

      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE + 100; i++) {
        client.getStringAssignment(precomputedFlagKey, 'default-value');
      }
      client.setAssignmentLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  it('returns null if getStringAssignment was called for the subject before any precomputed flags were loaded', () => {
    const localClient = new EppoPrecomputedClient({
      precomputedFlagStore: new MemoryOnlyConfigurationStore(),
      subject,
    });
    expect(localClient.getStringAssignment(precomputedFlagKey, 'hello world')).toEqual(
      'hello world',
    );
    expect(localClient.isInitialized()).toBe(false);
  });

  it('returns default value when key does not exist', async () => {
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      subject,
    });
    const nonExistentFlag = 'non-existent-flag';
    expect(client.getStringAssignment(nonExistentFlag, 'default')).toBe('default');
  });

  it('logs variation assignment with correct metadata', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      subject,
    });
    client.setAssignmentLogger(mockLogger);

    client.getStringAssignment(precomputedFlagKey, 'default');

    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    const loggedEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];

    expect(loggedEvent.featureFlag).toEqual(precomputedFlagKey);
    expect(loggedEvent.variation).toEqual(decodeBase64(mockPrecomputedFlag.variationKey ?? ''));
    expect(loggedEvent.allocation).toEqual(decodeBase64(mockPrecomputedFlag.allocationKey ?? ''));
    expect(loggedEvent.experiment).toEqual(
      `${precomputedFlagKey}-${decodeBase64(mockPrecomputedFlag.allocationKey ?? '')}`,
    );
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      subject,
    });
    client.setAssignmentLogger(mockLogger);

    const assignment = client.getStringAssignment(precomputedFlagKey, 'default');

    expect(assignment).toEqual('variation-a');
  });

  describe('assignment logging deduplication', () => {
    let client: EppoPrecomputedClient;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();
      storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
      client = new EppoPrecomputedClient({
        precomputedFlagStore: storage,
        subject,
      });
      client.setAssignmentLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', async () => {
      client.disableAssignmentCache();

      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment(precomputedFlagKey, 'default');

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', async () => {
      client.useNonExpiringInMemoryAssignmentCache();
      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment(precomputedFlagKey, 'default');
      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', async () => {
      await storage.setEntries({
        [hashedPrecomputedFlagKey]: mockPrecomputedFlag,
        [hashedFlag2]: {
          ...mockPrecomputedFlag,
          variationKey: encodeBase64('b'),
        },
        [hashedFlag3]: {
          ...mockPrecomputedFlag,
          variationKey: encodeBase64('c'),
        },
      });

      client.useLRUInMemoryAssignmentCache(2);

      client.getStringAssignment(precomputedFlagKey, 'default'); // logged
      client.getStringAssignment(precomputedFlagKey, 'default'); // cached
      client.getStringAssignment('flag-2', 'default'); // logged
      client.getStringAssignment('flag-2', 'default'); // cached
      client.getStringAssignment('flag-3', 'default'); // logged
      client.getStringAssignment('flag-3', 'default'); // cached
      client.getStringAssignment(precomputedFlagKey, 'default'); // logged
      client.getStringAssignment('flag-2', 'default'); // logged
      client.getStringAssignment('flag-3', 'default'); // logged

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(6);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      client.setAssignmentLogger(mockLogger);

      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment(precomputedFlagKey, 'default');

      // call count should be 2 because the first call had an exception
      // therefore we are not sure the logger was successful and try again.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs for each unique flag', async () => {
      await storage.setEntries({
        [hashedPrecomputedFlagKey]: mockPrecomputedFlag,
        [hashedFlag2]: mockPrecomputedFlag,
        [hashedFlag3]: mockPrecomputedFlag,
      });

      client.useNonExpiringInMemoryAssignmentCache();

      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment('flag-2', 'default');
      client.getStringAssignment('flag-2', 'default');
      client.getStringAssignment('flag-3', 'default');
      client.getStringAssignment('flag-3', 'default');
      client.getStringAssignment(precomputedFlagKey, 'default');
      client.getStringAssignment('flag-2', 'default');
      client.getStringAssignment('flag-3', 'default');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(3);
    });

    it('logs twice for the same flag when variation change', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      storage.setEntries({
        [hashedPrecomputedFlagKey]: {
          ...mockPrecomputedFlag,
          variationKey: encodeBase64('a'),
          variationValue: encodeBase64('variation-a'),
        },
      });
      client.getStringAssignment(precomputedFlagKey, 'default');

      storage.setEntries({
        [hashedPrecomputedFlagKey]: {
          ...mockPrecomputedFlag,
          variationKey: encodeBase64('b'),
          variationValue: encodeBase64('variation-b'),
        },
      });
      client.getStringAssignment(precomputedFlagKey, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });

      client.getStringAssignment(precomputedFlagKey, 'default'); // log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the variation
      storage.setEntries({
        [hashedPrecomputedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: encodeBase64('allocation-a'), // same allocation key
          variationKey: encodeBase64('b'), // but different variation
          variationValue: encodeBase64('variation-b'), // but different variation
        },
      });

      client.getStringAssignment(precomputedFlagKey, 'default'); // log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });

      client.getStringAssignment(precomputedFlagKey, 'default'); // important: log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the allocation
      storage.setEntries({
        [hashedPrecomputedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: encodeBase64('allocation-b'), // different allocation key
          variationKey: encodeBase64('b'), // but same variation
          variationValue: encodeBase64('variation-b'), // but same variation
        },
      });

      client.getStringAssignment(precomputedFlagKey, 'default'); // log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });
  });

  describe('Eppo Precomputed Client constructed with configuration request parameters', () => {
    let client: EppoPrecomputedClient;
    let precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
    let subject: Subject;
    let requestParameters: PrecomputedFlagsRequestParameters;

    const precomputedFlagKey = 'string-flag';
    const red = 'red';

    const maxRetryDelay = DEFAULT_POLL_INTERVAL_MS * POLL_JITTER_PCT;

    beforeAll(async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(precomputedResponse),
        });
      }) as jest.Mock;
    });

    beforeEach(async () => {
      requestParameters = {
        apiKey: 'dummy-key',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      };

      subject = {
        subjectKey: 'test-subject',
        subjectAttributes: { attr1: 'value1' },
      };

      precomputedFlagStore = new MemoryOnlyConfigurationStore();

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
      client = new EppoPrecomputedClient({
        precomputedFlagStore,
        subject,
        requestParameters,
      });
      // no configuration loaded
      let variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe('default');
      // have client fetch configurations
      await client.fetchPrecomputedFlags();
      variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe(red);
    });

    it('Fetches initial configuration with parameters provided later', async () => {
      client = new EppoPrecomputedClient({
        precomputedFlagStore,
        subject,
        requestParameters,
      });
      // no configuration loaded
      let variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe('default');
      // have client fetch configurations
      await client.fetchPrecomputedFlags();
      variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe(red);
    });

    describe('Poll after successful start', () => {
      it('Continues to poll when cache has not expired', async () => {
        class MockStore<T> extends MemoryOnlyConfigurationStore<T> {
          public static expired = false;

          async isExpired(): Promise<boolean> {
            return MockStore.expired;
          }
        }

        client = new EppoPrecomputedClient({
          precomputedFlagStore: new MockStore(),
          subject,
          requestParameters: {
            ...requestParameters,
            pollAfterSuccessfulInitialization: true,
          },
        });
        // no configuration loaded
        let variation = client.getStringAssignment(precomputedFlagKey, 'default');
        expect(variation).toBe('default');

        // have client fetch configurations; cache is not expired so assignment stays
        await client.fetchPrecomputedFlags();
        variation = client.getStringAssignment(precomputedFlagKey, 'default');
        expect(variation).toBe('default');

        // Expire the cache and advance time until a reload should happen
        MockStore.expired = true;
        await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS * 1.5);

        variation = client.getStringAssignment(precomputedFlagKey, 'default');
        expect(variation).toBe(red);
      });
    });

    it('Does not fetch configurations if the configuration store is unexpired', async () => {
      class MockStore<T> extends MemoryOnlyConfigurationStore<T> {
        async isExpired(): Promise<boolean> {
          return false;
        }
      }
      client = new EppoPrecomputedClient({
        precomputedFlagStore: new MockStore(),
        subject,
        requestParameters,
      });
      // no configuration loaded
      let variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe('default');
      // have client fetch configurations
      await client.fetchPrecomputedFlags();
      variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe('default');
    });

    describe('Gets typed assignments', () => {
      let client: EppoPrecomputedClient;

      beforeEach(async () => {
        client = new EppoPrecomputedClient({
          precomputedFlagStore: storage,
          subject,
          requestParameters,
        });
        await client.fetchPrecomputedFlags();
      });

      it('returns string assignment', () => {
        expect(client.getStringAssignment('string-flag', 'default')).toBe('red');
        expect(client.getStringAssignment('non-existent', 'default')).toBe('default');
      });

      it('returns boolean assignment', () => {
        expect(client.getBooleanAssignment('boolean-flag', false)).toBe(true);
        expect(client.getBooleanAssignment('non-existent', false)).toBe(false);
      });

      it('returns integer assignment', () => {
        expect(client.getIntegerAssignment('integer-flag', 0)).toBe(42);
        expect(client.getIntegerAssignment('non-existent', 0)).toBe(0);
      });

      it('returns numeric assignment', () => {
        expect(client.getNumericAssignment('numeric-flag', 0)).toBe(3.14);
        expect(client.getNumericAssignment('non-existent', 0)).toBe(0);
      });

      it('returns JSON assignment', () => {
        expect(client.getJSONAssignment('json-flag', {})).toEqual({
          key: 'value',
          number: 123,
        });
        expect(client.getJSONAssignment('non-existent', {})).toEqual({});
      });

      it('returns default value when type mismatches', () => {
        // Try to get a string value from a boolean flag
        expect(client.getStringAssignment('boolean-flag', 'default')).toBe('default');
        // Try to get a boolean value from a string flag
        expect(client.getBooleanAssignment('string-flag', false)).toBe(false);
      });
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
              return precomputedResponse;
            },
          });
        }
      }) as jest.Mock;

      const { pollAfterSuccessfulInitialization } = configModification;
      requestParameters = {
        ...requestParameters,
        pollAfterSuccessfulInitialization,
      };
      client = new EppoPrecomputedClient({
        precomputedFlagStore: precomputedFlagStore,
        requestParameters,
        subject,
      });
      // no configuration loaded
      let variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe('default');

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const fetchPromise = client.fetchPrecomputedFlags();

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Await so it can finish its initialization before this test proceeds
      await fetchPromise;

      variation = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(variation).toBe(red);
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
            json: () => Promise.resolve(precomputedResponse),
          } as Response);
        }
      });

      const { pollAfterFailedInitialization, throwOnFailedInitialization } = configModification;

      // Note: fake time does not play well with errors bubbled up after setTimeout (event loop,
      // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
      const numInitialRequestRetries = 0;

      requestParameters = {
        ...requestParameters,
        numInitialRequestRetries,
        throwOnFailedInitialization,
        pollAfterFailedInitialization,
      };
      client = new EppoPrecomputedClient({
        precomputedFlagStore: precomputedFlagStore,
        subject,
        requestParameters,
      });
      // no configuration loaded
      expect(client.getStringAssignment(precomputedFlagKey, 'default')).toBe('default');

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      if (throwOnFailedInitialization) {
        await expect(client.fetchPrecomputedFlags()).rejects.toThrow();
      } else {
        await expect(client.fetchPrecomputedFlags()).resolves.toBeUndefined();
      }
      expect(callCount).toBe(1);
      // still no configuration loaded
      expect(client.getStringAssignment(precomputedFlagKey, 'default')).toBe('default');

      // Advance timers so a post-init poll can take place
      await jest.advanceTimersByTimeAsync(DEFAULT_POLL_INTERVAL_MS * 1.5);

      // if pollAfterFailedInitialization = true, we will poll later and get a config, otherwise not
      expect(callCount).toBe(pollAfterFailedInitialization ? 2 : 1);
      expect(client.getStringAssignment(precomputedFlagKey, 'default')).toBe(
        pollAfterFailedInitialization ? red : 'default',
      );
    });
  });

  describe('Obfuscated precomputed flags', () => {
    let precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
    beforeEach(() => {
      precomputedFlagStore = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
    });

    it('returns decoded variation value', () => {
      const salt = 'NaCl';
      const saltedAndHashedFlagKey = getMD5Hash(precomputedFlagKey, salt);

      precomputedFlagStore.setEntries({
        [saltedAndHashedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: encodeBase64(mockPrecomputedFlag.allocationKey ?? ''),
          variationKey: encodeBase64(mockPrecomputedFlag.variationKey ?? ''),
          variationValue: encodeBase64(mockPrecomputedFlag.variationValue),
          extraLogging: {},
        },
      });
      precomputedFlagStore.salt = salt;

      const client = new EppoPrecomputedClient({
        precomputedFlagStore,
        subject,
      });

      expect(client.getStringAssignment(precomputedFlagKey, 'default')).toBe(
        mockPrecomputedFlag.variationValue,
      );

      td.reset();
    });
  });

  it('logs variation assignment with format from precomputed flags response', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    storage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      subject,
    });
    client.setAssignmentLogger(mockLogger);

    client.getStringAssignment(precomputedFlagKey, 'default');

    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    const loggedEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];

    expect(loggedEvent.format).toEqual(FormatEnum.PRECOMPUTED);
  });

  describe('EppoPrecomputedClient subject data and store initialization', () => {
    let client: EppoPrecomputedClient;
    let store: IConfigurationStore<PrecomputedFlag>;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      store = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
      mockLogger = td.object<IAssignmentLogger>();
    });

    it('prints errors if initialized with a store that is not initialized and without requestParameters', () => {
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      expect(() => {
        client = new EppoPrecomputedClient({
          precomputedFlagStore: store,
          subject,
        });
      }).not.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(2);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[Eppo SDK] EppoPrecomputedClient requires an initialized precomputedFlagStore if requestParameters are not provided',
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[Eppo SDK] EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided',
      );
      loggerErrorSpy.mockRestore();
      expect(client.getStringAssignment('string-flag', 'default')).toBe('default');
    });

    it('prints only one error if initialized with a store without a salt and without requestParameters', async () => {
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      await store.setEntries({
        'test-flag': {
          flagKey: 'test-flag',
          variationType: VariationType.STRING,
          variationKey: encodeBase64('control'),
          variationValue: encodeBase64('test-value'),
          allocationKey: encodeBase64('allocation-1'),
          doLog: true,
          extraLogging: {},
        },
      });
      expect(() => {
        client = new EppoPrecomputedClient({
          precomputedFlagStore: store,
          subject,
        });
      }).not.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[Eppo SDK] EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided',
      );
      loggerErrorSpy.mockRestore();
      expect(client.getStringAssignment('string-flag', 'default')).toBe('default');
    });

    it('returns assignment and logs subject data after store is initialized with flags', async () => {
      const subjectKey = 'test-subject';
      const subjectAttributes = ensureContextualSubjectAttributes({ attr1: 'value1' });
      store.salt = 'test-salt';
      const hashedFlagKey = getMD5Hash('test-flag', store.salt);

      await store.setEntries({
        [hashedFlagKey]: {
          flagKey: hashedFlagKey,
          variationType: VariationType.STRING,
          variationKey: encodeBase64('control'),
          variationValue: encodeBase64('test-value'),
          allocationKey: encodeBase64('allocation-1'),
          doLog: true,
          extraLogging: {},
        },
      });

      client = new EppoPrecomputedClient({
        precomputedFlagStore: store,
        subject,
      });
      client.setAssignmentLogger(mockLogger);

      expect(client.getStringAssignment('test-flag', 'default')).toBe('test-value');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      const loggedEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];
      expect(loggedEvent.subject).toEqual(subjectKey);

      // Convert the ContextAttributes to a flat attribute map
      expect(loggedEvent.subjectAttributes).toEqual(
        ensureNonContextualSubjectAttributes(subjectAttributes),
      );
    });
  });
});

describe('Precomputed Bandit Store', () => {
  let precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  let precomputedBanditStore: IConfigurationStore<IObfuscatedPrecomputedBandit>;
  let subject: Subject;

  beforeEach(() => {
    precomputedFlagStore = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
    precomputedBanditStore = new MemoryOnlyConfigurationStore<IObfuscatedPrecomputedBandit>();
    subject = {
      subjectKey: 'test-subject',
      subjectAttributes: { attr1: 'value1' },
    };
  });

  it('prints errors if initialized with a bandit store that is not initialized and without requestParameters', () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error');
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    new EppoPrecomputedClient({
      precomputedFlagStore,
      precomputedBanditStore,
      subject,
    });

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[Eppo SDK] EppoPrecomputedClient requires an initialized precomputedFlagStore if requestParameters are not provided',
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[Eppo SDK] EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided',
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[Eppo SDK] Passing banditOptions without requestParameters requires an initialized precomputedBanditStore',
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[Eppo SDK] EppoPrecomputedClient missing or empty salt for precomputedBanditStore',
    );

    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('prints only salt-related errors if stores are initialized but missing salts', async () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error');
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    await precomputedFlagStore.setEntries({
      'test-flag': {
        flagKey: 'test-flag',
        variationType: VariationType.STRING,
        variationKey: encodeBase64('control'),
        variationValue: encodeBase64('test-value'),
        allocationKey: encodeBase64('allocation-1'),
        doLog: true,
        extraLogging: {},
      },
    });

    await precomputedBanditStore.setEntries({
      'test-bandit': {
        banditKey: encodeBase64('test-bandit'),
        action: encodeBase64('action1'),
        modelVersion: encodeBase64('v1'),
        actionProbability: 0.5,
        optimalityGap: 0.1,
        actionNumericAttributes: {
          [encodeBase64('attr1')]: encodeBase64('1.0'),
        },
        actionCategoricalAttributes: {
          [encodeBase64('attr2')]: encodeBase64('value2'),
        },
      },
    });

    new EppoPrecomputedClient({
      precomputedFlagStore,
      precomputedBanditStore,
      subject,
    });

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      '[Eppo SDK] EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided',
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      '[Eppo SDK] EppoPrecomputedClient missing or empty salt for precomputedBanditStore',
    );

    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('initializes correctly with both stores having salts', async () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error');
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    precomputedFlagStore.salt = 'flag-salt';
    precomputedBanditStore.salt = 'bandit-salt';

    await precomputedFlagStore.setEntries({
      'test-flag': {
        flagKey: 'test-flag',
        variationType: VariationType.STRING,
        variationKey: encodeBase64('control'),
        variationValue: encodeBase64('test-value'),
        allocationKey: encodeBase64('allocation-1'),
        doLog: true,
        extraLogging: {},
      },
    });

    await precomputedBanditStore.setEntries({
      'test-bandit': {
        banditKey: encodeBase64('test-bandit'),
        action: encodeBase64('action1'),
        modelVersion: encodeBase64('v1'),
        actionProbability: 0.5,
        optimalityGap: 0.1,
        actionNumericAttributes: {
          [encodeBase64('attr1')]: encodeBase64('1.0'),
        },
        actionCategoricalAttributes: {
          [encodeBase64('attr2')]: encodeBase64('value2'),
        },
      },
    });

    new EppoPrecomputedClient({
      precomputedFlagStore,
      precomputedBanditStore,
      subject,
    });

    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();

    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('allows initialization without bandit store', async () => {
    const loggerErrorSpy = jest.spyOn(logger, 'error');
    const loggerWarnSpy = jest.spyOn(logger, 'warn');

    precomputedFlagStore.salt = 'flag-salt';

    await precomputedFlagStore.setEntries({
      'test-flag': {
        flagKey: 'test-flag',
        variationType: VariationType.STRING,
        variationKey: encodeBase64('control'),
        variationValue: encodeBase64('test-value'),
        allocationKey: encodeBase64('allocation-1'),
        doLog: true,
        extraLogging: {},
      },
    });

    new EppoPrecomputedClient({
      precomputedFlagStore,
      subject,
    });

    expect(loggerErrorSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();

    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });
});

describe('flag overrides', () => {
  let client: EppoPrecomputedClient;
  let mockLogger: IAssignmentLogger;
  let overridesStore: ISyncStore<Variation>;
  let flagStorage: IConfigurationStore<PrecomputedFlag>;
  let subject: Subject;

  const precomputedFlagKey = 'mock-flag';
  const hashedPrecomputedFlagKey = getMD5Hash(precomputedFlagKey);

  const mockPrecomputedFlag: PrecomputedFlag = {
    flagKey: hashedPrecomputedFlagKey,
    variationKey: encodeBase64('a'),
    variationValue: encodeBase64('variation-a'),
    allocationKey: encodeBase64('allocation-a'),
    doLog: true,
    variationType: VariationType.STRING,
    extraLogging: {},
  };

  beforeEach(() => {
    flagStorage = new MemoryOnlyConfigurationStore();
    flagStorage.setEntries({ [hashedPrecomputedFlagKey]: mockPrecomputedFlag });
    mockLogger = td.object<IAssignmentLogger>();
    overridesStore = new MemoryOnlyConfigurationStore<Variation>();
    subject = {
      subjectKey: 'test-subject',
      subjectAttributes: { attr1: 'value1' },
    };

    client = new EppoPrecomputedClient({
      precomputedFlagStore: flagStorage,
      subject,
      overridesStore,
    });
    client.setAssignmentLogger(mockLogger);
  });

  it('returns override values for all supported types', () => {
    overridesStore.setEntries({
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

    expect(client.getStringAssignment('string-flag', 'default')).toBe('override-string');
    expect(client.getBooleanAssignment('boolean-flag', false)).toBe(true);
    expect(client.getNumericAssignment('numeric-flag', 0)).toBe(42.5);
    expect(client.getJSONAssignment('json-flag', {})).toEqual({ foo: 'bar' });
  });

  it('does not log assignments when override is applied', () => {
    overridesStore.setEntries({
      [precomputedFlagKey]: {
        key: 'override-variation',
        value: 'override-value',
      },
    });

    client.getStringAssignment(precomputedFlagKey, 'default');

    expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);
  });

  it('uses normal assignment when no override exists for flag', () => {
    // Set override for a different flag
    overridesStore.setEntries({
      'other-flag': {
        key: 'override-variation',
        value: 'override-value',
      },
    });

    const result = client.getStringAssignment(precomputedFlagKey, 'default');

    // Should get the normal assignment value from mockPrecomputedFlag
    expect(result).toBe('variation-a');
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
  });

  it('uses normal assignment when no overrides store is configured', () => {
    // Create client without overrides store
    const clientWithoutOverrides = new EppoPrecomputedClient({
      precomputedFlagStore: flagStorage,
      subject,
    });
    clientWithoutOverrides.setAssignmentLogger(mockLogger);

    const result = clientWithoutOverrides.getStringAssignment(precomputedFlagKey, 'default');

    // Should get the normal assignment value from mockPrecomputedFlag
    expect(result).toBe('variation-a');
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
  });

  it('respects override after initial assignment without override', () => {
    // First call without override
    const initialAssignment = client.getStringAssignment(precomputedFlagKey, 'default');
    expect(initialAssignment).toBe('variation-a');
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);

    // Set override and make second call
    overridesStore.setEntries({
      [precomputedFlagKey]: {
        key: 'override-variation',
        value: 'override-value',
      },
    });

    const overriddenAssignment = client.getStringAssignment(precomputedFlagKey, 'default');
    expect(overriddenAssignment).toBe('override-value');
    // No additional logging should occur when using override
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
  });

  it('reverts to normal assignment after removing override', () => {
    // Set initial override
    overridesStore.setEntries({
      [precomputedFlagKey]: {
        key: 'override-variation',
        value: 'override-value',
      },
    });

    const overriddenAssignment = client.getStringAssignment(precomputedFlagKey, 'default');
    expect(overriddenAssignment).toBe('override-value');
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);

    // Remove override and make second call
    overridesStore.setEntries({});

    const normalAssignment = client.getStringAssignment(precomputedFlagKey, 'default');
    expect(normalAssignment).toBe('variation-a');
    // Should log the normal assignment
    expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
  });

  describe('setOverridesStore', () => {
    it('applies overrides after setting store', () => {
      // Create client without overrides store
      const clientWithoutOverrides = new EppoPrecomputedClient({
        precomputedFlagStore: flagStorage,
        subject,
      });
      clientWithoutOverrides.setAssignmentLogger(mockLogger);

      // Initial call without override store
      const initialAssignment = clientWithoutOverrides.getStringAssignment(
        precomputedFlagKey,
        'default',
      );
      expect(initialAssignment).toBe('variation-a');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);

      // Set overrides store with override
      overridesStore.setEntries({
        [precomputedFlagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });
      clientWithoutOverrides.setOverridesStore(overridesStore);

      // Call after setting override store
      const overriddenAssignment = clientWithoutOverrides.getStringAssignment(
        precomputedFlagKey,
        'default',
      );
      expect(overriddenAssignment).toBe('override-value');
      // No additional logging should occur when using override
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('reverts to normal assignment after unsetting store', () => {
      // Set initial override
      overridesStore.setEntries({
        [precomputedFlagKey]: {
          key: 'override-variation',
          value: 'override-value',
        },
      });

      client.getStringAssignment(precomputedFlagKey, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);

      // Unset overrides store
      client.unsetOverridesStore();

      const normalAssignment = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(normalAssignment).toBe('variation-a');
      // Should log the normal assignment
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(1);
    });

    it('switches between different override stores', () => {
      // Create a second override store
      const secondOverridesStore = new MemoryOnlyConfigurationStore<Variation>();

      // Set up different overrides in each store
      overridesStore.setEntries({
        [precomputedFlagKey]: {
          key: 'override-1',
          value: 'value-1',
        },
      });

      secondOverridesStore.setEntries({
        [precomputedFlagKey]: {
          key: 'override-2',
          value: 'value-2',
        },
      });

      // Start with first override store
      const firstOverride = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(firstOverride).toBe('value-1');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);

      // Switch to second override store
      client.setOverridesStore(secondOverridesStore);
      const secondOverride = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(secondOverride).toBe('value-2');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);

      // Switch back to first override store
      client.setOverridesStore(overridesStore);
      const backToFirst = client.getStringAssignment(precomputedFlagKey, 'default');
      expect(backToFirst).toBe('value-1');
      expect(td.explain(mockLogger.logAssignment).callCount).toBe(0);
    });
  });
});
