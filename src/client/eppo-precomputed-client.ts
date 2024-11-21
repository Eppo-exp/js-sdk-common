import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import {
  AssignmentCache,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../cache/abstract-assignment-cache';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  MAX_EVENT_QUEUE_SIZE,
} from '../constants';
import { decodePrecomputedFlag } from '../decoding';
import { FlagEvaluationWithoutDetails } from '../evaluator';
import FetchHttpClient from '../http-client';
import { PrecomputedFlag } from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import PrecomputedRequestor from '../precomputed-requestor';
import { Attributes } from '../types';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';

export type PrecomputedFlagsRequestParameters = {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
  baseUrl?: string;
  precompute: {
    subjectKey: string;
    subjectAttributes: Attributes;
  };
  requestTimeoutMs?: number;
  pollingIntervalMs?: number;
  numInitialRequestRetries?: number;
  numPollRequestRetries?: number;
  pollAfterSuccessfulInitialization?: boolean;
  pollAfterFailedInitialization?: boolean;
  throwOnFailedInitialization?: boolean;
  skipInitialPoll?: boolean;
};

export default class EppoPrecomputedClient {
  private readonly queuedAssignmentEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private assignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;

  constructor(
    private precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private precomputedFlagsRequestParameters?: PrecomputedFlagsRequestParameters,
    private isObfuscated = false,
  ) {}

  public setPrecomputedFlagsRequestParameters(
    precomputedFlagsRequestParameters: PrecomputedFlagsRequestParameters,
  ) {
    this.precomputedFlagsRequestParameters = precomputedFlagsRequestParameters;
  }

  public setPrecomputedFlagStore(precomputedFlagStore: IConfigurationStore<PrecomputedFlag>) {
    this.precomputedFlagStore = precomputedFlagStore;
  }

  public setIsObfuscated(isObfuscated: boolean) {
    this.isObfuscated = isObfuscated;
  }

  public async fetchPrecomputedFlags() {
    if (!this.precomputedFlagsRequestParameters) {
      throw new Error('Eppo SDK unable to fetch precomputed flags without the request parameters');
    }
    // if fetchFlagConfigurations() was previously called, stop any polling process from that call
    this.requestPoller?.stop();

    const {
      apiKey,
      sdkName,
      sdkVersion,
      baseUrl, // Default is set in ApiEndpoints constructor if undefined
      precompute: { subjectKey, subjectAttributes },
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      numInitialRequestRetries = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      numPollRequestRetries = DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterSuccessfulInitialization = false,
      pollAfterFailedInitialization = false,
      throwOnFailedInitialization = false,
      skipInitialPoll = false,
    } = this.precomputedFlagsRequestParameters;

    let { pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS } = this.precomputedFlagsRequestParameters;
    if (pollingIntervalMs <= 0) {
      logger.error('pollingIntervalMs must be greater than 0. Using default');
      pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    }

    // todo: Inject the chain of dependencies below
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams: { apiKey, sdkName, sdkVersion, subjectKey, subjectAttributes },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const precomputedRequestor = new PrecomputedRequestor(httpClient, this.precomputedFlagStore);

    const pollingCallback = async () => {
      if (await this.precomputedFlagStore.isExpired()) {
        return precomputedRequestor.fetchAndStorePrecomputedFlags();
      }
    };

    this.requestPoller = initPoller(pollingIntervalMs, pollingCallback, {
      maxStartRetries: numInitialRequestRetries,
      maxPollRetries: numPollRequestRetries,
      pollAfterSuccessfulStart: pollAfterSuccessfulInitialization,
      pollAfterFailedStart: pollAfterFailedInitialization,
      errorOnFailedStart: throwOnFailedInitialization,
      skipInitialPoll: skipInitialPoll,
    });

    await this.requestPoller.start();
  }

  public stopPolling() {
    if (this.requestPoller) {
      this.requestPoller.stop();
    }
  }

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getStringAssignment(flagKey: string, defaultValue: string): string {
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const preComputedFlag = this.getPrecomputedFlag(flagKey);

    if (preComputedFlag == null) {
      logger.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
      return defaultValue;
    }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      subjectKey: this.precomputedFlagsRequestParameters?.precompute.subjectKey ?? '',
      subjectAttributes: this.precomputedFlagsRequestParameters?.precompute.subjectAttributes ?? {},
      variation: {
        key: preComputedFlag.variationKey,
        value: preComputedFlag.variationValue,
      },
      allocationKey: preComputedFlag.allocationKey,
      extraLogging: preComputedFlag.extraLogging,
      doLog: preComputedFlag.doLog,
    };

    try {
      if (result?.doLog) {
        this.logAssignment(result);
      }
    } catch (error) {
      logger.error(`[Eppo SDK] Error logging assignment event: ${error}`);
    }
    return (result.variation?.value as string) ?? defaultValue;
  }

  private getPrecomputedFlag(flagKey: string): PrecomputedFlag | null {
    return this.isObfuscated
      ? this.getObfuscatedFlag(flagKey)
      : this.precomputedFlagStore.get(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): PrecomputedFlag | null {
    const precomputedFlag: PrecomputedFlag | null = this.precomputedFlagStore.get(
      getMD5Hash(flagKey),
    ) as PrecomputedFlag;
    return precomputedFlag ? decodePrecomputedFlag(precomputedFlag) : null;
  }

  public isInitialized() {
    return this.precomputedFlagStore.isInitialized();
  }

  public setAssignmentLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    // log any assignment events that may have been queued while initializing
    this.flushQueuedEvents(this.queuedAssignmentEvents, this.assignmentLogger?.logAssignment);
  }

  /**
   * Assignment cache methods.
   */
  public disableAssignmentCache() {
    this.assignmentCache = undefined;
  }

  public useNonExpiringInMemoryAssignmentCache() {
    this.assignmentCache = new NonExpiringInMemoryAssignmentCache();
  }

  public useLRUInMemoryAssignmentCache(maxSize: number) {
    this.assignmentCache = new LRUInMemoryAssignmentCache(maxSize);
  }

  public useCustomAssignmentCache(cache: AssignmentCache) {
    this.assignmentCache = cache;
  }

  private flushQueuedEvents<T>(eventQueue: T[], logFunction?: (event: T) => void) {
    const eventsToFlush = [...eventQueue]; // defensive copy
    eventQueue.length = 0; // Truncate the array

    if (!logFunction) {
      return;
    }

    eventsToFlush.forEach((event) => {
      try {
        logFunction(event);
      } catch (error: any) {
        logger.error(`[Eppo SDK] Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private logAssignment(result: FlagEvaluationWithoutDetails) {
    const { flagKey, subjectKey, allocationKey, subjectAttributes, variation } = result;
    const event: IAssignmentEvent = {
      ...(result.extraLogging ?? {}),
      allocation: allocationKey ?? null,
      experiment: allocationKey ? `${flagKey}-${allocationKey}` : null,
      featureFlag: flagKey,
      variation: variation?.key ?? null,
      subject: subjectKey,
      timestamp: new Date().toISOString(),
      subjectAttributes,
      metaData: this.buildLoggerMetadata(),
      evaluationDetails: null,
    };

    if (variation && allocationKey) {
      const hasLoggedAssignment = this.assignmentCache?.has({
        flagKey,
        subjectKey,
        allocationKey,
        variationKey: variation.key,
      });
      if (hasLoggedAssignment) {
        return;
      }
    }

    try {
      if (this.assignmentLogger) {
        this.assignmentLogger.logAssignment(event);
      } else if (this.queuedAssignmentEvents.length < MAX_EVENT_QUEUE_SIZE) {
        // assignment logger may be null while waiting for initialization, queue up events (up to a max)
        // to be flushed when set
        this.queuedAssignmentEvents.push(event);
      }
      this.assignmentCache?.set({
        flagKey,
        subjectKey,
        allocationKey: allocationKey ?? '__eppo_no_allocation',
        variationKey: variation?.key ?? '__eppo_no_variation',
      });
    } catch (error: any) {
      logger.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }

  private buildLoggerMetadata(): Record<string, unknown> {
    return {
      obfuscated: this.isObfuscated,
      sdkLanguage: 'javascript',
      sdkLibVersion: LIB_VERSION,
    };
  }
}
