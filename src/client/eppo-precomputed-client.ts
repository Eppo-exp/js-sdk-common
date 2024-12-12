import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';
import { LRUInMemoryAssignmentCache } from '../cache/lru-in-memory-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from '../cache/non-expiring-in-memory-cache-assignment';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  MAX_EVENT_QUEUE_SIZE,
  PRECOMPUTED_BASE_URL,
} from '../constants';
import { decodePrecomputedFlag } from '../decoding';
import { FlagEvaluationWithoutDetails } from '../evaluator';
import FetchHttpClient from '../http-client';
import { PrecomputedFlag, VariationType } from '../interfaces';
import { saltedHasher } from '../obfuscation';
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
  private precomputedFlagsRequestParameters?: PrecomputedFlagsRequestParameters;
  private subjectKey?: string;
  private subjectAttributes?: Attributes;
  private precomputedFlagKeySalt = '';

  constructor(
    private precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private isObfuscated = false,
  ) {}

  public setPrecomputedFlagsRequestParameters(
    precomputedFlagsRequestParameters: PrecomputedFlagsRequestParameters,
  ) {
    this.precomputedFlagsRequestParameters = precomputedFlagsRequestParameters;
  }

  public setSubjectAndPrecomputedFlagsRequestParameters(
    precomputedFlagsRequestParameters: PrecomputedFlagsRequestParameters,
  ) {
    this.setPrecomputedFlagsRequestParameters(precomputedFlagsRequestParameters);
    this.subjectKey = precomputedFlagsRequestParameters.precompute.subjectKey;
    this.subjectAttributes = precomputedFlagsRequestParameters.precompute.subjectAttributes;
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
      baseUrl, // Default is set before passing to ApiEndpoints constructor if undefined
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
      baseUrl: baseUrl ?? PRECOMPUTED_BASE_URL,
      queryParams: { apiKey, sdkName, sdkVersion },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const precomputedRequestor = new PrecomputedRequestor(
      httpClient,
      this.precomputedFlagStore,
      subjectKey,
      subjectAttributes,
    );

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

  public setSubjectAndPrecomputedFlagStore(
    subjectKey: string,
    subjectAttributes: Attributes,
    precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
  ) {
    // Save the new subject data and precomputed flag store together because they are related
    // Stop any polling process if it exists from previous subject data to protect consistency
    this.requestPoller?.stop();
    this.setPrecomputedFlagStore(precomputedFlagStore);
    this.subjectKey = subjectKey;
    this.subjectAttributes = subjectAttributes;
  }

  private getPrecomputedAssignment<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: VariationType,
    valueTransformer: (value: unknown) => T = (v) => v as T,
  ): T {
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const preComputedFlag = this.getPrecomputedFlag(flagKey);

    if (preComputedFlag == null) {
      logger.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
      return defaultValue;
    }

    // Check variation type
    if (preComputedFlag.variationType !== expectedType) {
      logger.error(
        `[Eppo SDK] Type mismatch: expected ${expectedType} but flag ${flagKey} has type ${preComputedFlag.variationType}`,
      );
      return defaultValue;
    }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      format: this.precomputedFlagStore.getFormat() ?? '',
      subjectKey: this.subjectKey ?? '',
      subjectAttributes: this.subjectAttributes ?? {},
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

    try {
      return result.variation?.value !== undefined
        ? valueTransformer(result.variation.value)
        : defaultValue;
    } catch (error) {
      logger.error(`[Eppo SDK] Error transforming value: ${error}`);
      return defaultValue;
    }
  }

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getStringAssignment(flagKey: string, defaultValue: string): string {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.STRING);
  }

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.BOOLEAN);
  }

  /**
   * Maps a subject to an integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getIntegerAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.INTEGER);
  }

  /**
   * Maps a subject to a numeric (floating point) variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getNumericAssignment(flagKey: string, defaultValue: number): number {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.NUMERIC);
  }

  /**
   * Maps a subject to a JSON object variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a parsed JSON object if a flag was precomputed for the subject, otherwise the default value
   * @public
   */
  public getJSONAssignment(flagKey: string, defaultValue: object): object {
    return this.getPrecomputedAssignment(flagKey, defaultValue, VariationType.JSON, (value) =>
      typeof value === 'string' ? JSON.parse(value) : defaultValue,
    );
  }

  private getPrecomputedFlag(flagKey: string): PrecomputedFlag | null {
    return this.isObfuscated
      ? this.getObfuscatedFlag(flagKey)
      : this.precomputedFlagStore.get(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): PrecomputedFlag | null {
    const precomputedFlag: PrecomputedFlag | null = this.precomputedFlagStore.get(
      saltedHasher(this.precomputedFlagKeySalt)(flagKey),
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(`[Eppo SDK] Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private logAssignment(result: FlagEvaluationWithoutDetails) {
    const { flagKey, subjectKey, allocationKey, subjectAttributes, variation, format } = result;
    const event: IAssignmentEvent = {
      ...(result.extraLogging ?? {}),
      allocation: allocationKey ?? null,
      experiment: allocationKey ? `${flagKey}-${allocationKey}` : null,
      featureFlag: flagKey,
      format,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
