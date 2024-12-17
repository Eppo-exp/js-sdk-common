import * as td from 'testdouble';

import {
  MOCK_PRECOMPUTED_WIRE_FILE,
  readMockConfigurationWireResponse,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IAssignmentLogger } from '../assignment-logger';
import { IPrecomputedConfigurationResponse } from '../configuration';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { DEFAULT_POLL_INTERVAL_MS, MAX_EVENT_QUEUE_SIZE, POLL_JITTER_PCT } from '../constants';
import FetchHttpClient from '../http-client';
import { FormatEnum, PrecomputedFlag, VariationType } from '../interfaces';
import { encodeBase64, getMD5Hash } from '../obfuscation';
import PrecomputedRequestor from '../precomputed-requestor';

import EppoPrecomputedClient, {
  PrecomputedFlagsRequestParameters,
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
  const storage = new MemoryOnlyConfigurationStore<PrecomputedFlag>();

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
    const precomputedFlagRequestor = new PrecomputedRequestor(httpClient, storage, 'subject-key', {
      'attribute-key': 'attribute-value',
    });
    await precomputedFlagRequestor.fetchAndStorePrecomputedFlags();
  });

  const precomputedFlagKey = 'mock-flag';
  const mockPrecomputedFlag: PrecomputedFlag = {
    flagKey: precomputedFlagKey,
    variationKey: 'a',
    variationValue: 'variation-a',
    allocationKey: 'allocation-a',
    doLog: true,
    variationType: VariationType.STRING,
    extraLogging: {},
  };

  describe('error encountered', () => {
    let client: EppoPrecomputedClient;

    beforeAll(() => {
      storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
      client = new EppoPrecomputedClient({ precomputedFlagStore: storage, isObfuscated: false });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns default value when flag not found', () => {
      expect(client.getStringAssignment('non-existent-flag', 'default')).toBe('default');
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoPrecomputedClient({
        precomputedFlagStore: storage,
        isObfuscated: false,
      });
      client.getStringAssignment(precomputedFlagKey, 'default-value');
      client.setAssignmentLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      // Subject not available because PrecomputedFlagsRequestParameters were not provided
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('');
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoPrecomputedClient({
        precomputedFlagStore: storage,
        isObfuscated: false,
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
        precomputedFlagStore: storage,
        isObfuscated: false,
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
      isObfuscated: false,
    });
    expect(localClient.getStringAssignment(precomputedFlagKey, 'hello world')).toEqual(
      'hello world',
    );
    expect(localClient.isInitialized()).toBe(false);
  });

  it('returns default value when key does not exist', async () => {
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      isObfuscated: false,
    });
    const nonExistentFlag = 'non-existent-flag';
    expect(client.getStringAssignment(nonExistentFlag, 'default')).toBe('default');
  });

  it('logs variation assignment with correct metadata', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      isObfuscated: false,
    });
    client.setAssignmentLogger(mockLogger);

    client.getStringAssignment(precomputedFlagKey, 'default');

    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    const loggedEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];

    expect(loggedEvent.featureFlag).toEqual(precomputedFlagKey);
    expect(loggedEvent.variation).toEqual(mockPrecomputedFlag.variationKey);
    expect(loggedEvent.allocation).toEqual(mockPrecomputedFlag.allocationKey);
    expect(loggedEvent.experiment).toEqual(
      `${precomputedFlagKey}-${mockPrecomputedFlag.allocationKey}`,
    );
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      isObfuscated: false,
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
      storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
      client = new EppoPrecomputedClient({
        precomputedFlagStore: storage,
        isObfuscated: false,
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
        [precomputedFlagKey]: mockPrecomputedFlag,
        'flag-2': {
          ...mockPrecomputedFlag,
          variationKey: 'b',
        },
        'flag-3': {
          ...mockPrecomputedFlag,
          variationKey: 'c',
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
        [precomputedFlagKey]: mockPrecomputedFlag,
        'flag-2': mockPrecomputedFlag,
        'flag-3': mockPrecomputedFlag,
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
        [precomputedFlagKey]: {
          ...mockPrecomputedFlag,
          variationKey: 'a',
          variationValue: 'variation-a',
        },
      });
      client.getStringAssignment(precomputedFlagKey, 'default');

      storage.setEntries({
        [precomputedFlagKey]: {
          ...mockPrecomputedFlag,
          variationKey: 'b',
          variationValue: 'variation-b',
        },
      });
      client.getStringAssignment(precomputedFlagKey, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });

      client.getStringAssignment(precomputedFlagKey, 'default'); // log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the variation
      storage.setEntries({
        [precomputedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: 'allocation-a', // same allocation key
          variationKey: 'b', // but different variation
          variationValue: 'variation-b', // but different variation
        },
      });

      client.getStringAssignment(precomputedFlagKey, 'default'); // log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });

      client.getStringAssignment(precomputedFlagKey, 'default'); // important: log this assignment
      client.getStringAssignment(precomputedFlagKey, 'default'); // cache hit, don't log

      // change the allocation
      storage.setEntries({
        [precomputedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: 'allocation-b', // different allocation key
          variationKey: 'b', // but same variation
          variationValue: 'variation-b', // but same variation
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
        precompute: {
          subjectKey: 'test-subject',
          subjectAttributes: { attr1: 'value1' },
        },
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
        precomputedFlagStore: precomputedFlagStore,
        isObfuscated: true,
      });
      client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
        precomputedFlagStore: precomputedFlagStore,
        isObfuscated: true,
      });
      client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
          isObfuscated: true,
        });
        client.setSubjectAndPrecomputedFlagsRequestParameters({
          ...requestParameters,
          pollAfterSuccessfulInitialization: true,
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
        isObfuscated: false,
      });
      client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
          isObfuscated: true,
        });
        client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
        isObfuscated: true,
      });
      client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
        isObfuscated: true,
      });
      client.setSubjectAndPrecomputedFlagsRequestParameters(requestParameters);
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
    it('returns decoded variation value', () => {
      const salt = 'sodium-chloride';
      const saltedAndHashedFlagKey = getMD5Hash(precomputedFlagKey, salt);

      storage.setEntries({
        [saltedAndHashedFlagKey]: {
          ...mockPrecomputedFlag,
          allocationKey: encodeBase64(mockPrecomputedFlag.allocationKey),
          variationKey: encodeBase64(mockPrecomputedFlag.variationKey),
          variationValue: encodeBase64(mockPrecomputedFlag.variationValue),
          extraLogging: {},
        },
      });

      const client = new EppoPrecomputedClient({
        precomputedFlagStore: storage,
        isObfuscated: true,
      });
      client.setSubjectSaltAndPrecomputedFlagStore(
        'test-subject',
        { attr1: 'value1' },
        salt,
        storage,
      );

      expect(client.getStringAssignment(precomputedFlagKey, 'default')).toBe(
        mockPrecomputedFlag.variationValue,
      );

      td.reset();
    });
  });

  it('logs variation assignment with format from precomputed flags response', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    storage.setEntries({ [precomputedFlagKey]: mockPrecomputedFlag });
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: storage,
      isObfuscated: false,
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
      client = new EppoPrecomputedClient({
        precomputedFlagStore: store,
        isObfuscated: false,
      });
      client.setAssignmentLogger(mockLogger);
    });

    it('returns default value and does not log when store is not initialized', () => {
      client.setSubjectSaltAndPrecomputedFlagStore(
        'test-subject',
        {},
        'sodiumchloride',
        store,
      );
      expect(client.getStringAssignment('test-flag', 'default')).toBe('default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
    });

    it('returns assignment and logs subject data after store is initialized with flags', async () => {
      const subjectKey = 'test-subject';
      const subjectAttributes = { attr1: 'value1' };

      await store.setEntries({
        'test-flag': {
          flagKey: precomputedFlagKey,
          variationType: VariationType.STRING,
          variationKey: 'control',
          variationValue: 'test-value',
          allocationKey: 'allocation-1',
          doLog: true,
          extraLogging: {},
        },
      });
      client.setSubjectSaltAndPrecomputedFlagStore(
        subjectKey,
        subjectAttributes,
        encodeBase64('sodium-chloride'),
        store,
      );
      expect(client.getStringAssignment('test-flag', 'default')).toBe('test-value');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      const loggedEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];
      expect(loggedEvent.subject).toEqual(subjectKey);
      expect(loggedEvent.subjectAttributes).toEqual(subjectAttributes);
    });

    it('returns default value and does not log when subject data is not set', () => {
      expect(client.getStringAssignment('test-flag', 'default')).toBe('default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
    });
  });
});
