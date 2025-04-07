import { v4 as randomUUID } from 'uuid';

import ApiEndpoints from '../api-endpoints';
import { logger, loggerPrefix } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import {
  ensureActionsWithContextualAttributes,
  ensureContextualSubjectAttributes,
  ensureNonContextualSubjectAttributes,
} from '../attributes';
import { BanditEvaluation, BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';
import { LRUInMemoryAssignmentCache } from '../cache/lru-in-memory-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from '../cache/non-expiring-in-memory-cache-assignment';
import { TLRUInMemoryAssignmentCache } from '../cache/tlru-in-memory-assignment-cache';
import { Configuration } from '../configuration';
import ConfigurationRequestor from '../configuration-requestor';
import { ConfigurationStore } from '../configuration-store';
import { ISyncStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import {
  ConfigurationWireV1,
  IConfigurationWire,
  IPrecomputedConfiguration,
  PrecomputedConfiguration,
} from '../configuration-wire/configuration-wire-types';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_BASE_POLLING_INTERVAL_MS,
  DEFAULT_MAX_POLLING_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_INITIALIZATION_TIMEOUT_MS,
  DEFAULT_MAX_AGE_SECONDS,
  DEFAULT_MAX_STALE_SECONDS,
  DEFAULT_INITIALIZATION_STRATEGY,
  DEFAULT_ACTIVATION_STRATEGY,
  DEFAULT_ENABLE_POLLING_CLIENT,
  DEFAULT_ENABLE_BANDITS,
} from '../constants';
import { EppoValue } from '../eppo_value';
import { Evaluator, FlagEvaluation, noneResult, overrideResult } from '../evaluator';
import { BoundedEventQueue } from '../events/bounded-event-queue';
import EventDispatcher from '../events/event-dispatcher';
import NoOpEventDispatcher from '../events/no-op-event-dispatcher';
import {
  FlagEvaluationDetailsBuilder,
  IFlagEvaluationDetails,
} from '../flag-evaluation-details-builder';
import { FlagEvaluationError } from '../flag-evaluation-error';
import FetchHttpClient from '../http-client';
import {
  BanditModelData,
  FormatEnum,
  IPrecomputedBandit,
  PrecomputedFlag,
  Variation,
  VariationType,
} from '../interfaces';
import { OverridePayload, OverrideValidator } from '../override-validator';
import { randomJitterMs } from '../poller';
import SdkTokenDecoder from '../sdk-token-decoder';
import {
  Attributes,
  AttributeType,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
  FlagKey,
  ValueType,
} from '../types';
import { shallowClone } from '../util';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';
import {
  PersistentConfigurationCache,
  PersistentConfigurationStorage,
} from '../persistent-configuration-cache';
import { ConfigurationPoller } from '../configuration-poller';
import { ConfigurationFeed, ConfigurationSource } from '../configuration-feed';
import { BroadcastChannel } from '../broadcast';

export interface IAssignmentDetails<T extends Variation['value'] | object> {
  variation: T;
  action: string | null;
  evaluationDetails: IFlagEvaluationDetails;
}

export interface IContainerExperiment<T> {
  flagKey: string;
  controlVariationEntry: T;
  treatmentVariationEntries: Array<T>;
}

export type EppoClientParameters = {
  sdkKey: string;
  sdkName: string;
  sdkVersion: string;
  baseUrl?: string;

  // Dispatcher for arbitrary, application-level events (not to be confused with Eppo specific assignment
  // or bandit events). These events are application-specific and captures by EppoClient#track API.
  eventDispatcher?: EventDispatcher;
  overrideStore?: ISyncStore<Variation>;

  bandits?: {
    /**
     * Whether to enable bandits.
     *
     * This influences whether bandits configuration is fetched.
     * Disabling bandits helps to save network bandwidth if bandits
     * are unused.
     *
     * @default true
     */
    enable?: boolean;
  };

  configuration?: {
    /**
     * Strategy for fetching initial configuration.
     *
     * - `stale-while-revalidate`: serve assignments using cached
     *   configuration (within `maxStaleSeconds`), while fetching a
     *   fresh configuration (if cached one is stale). If fetch fails
     *   or times out, use the cached/stale configuration.
     *
     * - `only-if-cached`: use cached configuration, even if stale. If
     *   no cached configuration is available, use default
     *   configuration.
     *
     * - `no-cache`: ignore cached configuration and always fetch a
     *   fresh configuration. If fetching fails, use default (empty)
     *   configuration.
     *
     * - `none`: consider client initialized without loading any
     *   configuration (except `initialConfiguration`). Can be useful
     *   if you want to manually control configuration.
     *
     * @default 'stale-while-revalidate'
     */
    initializationStrategy?: 'stale-while-revalidate' | 'only-if-cached' | 'no-cache' | 'none';

    persistentStorage?: PersistentConfigurationStorage;

    /**
     * You may speed-up initialization process by bootstrapping client
     * using `Configuration` received from another Eppo client (e.g.,
     * initialize client SDK using configuration from server SDK).
     *
     * For the purposes of initialization, this configuration is
     * considered as cached, so the client may still issue a fetch
     * request if it detects that configuration is too old. If you
     * want to disable any network requests during initialization, set
     * `initializationStrategy` to `none`.
     *
     * @default undefined
     */
    initialConfiguration?: Configuration;

    /**
     * Maximum time the client is allowed to spend in
     * initialization. After timeout is reached, the client will use
     * the best configuration that it got and consider initialization
     * finished.
     *
     * @default 5_000 (5 seconds)
     */
    initializationTimeoutMs?: number;

    /**
     * Allow using cached configuration that is `maxAgeSeconds` old,
     * without attempting to fetch a fresh configuration.
     *
     * @default 30
     */
    maxAgeSeconds?: number;

    /**
     * Allow using a stale configuration that is stale within
     * `maxStaleSeconds`. Stale configuration may be used if server is
     * unreachable.
     *
     * @default Infinity
     */
    maxStaleSeconds?: number;

    /**
     * Whether to enable periodic polling for configuration.
     *
     * If enabled, the client will try to fetch a new configuration
     * every `basePollingIntervalMs` milliseconds.
     *
     * When configuration is successfully fetched, it is stored in
     * persistent storage (cache) if available. `activationStrategy`
     * determines whether configuration is activated (i.e., becomes
     * used for evaluating assignments and bandits).
     *
     * @default true (for Node.js SDK)
     * @default false (for Client SDK)
     */
    enablePolling?: boolean;
    /**
     * How often to poll for configuration.
     *
     * @default 30_000 (30 seconds)
     */
    basePollingIntervalMs?: number;
    /**
     * Maximum polling interval.
     *
     * @default 300_000 (5 minutes)
     */
    maxPollingIntervalMs?: number;

    /**
     * When to activate the fetched configuration, allowing it to be
     * used to evaluate assignments and bandits.
     *
     * - `next-load`: the fetched configuration is stored in persistent storage and
     *   will be activated on next client initialization. Assignments
     *   and bandits continue to be served using the currently active
     *   configuration. This is helpful in client application if you
     *   want to ensure that user experience is not disrupted in the
     *   middle of the session.
     *
     * - `stale`: activate fetched configuration if the current one
     *   exceeds `maxStaleSeconds`.
     *
     * - `empty`: activate fetched configuration if the current
     *   configuration is empty (serving default assignments).
     *
     * - `always`: always activate the latest fetched configuration.
     *
     * @default 'always' (for Node.js SDK)
     * @default 'stale' (for Client SDK)
     */
    activationStrategy?: 'always' | 'stale' | 'empty' | 'next-load';

    /**
     * Timeout for individual network requests.
     *
     * @default 5_000 (5 seconds)
     */
    requestTimeoutMs?: number;
  };
};

/**
 * ## Initialization
 *
 * During initialization, the client will:
 * 1. Load initial configuration from `configuration.initialConfiguration` if provided
 * 2. If no initial configuration and `configuration.persistentStorage` is provided and strategy is
 *    not 'no-cache' or 'none', attempt to load cached configuration
 * 3. Based on `configuration.initializationStrategy`:
 *    - 'stale-while-revalidate': Use cached config if within `maxStaleSeconds`, fetch fresh in
 *      background
 *    - 'only-if-cached': Use cached config only, no network requests
 *    - 'no-cache': Always fetch fresh config
 *    - 'none': Use only initial config, no loading/fetching
 * 4. If fetching enabled, attempt fetches until success or `initializationTimeoutMs` reached
 * 5. If `configuration.enablePolling` is true, begin polling for updates every
 *    `basePollingIntervalMs`
 * 6. When new configs are fetched, activate based on `configuration.activationStrategy`:
 *    - 'always': Activate immediately
 *    - 'stale': Activate if current config exceeds `maxStaleSeconds`
 *    - 'empty': Activate if current config is empty
 *    - 'next-load': Store for next initialization
 *
 * Initialization is considered complete when either:
 * - For 'stale-while-revalidate': Fresh configuration is fetched
 * - For 'only-if-cached': Cache is loaded or initial configuration applied
 * - For 'no-cache': Fresh configuration is fetched
 * - For 'none': Immediately
 *
 * If `configuration.initializationTimeoutMs` is reached before completion, initialization finishes
 * with the best available configuration (from cache, initial configuration, or empty).
 */
export default class EppoClient {
  private eventDispatcher: EventDispatcher;
  private readonly assignmentEventsQueue: BoundedEventQueue<IAssignmentEvent> =
    new BoundedEventQueue<IAssignmentEvent>('assignments');
  private readonly banditEventsQueue: BoundedEventQueue<IBanditEvent> =
    new BoundedEventQueue<IBanditEvent>('bandit');
  private readonly banditEvaluator = new BanditEvaluator();
  private banditLogger?: IBanditLogger;
  private banditAssignmentCache?: AssignmentCache;
  private overrideStore?: ISyncStore<Variation>;
  private assignmentLogger?: IAssignmentLogger;
  private assignmentCache?: AssignmentCache;
  // whether to suppress any errors and return default values instead
  private isGracefulFailureMode = true;
  private readonly evaluator = new Evaluator();
  private readonly overrideValidator = new OverrideValidator();

  private readonly configurationFeed;
  private readonly configurationStore: ConfigurationStore;
  private readonly configurationCache?: PersistentConfigurationCache;
  private readonly configurationRequestor: ConfigurationRequestor;
  private readonly configurationPoller: ConfigurationPoller;
  private initialized = false;
  private readonly initializationPromise: Promise<void>;

  constructor(options: EppoClientParameters) {
    const { eventDispatcher = new NoOpEventDispatcher(), overrideStore, configuration } = options;

    this.eventDispatcher = eventDispatcher;
    this.overrideStore = overrideStore;

    const {
      configuration: {
        persistentStorage,
        initializationTimeoutMs = DEFAULT_INITIALIZATION_TIMEOUT_MS,
        requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        basePollingIntervalMs = DEFAULT_BASE_POLLING_INTERVAL_MS,
        maxPollingIntervalMs = DEFAULT_MAX_POLLING_INTERVAL_MS,
        enablePolling = DEFAULT_ENABLE_POLLING_CLIENT,
        maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
        activationStrategy = DEFAULT_ACTIVATION_STRATEGY,
      } = {},
    } = options;

    this.configurationFeed = new BroadcastChannel<[Configuration, ConfigurationSource]>();

    this.configurationStore = new ConfigurationStore(configuration?.initialConfiguration);
    this.configurationStore.register(
      this.configurationFeed,
      activationStrategy === 'always'
        ? { type: 'always' }
        : activationStrategy === 'stale'
        ? { type: 'stale', maxAgeSeconds }
        : activationStrategy === 'empty'
        ? { type: 'empty' }
        : { type: 'never' },
    );

    if (persistentStorage) {
      this.configurationCache = new PersistentConfigurationCache(
        persistentStorage,
        this.configurationFeed,
      );
    }

    this.configurationRequestor = new ConfigurationRequestor(
      new FetchHttpClient(
        new ApiEndpoints({
          sdkTokenDecoder: new SdkTokenDecoder(options.sdkKey),
          baseUrl: options.baseUrl,
          queryParams: {
            apiKey: options.sdkKey,
            sdkName: options.sdkName,
            sdkVersion: options.sdkVersion,
          },
        }),
        requestTimeoutMs,
      ),
      this.configurationFeed,
      {
        wantsBandits: options.bandits?.enable ?? DEFAULT_ENABLE_BANDITS,
      },
    );

    this.configurationPoller = new ConfigurationPoller(this.configurationRequestor, {
      configurationFeed: this.configurationFeed,
      basePollingIntervalMs,
      maxPollingIntervalMs,
      maxAgeMs: maxAgeSeconds * 1000,
    });

    this.initializationPromise = withTimeout(this.initialize(options), initializationTimeoutMs)
      .catch((err) => {
        logger.warn({ err }, '[Eppo SDK] Encountered an error during initialization');
      })
      .finally(() => {
        logger.debug('[Eppo SDK] Finished initialization');
        this.initialized = true;
        if (enablePolling) {
          this.configurationPoller.start();
        }
      });
  }

  private async initialize(options: EppoClientParameters): Promise<void> {
    logger.debug('[Eppo SDK] Initializing EppoClient');
    const {
      configuration: {
        initializationStrategy = DEFAULT_INITIALIZATION_STRATEGY,
        initialConfiguration,
        basePollingIntervalMs = DEFAULT_BASE_POLLING_INTERVAL_MS,
        maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS,
        maxStaleSeconds = DEFAULT_MAX_STALE_SECONDS,
      } = {},
    } = options;

    if (initialConfiguration) {
      this.configurationStore.setConfiguration(initialConfiguration);
      this.configurationFeed.broadcast(initialConfiguration, ConfigurationSource.Cache);
    }

    if (initializationStrategy === 'none') {
      this.initialized = true;
      return;
    }

    if (
      !initialConfiguration && // initial configuration overrides persistent storage for initialization
      this.configurationCache &&
      (initializationStrategy === 'stale-while-revalidate' ||
        initializationStrategy === 'only-if-cached')
    ) {
      try {
        const configuration = await this.configurationCache.loadConfiguration({ maxStaleSeconds });
        if (configuration && !this.initialized) {
          this.configurationStore.setConfiguration(configuration);
        }
      } catch (err) {
        logger.warn('Eppo SDK failed to load configuration from persistent store', { err });
      }
    }

    if (initializationStrategy === 'only-if-cached') {
      return;
    }

    // Finish initialization early if cached configuration is fresh.
    const cachedConfiguration = this.configurationStore.getConfiguration();
    const configurationAgeMs = cachedConfiguration?.getAgeMs();
    if (configurationAgeMs !== undefined && configurationAgeMs < maxAgeSeconds * 1000) {
      logger.debug(
        { configurationAgeMs, maxAgeSeconds },
        '[Eppo SDK] The cached configuration is fresh, skipping fetch',
      );
      return;
    } else if (cachedConfiguration) {
      logger.debug(
        { configurationAgeMs, maxAgeSeconds },
        '[Eppo SDK] The cached configuration is stale, fetching new configuration',
      );
    } else {
      logger.debug('[Eppo SDK] No cached configuration found, fetching new configuration');
    }

    // Loop until we sucessfully fetch configuration or initialization deadline is reached (and sets
    // this.initialized to true).
    while (!this.initialized) {
      try {
        logger.debug('[Eppo SDK] Fetching initial configuration');
        const configuration = await this.configurationRequestor.fetchConfiguration();
        if (configuration) {
          this.configurationFeed.broadcast(configuration, ConfigurationSource.Network);
          this.configurationStore.setConfiguration(configuration);

          // The fetch was successful, so we can exit the loop.
          return;
        }
      } catch (err) {
        logger.warn({ err }, '[Eppo SDK] Failed to fetch initial configuration');
      }

      // Note: this is only using the jitter without the base polling interval.
      await new Promise((resolve) => setTimeout(resolve, randomJitterMs(basePollingIntervalMs)));
    }
  }

  /**
   * Waits for the client to finish initialization sequence and be ready to serve assignments.
   *
   * @returns A promise that resolves when the client is initialized.
   */
  public waitForInitialization(): Promise<void> {
    return this.initializationPromise;
  }

  public getConfiguration(): Configuration {
    return this.configurationStore.getConfiguration();
  }

  /**
   * Activates a new configuration.
   */
  public activateConfiguration(configuration: Configuration) {
    this.configurationStore.setConfiguration(configuration);
  }

  /**
   * Register a listener to be notified when a new configuration is received.
   * @param listener Callback function that receives the fetched `Configuration` object
   * @returns A function that can be called to unsubscribe the listener.
   */
  public onNewConfiguration(listener: (configuration: Configuration) => void): () => void {
    return this.configurationFeed.addListener(listener);
  }

  /**
   * Register a listener to be notified when a new configuration is activated.
   * @param listener Callback function that receives the activated `Configuration` object
   * @returns A function that can be called to unsubscribe the listener.
   */
  public onConfigurationActivated(listener: (configuration: Configuration) => void): () => void {
    return this.configurationStore.onConfigurationChange(listener);
  }

  /**
   * Validates and parses x-eppo-overrides header sent by Eppo's Chrome extension
   */
  async parseOverrides(
    overridePayload: string | undefined,
  ): Promise<Record<FlagKey, Variation> | undefined> {
    if (!overridePayload) {
      return undefined;
    }
    const payload: OverridePayload = this.overrideValidator.parseOverridePayload(overridePayload);
    await this.overrideValidator.validateKey(payload.browserExtensionKey);
    return payload.overrides;
  }

  /**
   * Creates an EppoClient instance that has the specified overrides applied
   * to it without affecting the original EppoClient singleton. Useful for
   * applying overrides in a shared Node instance, such as a web server.
   */
  withOverrides(overrides: Record<FlagKey, Variation> | undefined): EppoClient {
    if (overrides && Object.keys(overrides).length) {
      const copy = shallowClone(this);
      copy.overrideStore = new MemoryOnlyConfigurationStore<Variation>();
      copy.overrideStore.setEntries(overrides);
      return copy;
    }
    return this;
  }

  /** Sets the EventDispatcher instance to use when tracking events with {@link track}. */
  // noinspection JSUnusedGlobalSymbols
  setEventDispatcher(eventDispatcher: EventDispatcher) {
    this.eventDispatcher = eventDispatcher;
  }

  /**
   * Attaches a context to be included with all events dispatched by the EventDispatcher.
   * The context is delivered as a top-level object in the ingestion request payload.
   * An existing key can be removed by providing a `null` value.
   * Calling this method with same key multiple times causes only the last value to be used for the
   * given key.
   *
   * @param key - The context entry key.
   * @param value - The context entry value, must be a string, number, boolean, or null. If value is
   * an object or an array, will throw an ArgumentError.
   */
  setContext(key: string, value: string | number | boolean | null) {
    this.eventDispatcher?.attachContext(key, value);
  }

  setOverrideStore(store: ISyncStore<Variation>): void {
    this.overrideStore = store;
  }

  unsetOverrideStore(): void {
    this.overrideStore = undefined;
  }

  // Returns a mapping of flag key to variation key for all active overrides
  getOverrideVariationKeys(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.overrideStore?.entries() ?? {}).map(([flagKey, value]) => [
        flagKey,
        value.key,
      ]),
    );
  }

  // noinspection JSUnusedGlobalSymbols
  stopPolling() {
    if (this.configurationPoller) {
      this.configurationPoller.stop();
    }
  }

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise the default value
   * @public
   */
  getStringAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: string,
  ): string {
    return this.getStringAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue)
      .variation;
  }

  /**
   * Maps a subject to a string variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  getStringAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string,
  ): IAssignmentDetails<string> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.String(defaultValue),
      VariationType.STRING,
    );
    return {
      variation: eppoValue.stringValue ?? defaultValue,
      action: null,
      evaluationDetails: flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a boolean variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getBooleanAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: boolean,
  ): boolean {
    return this.getBooleanAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue)
      .variation;
  }

  /**
   * Maps a subject to a boolean variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  getBooleanAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): IAssignmentDetails<boolean> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Bool(defaultValue),
      VariationType.BOOLEAN,
    );
    return {
      variation: eppoValue.boolValue ?? defaultValue,
      action: null,
      evaluationDetails: flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to an Integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an integer variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getIntegerAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: number,
  ): number {
    return this.getIntegerAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue)
      .variation;
  }

  /**
   * Maps a subject to an Integer variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  getIntegerAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): IAssignmentDetails<number> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Numeric(defaultValue),
      VariationType.INTEGER,
    );
    return {
      variation: eppoValue.numericValue ?? defaultValue,
      action: null,
      evaluationDetails: flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to a numeric variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a number variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getNumericAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: number,
  ): number {
    return this.getNumericAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue)
      .variation;
  }

  /**
   * Maps a subject to a numeric variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  getNumericAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): IAssignmentDetails<number> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Numeric(defaultValue),
      VariationType.NUMERIC,
    );
    return {
      variation: eppoValue.numericValue ?? defaultValue,
      action: null,
      evaluationDetails: flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to a JSON variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a JSON object variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getJSONAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: object,
  ): object {
    return this.getJSONAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue)
      .variation;
  }

  getJSONAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: object,
  ): IAssignmentDetails<object> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.JSON(defaultValue),
      VariationType.JSON,
    );
    return {
      variation: eppoValue.objectValue ?? defaultValue,
      action: null,
      evaluationDetails: flagEvaluationDetails,
    };
  }

  getBanditAction(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    defaultValue: string,
  ): Omit<IAssignmentDetails<string>, 'evaluationDetails'> {
    const { variation, action } = this.getBanditActionDetails(
      flagKey,
      subjectKey,
      subjectAttributes,
      actions,
      defaultValue,
    );
    return { variation, action };
  }

  /**
   * Evaluates the supplied actions using the first bandit associated with `flagKey` and returns the best ranked action.
   *
   * This method should be considered **preview** and is subject to change as requirements mature.
   *
   * NOTE: This method does not do any logging or assignment computation and so calling this method will have
   * NO IMPACT on bandit and experiment training.
   *
   * Only use this method under certain circumstances (i.e. where the impact of the choice of bandit cannot be measured,
   * but you want to put the "best foot forward", for example, when being web-crawled).
   *
   */
  getBestAction(
    flagKey: string,
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    defaultAction: string,
  ): string {
    const config = this.getConfiguration();
    let result: string | null = null;

    const flagBanditVariations = config.getFlagBanditVariations(flagKey);
    const banditKey = flagBanditVariations.at(0)?.key;

    if (banditKey) {
      const banditParameters = config.getBanditConfiguration()?.response.bandits[banditKey];
      if (banditParameters) {
        const contextualSubjectAttributes = ensureContextualSubjectAttributes(subjectAttributes);
        const actionsWithContextualAttributes = ensureActionsWithContextualAttributes(actions);

        result = this.banditEvaluator.evaluateBestBanditAction(
          contextualSubjectAttributes,
          actionsWithContextualAttributes,
          banditParameters.modelData,
        );
      }
    }

    return result ?? defaultAction;
  }

  getBanditActionDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    defaultValue: string,
  ): IAssignmentDetails<string> {
    const config = this.getConfiguration();
    let variation = defaultValue;
    let action: string | null = null;

    // Initialize with a generic evaluation details. This will mutate as the function progresses.
    let evaluationDetails: IFlagEvaluationDetails = this.newFlagEvaluationDetailsBuilder(
      config,
      flagKey,
    ).buildForNoneResult(
      'ASSIGNMENT_ERROR',
      'Unexpected error getting assigned variation for bandit action',
    );
    try {
      // Get the assigned variation for the flag with a possible bandit
      // Note for getting assignments, we don't care about context
      const nonContextualSubjectAttributes =
        ensureNonContextualSubjectAttributes(subjectAttributes);
      const { variation: assignedVariation, evaluationDetails: assignmentEvaluationDetails } =
        this.getStringAssignmentDetails(
          flagKey,
          subjectKey,
          nonContextualSubjectAttributes,
          defaultValue,
        );
      variation = assignedVariation;
      evaluationDetails = assignmentEvaluationDetails;

      if (!config) {
        return { variation, action: null, evaluationDetails };
      }

      // Check if the assigned variation is an active bandit
      // Note: the reason for non-bandit assignments include the subject being bucketed into a non-bandit variation or
      // a rollout having been done.
      const bandit = config.getFlagVariationBandit(flagKey, variation);
      if (!bandit) {
        return { variation, action: null, evaluationDetails };
      }

      evaluationDetails.banditKey = bandit.banditKey;
      const banditEvaluation = this.evaluateBanditAction(
        flagKey,
        subjectKey,
        subjectAttributes,
        actions,
        bandit.modelData,
      );

      if (banditEvaluation?.actionKey) {
        action = banditEvaluation.actionKey;

        const banditEvent: IBanditEvent = {
          timestamp: new Date().toISOString(),
          featureFlag: flagKey,
          bandit: bandit.banditKey,
          subject: subjectKey,
          action,
          actionProbability: banditEvaluation.actionWeight,
          optimalityGap: banditEvaluation.optimalityGap,
          modelVersion: bandit.modelVersion,
          subjectNumericAttributes: banditEvaluation.subjectAttributes.numericAttributes,
          subjectCategoricalAttributes: banditEvaluation.subjectAttributes.categoricalAttributes,
          actionNumericAttributes: banditEvaluation.actionAttributes.numericAttributes,
          actionCategoricalAttributes: banditEvaluation.actionAttributes.categoricalAttributes,
          metaData: this.buildLoggerMetadata(),
          evaluationDetails,
        };

        try {
          this.logBanditAction(banditEvent);
        } catch (err: any) {
          logger.error('Error logging bandit event', err);
        }

        evaluationDetails.banditAction = action;
      }
    } catch (err: any) {
      logger.error('Error determining bandit action', err);
      if (!this.isGracefulFailureMode) {
        throw err;
      }
      if (variation) {
        // If we have a variation, the assignment succeeded and the error was with the bandit part.
        // Update the flag evaluation code to indicate that
        evaluationDetails.flagEvaluationCode = 'BANDIT_ERROR';
      }
      evaluationDetails.flagEvaluationDescription = `Error evaluating bandit action: ${err.message}`;
    }
    return { variation, action, evaluationDetails };
  }

  /**
   * For use with 3rd party CMS tooling, such as the Contentful Eppo plugin.
   *
   * CMS plugins that integrate with Eppo will follow a common format for
   * creating a feature flag. The flag created by the CMS plugin will have
   * variations with values 'control', 'treatment-1', 'treatment-2', etc.
   * This function allows users to easily return the CMS container entry
   * for the assigned variation.
   *
   * @param flagExperiment the flag key, control container entry and treatment container entries.
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @returns The container entry associated with the experiment.
   */
  getExperimentContainerEntry<T>(
    flagExperiment: IContainerExperiment<T>,
    subjectKey: string,
    subjectAttributes: Attributes,
  ): T {
    const { flagKey, controlVariationEntry, treatmentVariationEntries } = flagExperiment;
    const assignment = this.getStringAssignment(flagKey, subjectKey, subjectAttributes, 'control');
    if (assignment === 'control') {
      return controlVariationEntry;
    }
    if (!assignment.startsWith('treatment-')) {
      logger.warn(
        `Variation '${assignment}' cannot be mapped to a container. Defaulting to control variation.`,
      );
      return controlVariationEntry;
    }
    const treatmentVariationIndex = Number.parseInt(assignment.split('-')[1]) - 1;
    if (isNaN(treatmentVariationIndex)) {
      logger.warn(
        `Variation '${assignment}' cannot be mapped to a container. Defaulting to control variation.`,
      );
      return controlVariationEntry;
    }
    if (treatmentVariationIndex >= treatmentVariationEntries.length) {
      logger.warn(
        `Selected treatment variation (${treatmentVariationIndex}) index is out of bounds. Defaulting to control variation.`,
      );
      return controlVariationEntry;
    }
    return treatmentVariationEntries[treatmentVariationIndex];
  }

  private evaluateBanditAction(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    banditModelData: BanditModelData,
  ): BanditEvaluation | null {
    // If no actions, there is nothing to do
    if (!Object.keys(actions).length) {
      return null;
    }

    const contextualSubjectAttributes = ensureContextualSubjectAttributes(subjectAttributes);
    const actionsWithContextualAttributes = ensureActionsWithContextualAttributes(actions);

    return this.banditEvaluator.evaluateBandit(
      flagKey,
      subjectKey,
      contextualSubjectAttributes,
      actionsWithContextualAttributes,
      banditModelData,
    );
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

  private getAssignmentVariation(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: EppoValue,
    expectedVariationType: VariationType,
  ): { eppoValue: EppoValue; flagEvaluationDetails: IFlagEvaluationDetails } {
    try {
      const result = this.getAssignmentDetail(
        flagKey,
        subjectKey,
        subjectAttributes,
        expectedVariationType,
      );
      return this.parseVariationWithDetails(result, defaultValue, expectedVariationType);
    } catch (error: any) {
      const eppoValue = this.rethrowIfNotGraceful(error, defaultValue);
      if (error instanceof FlagEvaluationError && error.flagEvaluationDetails) {
        return {
          eppoValue,
          flagEvaluationDetails: error.flagEvaluationDetails,
        };
      } else {
        const flagEvaluationDetails = new FlagEvaluationDetailsBuilder(
          '',
          [],
          '',
          '',
        ).buildForNoneResult('ASSIGNMENT_ERROR', `Assignment Error: ${error.message}`);
        return {
          eppoValue,
          flagEvaluationDetails,
        };
      }
    }
  }

  private parseVariationWithDetails(
    { flagEvaluationDetails, variation }: FlagEvaluation,
    defaultValue: EppoValue,
    expectedVariationType: VariationType,
  ): { eppoValue: EppoValue; flagEvaluationDetails: IFlagEvaluationDetails } {
    try {
      if (!variation || flagEvaluationDetails.flagEvaluationCode !== 'MATCH') {
        return { eppoValue: defaultValue, flagEvaluationDetails };
      }
      const eppoValue = EppoValue.valueOf(variation.value, expectedVariationType);
      return { eppoValue, flagEvaluationDetails };
    } catch (error: any) {
      const eppoValue = this.rethrowIfNotGraceful(error, defaultValue);
      return { eppoValue, flagEvaluationDetails };
    }
  }

  private rethrowIfNotGraceful(err: Error, defaultValue?: EppoValue): EppoValue {
    if (this.isGracefulFailureMode) {
      logger.error(`${loggerPrefix} Error getting assignment: ${err.message}`);
      return defaultValue ?? EppoValue.Null();
    }
    throw err;
  }

  private getAllAssignments(
    subjectKey: string,
    subjectAttributes: Attributes = {},
  ): Record<FlagKey, PrecomputedFlag> {
    const config = this.getConfiguration();
    const flagKeys = config.getFlagKeys();
    const flags: Record<FlagKey, PrecomputedFlag> = {};

    // Evaluate all the enabled flags for the user
    flagKeys.forEach((flagKey) => {
      const flag = config.getFlag(flagKey);
      if (!flag) {
        logger.debug(`${loggerPrefix} No assigned variation. Flag does not exist.`);
        return;
      }

      // Evaluate the flag for this subject.
      const evaluation = this.evaluator.evaluateFlag(config, flag, subjectKey, subjectAttributes);

      // allocationKey is set along with variation when there is a result. this check appeases typescript below
      if (!evaluation.variation || !evaluation.allocationKey) {
        logger.debug(`${loggerPrefix} No assigned variation: ${flagKey}`);
        return;
      }

      // Transform into a PrecomputedFlag
      flags[flagKey] = {
        flagKey,
        allocationKey: evaluation.allocationKey,
        doLog: evaluation.doLog,
        extraLogging: evaluation.extraLogging,
        variationKey: evaluation.variation.key,
        variationType: flag.variationType,
        variationValue: evaluation.variation.value.toString(),
      };
    });

    return flags;
  }

  /**
   * Computes and returns assignments and bandits for a subject from all loaded flags.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param banditActions optional attributes associated with the bandit actions
   * @param salt a salt to use for obfuscation
   */
  getPrecomputedConfiguration(
    subjectKey: string,
    subjectAttributes: Attributes | ContextAttributes = {},
    banditActions: Record<FlagKey, BanditActions> = {},
    salt?: string,
  ): string {
    const config = this.getConfiguration();

    const subjectContextualAttributes = ensureContextualSubjectAttributes(subjectAttributes);
    const subjectFlatAttributes = ensureNonContextualSubjectAttributes(subjectAttributes);
    const flags = this.getAllAssignments(subjectKey, subjectFlatAttributes);

    const bandits = this.computeBanditsForFlags(
      config,
      subjectKey,
      subjectContextualAttributes,
      banditActions,
      flags,
    );

    const precomputedConfig: IPrecomputedConfiguration = PrecomputedConfiguration.obfuscated(
      subjectKey,
      flags,
      bandits,
      salt ?? '', // no salt if not provided
      subjectContextualAttributes,
      config.getFlagsConfiguration()?.response.environment,
    );

    const configWire: IConfigurationWire = ConfigurationWireV1.precomputed(precomputedConfig);
    return JSON.stringify(configWire);
  }

  /**
   * [Experimental] Get a detailed return of assignment for a particular subject and flag.
   *
   * Note: This method is experimental and may change in future versions.
   * Please only use for debugging purposes, and not in production.
   *
   * @param flagKey The flag key
   * @param subjectKey The subject key
   * @param subjectAttributes The subject attributes
   * @param expectedVariationType The expected variation type
   * @returns A detailed return of assignment for a particular subject and flag
   */
  getAssignmentDetail(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes = {},
    expectedVariationType?: VariationType,
  ): FlagEvaluation {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');
    const config = this.getConfiguration();

    const flagEvaluationDetailsBuilder = this.newFlagEvaluationDetailsBuilder(config, flagKey);
    if (!config) {
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'FLAG_UNRECOGNIZED_OR_DISABLED',
        "Configuration hasn't being fetched yet",
      );
      return noneResult(flagKey, subjectKey, subjectAttributes, flagEvaluationDetails, '');
    }

    const overrideVariation = this.overrideStore?.get(flagKey);
    if (overrideVariation) {
      return overrideResult(
        flagKey,
        subjectKey,
        subjectAttributes,
        overrideVariation,
        flagEvaluationDetailsBuilder,
      );
    }

    const flag = config.getFlag(flagKey);

    if (flag === null) {
      logger.warn(`${loggerPrefix} No assigned variation. Flag not found: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'FLAG_UNRECOGNIZED_OR_DISABLED',
        `Unrecognized or disabled flag: ${flagKey}`,
      );
      return noneResult(
        flagKey,
        subjectKey,
        subjectAttributes,
        flagEvaluationDetails,
        config.getFlagsConfiguration()?.response.environment.name ?? '',
      );
    }

    if (!checkTypeMatch(expectedVariationType, flag.variationType)) {
      const errorMessage = `Variation value does not have the correct type. Found ${flag.variationType}, but expected ${expectedVariationType} for flag ${flagKey}`;
      if (this.isGracefulFailureMode) {
        const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
          'TYPE_MISMATCH',
          errorMessage,
        );
        return noneResult(
          flagKey,
          subjectKey,
          subjectAttributes,
          flagEvaluationDetails,
          config.getFlagsConfiguration()?.response.format ?? '',
        );
      }
      throw new TypeError(errorMessage);
    }

    if (!flag.enabled) {
      logger.info(`${loggerPrefix} No assigned variation. Flag is disabled: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'FLAG_UNRECOGNIZED_OR_DISABLED',
        `Unrecognized or disabled flag: ${flagKey}`,
      );
      return noneResult(
        flagKey,
        subjectKey,
        subjectAttributes,
        flagEvaluationDetails,
        config.getFlagsConfiguration()?.response.format ?? '',
      );
    }

    const result = this.evaluator.evaluateFlag(
      config,
      flag,
      subjectKey,
      subjectAttributes,
      expectedVariationType,
    );

    // if flag.key is obfuscated, replace with requested flag key
    result.flagKey = flagKey;

    try {
      if (result?.doLog) {
        this.maybeLogAssignment(result);
      }
    } catch (error) {
      logger.error(`${loggerPrefix} Error logging assignment event: ${error}`);
    }

    return result;
  }

  /**
   * Enqueues an arbitrary event. Events must have a type and a payload.
   */
  track(type: string, payload: Record<string, unknown>) {
    this.eventDispatcher.dispatch({
      uuid: randomUUID(),
      type,
      timestamp: new Date().getTime(),
      payload,
    });
  }

  private newFlagEvaluationDetailsBuilder(
    config: Configuration,
    flagKey: string,
  ): FlagEvaluationDetailsBuilder {
    const flag = config.getFlag(flagKey);
    const flagsConfiguration = config.getFlagsConfiguration();
    return new FlagEvaluationDetailsBuilder(
      flagsConfiguration?.response.environment.name ?? '',
      flag?.allocations ?? [],
      flagsConfiguration?.fetchedAt ?? '',
      flagsConfiguration?.response.createdAt ?? '',
    );
  }

  isInitialized() {
    return this.initialized;
  }

  setAssignmentLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    // log any assignment events that may have been queued while initializing
    this.flushQueuedEvents(this.assignmentEventsQueue, this.assignmentLogger?.logAssignment);
  }

  setBanditLogger(logger: IBanditLogger) {
    this.banditLogger = logger;
    // log any bandit events that may have been queued while initializing
    this.flushQueuedEvents(this.banditEventsQueue, this.banditLogger?.logBanditAction);
  }

  /**
   * Assignment cache methods.
   */
  disableAssignmentCache() {
    this.assignmentCache = undefined;
  }

  useNonExpiringInMemoryAssignmentCache() {
    this.assignmentCache = new NonExpiringInMemoryAssignmentCache();
  }

  useLRUInMemoryAssignmentCache(maxSize: number) {
    this.assignmentCache = new LRUInMemoryAssignmentCache(maxSize);
  }

  // noinspection JSUnusedGlobalSymbols
  useCustomAssignmentCache(cache: AssignmentCache) {
    this.assignmentCache = cache;
  }

  disableBanditAssignmentCache() {
    this.banditAssignmentCache = undefined;
  }

  useNonExpiringInMemoryBanditAssignmentCache() {
    this.banditAssignmentCache = new NonExpiringInMemoryAssignmentCache();
  }

  /**
   * @param {number} maxSize - Maximum cache size
   * @param {number} timeout - TTL of cache entries
   */
  useExpiringInMemoryBanditAssignmentCache(maxSize: number, timeout?: number) {
    this.banditAssignmentCache = new TLRUInMemoryAssignmentCache(maxSize, timeout);
  }

  // noinspection JSUnusedGlobalSymbols
  useCustomBanditAssignmentCache(cache: AssignmentCache) {
    this.banditAssignmentCache = cache;
  }

  setIsGracefulFailureMode(gracefulFailureMode: boolean) {
    this.isGracefulFailureMode = gracefulFailureMode;
  }

  private flushQueuedEvents<T>(eventQueue: BoundedEventQueue<T>, logFunction?: (event: T) => void) {
    const eventsToFlush = eventQueue.flush();
    if (!logFunction) {
      return;
    }

    eventsToFlush.forEach((event) => {
      try {
        logFunction(event);
      } catch (error: any) {
        logger.error(`${loggerPrefix} Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private maybeLogAssignment(result: FlagEvaluation) {
    const {
      flagKey,
      format,
      subjectKey,
      allocationKey = null,
      subjectAttributes,
      variation,
      flagEvaluationDetails,
      extraLogging = {},
      entityId,
    } = result;
    const event: IAssignmentEvent = {
      ...extraLogging,
      allocation: allocationKey,
      experiment: allocationKey ? `${flagKey}-${allocationKey}` : null,
      featureFlag: flagKey,
      format,
      variation: variation?.key ?? null,
      subject: subjectKey,
      timestamp: new Date().toISOString(),
      subjectAttributes,
      metaData: this.buildLoggerMetadata(),
      evaluationDetails: flagEvaluationDetails,
      entityId,
    };

    if (variation && allocationKey) {
      // If already logged, don't log again
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
      } else {
        // assignment logger may be null while waiting for initialization, queue up events (up to a max)
        // to be flushed when set
        this.assignmentEventsQueue.push(event);
      }
      this.assignmentCache?.set({
        flagKey,
        subjectKey,
        allocationKey: allocationKey ?? '__eppo_no_allocation',
        variationKey: variation?.key ?? '__eppo_no_variation',
      });
    } catch (error: any) {
      logger.error(`${loggerPrefix} Error logging assignment event: ${error.message}`);
    }
  }

  private buildLoggerMetadata(): Record<string, unknown> {
    return {
      obfuscated:
        this.getConfiguration()?.getFlagsConfiguration()?.response.format === FormatEnum.CLIENT,
      sdkLanguage: 'javascript',
      sdkLibVersion: LIB_VERSION,
    };
  }

  private computeBanditsForFlags(
    config: Configuration,
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    banditActions: Record<FlagKey, BanditActions>,
    flags: Record<FlagKey, PrecomputedFlag>,
  ): Record<FlagKey, IPrecomputedBandit> {
    const banditResults: Record<FlagKey, IPrecomputedBandit> = {};

    Object.keys(banditActions).forEach((flagKey: string) => {
      // First, check how the flag evaluated.
      const flagVariation = flags[flagKey];
      if (flagVariation) {
        // Precompute a bandit, if there is one matching this variation.
        const precomputedResult = this.getPrecomputedBandit(
          config,
          flagKey,
          flagVariation.variationValue,
          subjectKey,
          subjectAttributes,
          banditActions[flagKey],
        );
        if (precomputedResult) {
          banditResults[flagKey] = precomputedResult;
        }
      }
    });
    return banditResults;
  }

  private getPrecomputedBandit(
    config: Configuration,
    flagKey: string,
    variationValue: string,
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    banditActions: BanditActions,
  ): IPrecomputedBandit | null {
    const bandit = config.getFlagVariationBandit(flagKey, variationValue);
    if (!bandit) {
      return null;
    }

    const result = this.evaluateBanditAction(
      flagKey,
      subjectKey,
      subjectAttributes,
      banditActions,
      bandit.modelData,
    );

    return result
      ? {
          banditKey: bandit.banditKey,
          action: result.actionKey,
          actionNumericAttributes: result.actionAttributes.numericAttributes,
          actionCategoricalAttributes: result.actionAttributes.categoricalAttributes,
          actionProbability: result.actionWeight,
          modelVersion: bandit.modelVersion,
          optimalityGap: result.optimalityGap,
        }
      : null;
  }
}

export function checkTypeMatch(expectedType?: VariationType, actualType?: VariationType): boolean {
  return expectedType === undefined || actualType === expectedType;
}

export function checkValueTypeMatch(
  expectedType: VariationType | undefined,
  value: ValueType,
): boolean {
  if (expectedType == undefined) {
    return true;
  }

  switch (expectedType) {
    case VariationType.STRING:
      return typeof value === 'string';
    case VariationType.BOOLEAN:
      return typeof value === 'boolean';
    case VariationType.INTEGER:
      return typeof value === 'number' && Number.isInteger(value);
    case VariationType.NUMERIC:
      return typeof value === 'number';
    case VariationType.JSON:
      // note: converting to object downstream
      return typeof value === 'string';
    default:
      return false;
  }
}

class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer!));
}
