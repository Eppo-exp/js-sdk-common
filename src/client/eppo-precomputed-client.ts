import ApiEndpoints from '../api-endpoints';
import { logger, loggerPrefix } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import {
  ensureContextualSubjectAttributes,
  ensureNonContextualSubjectAttributes,
} from '../attributes';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
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
import { decodePrecomputedBandit, decodePrecomputedFlag } from '../decoding';
import { FlagEvaluationWithoutDetails } from '../evaluator';
import FetchHttpClient from '../http-client';
import {
  IPrecomputedBandit,
  DecodedPrecomputedFlag,
  IObfuscatedPrecomputedBandit,
  PrecomputedFlag,
  VariationType,
} from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import PrecomputedRequestor from '../precomputed-requestor';
import { Attributes, ContextAttributes, FlagKey } from '../types';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';

import { checkTypeMatch, IAssignmentDetails } from './eppo-client';

export interface Subject {
  subjectKey: string;
  subjectAttributes: Attributes | ContextAttributes;
}

export type PrecomputedFlagsRequestParameters = {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  pollingIntervalMs?: number;
  numInitialRequestRetries?: number;
  numPollRequestRetries?: number;
  pollAfterSuccessfulInitialization?: boolean;
  pollAfterFailedInitialization?: boolean;
  throwOnFailedInitialization?: boolean;
  skipInitialPoll?: boolean;
};

interface EppoPrecomputedClientOptions {
  precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  precomputedBanditStore?: IConfigurationStore<IObfuscatedPrecomputedBandit>;
  subject: Subject;
  banditActions?: Record<FlagKey, Record<string, ContextAttributes>>;
  requestParameters?: PrecomputedFlagsRequestParameters;
}

export default class EppoPrecomputedClient {
  private readonly queuedAssignmentEvents: IAssignmentEvent[] = [];
  private readonly banditEventsQueue: IBanditEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private banditLogger?: IBanditLogger;
  private banditAssignmentCache?: AssignmentCache;
  private assignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;
  private requestParameters?: PrecomputedFlagsRequestParameters;
  private subject: {
    subjectKey: string;
    subjectAttributes: ContextAttributes;
  };
  private banditActions?: Record<FlagKey, Record<string, ContextAttributes>>;
  private precomputedFlagStore: IConfigurationStore<PrecomputedFlag>;
  private precomputedBanditStore?: IConfigurationStore<IObfuscatedPrecomputedBandit>;

  public constructor(options: EppoPrecomputedClientOptions) {
    this.precomputedFlagStore = options.precomputedFlagStore;
    this.precomputedBanditStore = options.precomputedBanditStore;
    const { subjectKey, subjectAttributes } = options.subject;
    this.subject = {
      subjectKey,
      subjectAttributes: ensureContextualSubjectAttributes(subjectAttributes),
    };
    this.banditActions = options.banditActions;
    if (options.requestParameters) {
      // Online-mode
      this.requestParameters = options.requestParameters;
    } else {
      // Offline-mode

      // Offline mode depends on pre-populated IConfigurationStores (flags and bandits) to source configuration.
      if (!this.precomputedFlagStore.isInitialized()) {
        logger.error(
          `${loggerPrefix} EppoPrecomputedClient requires an initialized precomputedFlagStore if requestParameters are not provided`,
        );
      }

      if (this.precomputedBanditStore && !this.precomputedBanditStore.isInitialized()) {
        logger.error(
          `${loggerPrefix} Passing banditOptions without requestParameters requires an initialized precomputedBanditStore`,
        );
      }

      if (!this.precomputedFlagStore.salt) {
        logger.error(
          `${loggerPrefix} EppoPrecomputedClient requires a precomputedFlagStore with a salt if requestParameters are not provided`,
        );
      }

      if (this.precomputedBanditStore && !this.precomputedBanditStore.salt) {
        logger.warn(
          `${loggerPrefix} EppoPrecomputedClient missing or empty salt for precomputedBanditStore`,
        );
      }
    }
  }

  public async fetchPrecomputedFlags() {
    if (!this.requestParameters) {
      throw new Error('Eppo SDK unable to fetch precomputed flags without the request parameters');
    }
    // if fetchFlagConfigurations() was previously called, stop any polling process from that call
    this.requestPoller?.stop();

    const {
      apiKey,
      sdkName,
      sdkVersion,
      baseUrl, // Default is set before passing to ApiEndpoints constructor if undefined
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      numInitialRequestRetries = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      numPollRequestRetries = DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterSuccessfulInitialization = false,
      pollAfterFailedInitialization = false,
      throwOnFailedInitialization = false,
      skipInitialPoll = false,
    } = this.requestParameters;
    const { subjectKey, subjectAttributes } = this.subject;

    let { pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS } = this.requestParameters;
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
      this.precomputedBanditStore,
      this.banditActions,
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

  private getPrecomputedAssignment<T>(
    flagKey: string,
    defaultValue: T,
    expectedType: VariationType,
    valueTransformer: (value: unknown) => T = (v) => v as T,
  ): T {
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const precomputedFlag = this.getPrecomputedFlag(flagKey);

    if (precomputedFlag == null) {
      logger.warn(`${loggerPrefix} No assigned variation. Flag not found: ${flagKey}`);
      return defaultValue;
    }

    // Add type checking before proceeding
    if (!checkTypeMatch(expectedType, precomputedFlag.variationType)) {
      const errorMessage = `${loggerPrefix} Type mismatch: expected ${expectedType} but flag ${flagKey} has type ${precomputedFlag.variationType}`;
      logger.error(errorMessage);
      return defaultValue;
    }

    const result: FlagEvaluationWithoutDetails = {
      flagKey,
      format: this.precomputedFlagStore.getFormat() ?? '',
      subjectKey: this.subject.subjectKey ?? '',
      subjectAttributes: ensureNonContextualSubjectAttributes(this.subject.subjectAttributes ?? {}),
      variation: {
        key: precomputedFlag.variationKey ?? '',
        value: precomputedFlag.variationValue,
      },
      allocationKey: precomputedFlag.allocationKey ?? '',
      extraLogging: precomputedFlag.extraLogging ?? {},
      doLog: precomputedFlag.doLog,
    };

    try {
      if (result?.doLog) {
        this.logAssignment(result);
      }
    } catch (error) {
      logger.error(`${loggerPrefix} Error logging assignment event: ${error}`);
    }

    try {
      return result.variation?.value !== undefined
        ? valueTransformer(result.variation.value)
        : defaultValue;
    } catch (error) {
      logger.error(`${loggerPrefix} Error transforming value: ${error}`);
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

  getBanditAction(
    flagKey: string,
    defaultValue: string,
  ): Omit<IAssignmentDetails<string>, 'evaluationDetails'> {
    const banditEvaluation = this.getPrecomputedBandit(flagKey);

    if (banditEvaluation == null) {
      logger.warn(`${loggerPrefix} No assigned variation. Bandit not found: ${flagKey}`);
      return { variation: defaultValue, action: null };
    }

    const banditEvent: IBanditEvent = {
      timestamp: new Date().toISOString(),
      featureFlag: flagKey,
      bandit: banditEvaluation.banditKey,
      subject: this.subject.subjectKey ?? '',
      action: banditEvaluation.action,
      actionProbability: banditEvaluation.actionProbability,
      optimalityGap: banditEvaluation.optimalityGap,
      modelVersion: banditEvaluation.modelVersion,
      subjectNumericAttributes: banditEvaluation.actionNumericAttributes,
      subjectCategoricalAttributes: banditEvaluation.actionCategoricalAttributes,
      actionNumericAttributes: banditEvaluation.actionNumericAttributes,
      actionCategoricalAttributes: banditEvaluation.actionCategoricalAttributes,
      metaData: this.buildLoggerMetadata(),
      evaluationDetails: null,
    };

    try {
      this.logBanditAction(banditEvent);
    } catch (error) {
      logger.error(`${loggerPrefix} Error logging bandit action: ${error}`);
    }

    return { variation: defaultValue, action: banditEvent.action };
  }

  private getPrecomputedFlag(flagKey: string): DecodedPrecomputedFlag | null {
    return this.getObfuscatedFlag(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): DecodedPrecomputedFlag | null {
    const salt = this.precomputedFlagStore.salt;
    const saltedAndHashedFlagKey = getMD5Hash(flagKey, salt);
    const precomputedFlag: PrecomputedFlag | null = this.precomputedFlagStore.get(
      saltedAndHashedFlagKey,
    ) as PrecomputedFlag;
    return precomputedFlag ? decodePrecomputedFlag(precomputedFlag) : null;
  }

  private getPrecomputedBandit(banditKey: string): IPrecomputedBandit | null {
    return this.getObfuscatedPrecomputedBandit(banditKey);
  }

  private getObfuscatedPrecomputedBandit(banditKey: string): IPrecomputedBandit | null {
    const salt = this.precomputedBanditStore?.salt;
    const saltedAndHashedBanditKey = getMD5Hash(banditKey, salt);
    const precomputedBandit: IObfuscatedPrecomputedBandit | null = this.precomputedBanditStore?.get(
      saltedAndHashedBanditKey,
    ) as IObfuscatedPrecomputedBandit;
    return precomputedBandit ? decodePrecomputedBandit(precomputedBandit) : null;
  }

  public isInitialized() {
    return this.precomputedFlagStore.isInitialized();
  }

  public setAssignmentLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    // log any assignment events that may have been queued while initializing
    this.flushQueuedEvents(this.queuedAssignmentEvents, this.assignmentLogger?.logAssignment);
  }

  public setBanditLogger(logger: IBanditLogger) {
    this.banditLogger = logger;
    // log any bandit events that may have been queued while initializing
    this.flushQueuedEvents(this.banditEventsQueue, this.banditLogger?.logBanditAction);
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
        logger.error(`${loggerPrefix} Error flushing event to logger: ${error.message}`);
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
      logger.error(`${loggerPrefix} Error logging assignment event: ${error.message}`);
    }
  }

  private logBanditAction(banditEvent: IBanditEvent): void {
    // First we check if this bandit action has been logged before
    const subjectKey = banditEvent.subject;
    const flagKey = banditEvent.featureFlag;
    const banditKey = banditEvent.bandit;
    const actionKey = banditEvent.action ?? '__eppo_no_action';

    const banditAssignmentCacheProperties = {
      flagKey,
      subjectKey,
      banditKey,
      actionKey,
    };

    if (this.banditAssignmentCache?.has(banditAssignmentCacheProperties)) {
      // Ignore repeat assignment
      return;
    }

    // If here, we have a logger and a new assignment to be logged
    try {
      if (this.banditLogger) {
        this.banditLogger.logBanditAction(banditEvent);
      } else {
        // If no logger defined, queue up the events (up to a max) to flush if a logger is later defined
        this.banditEventsQueue.push(banditEvent);
      }
      // Record in the assignment cache, if active, to deduplicate subsequent repeat assignments
      this.banditAssignmentCache?.set(banditAssignmentCacheProperties);
    } catch (err) {
      logger.warn('Error encountered logging bandit action', err);
    }
  }

  private buildLoggerMetadata(): Record<string, unknown> {
    return {
      obfuscated: true,
      sdkLanguage: 'javascript',
      sdkLibVersion: LIB_VERSION,
    };
  }
}
