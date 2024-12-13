import { v4 as randomUUID } from 'uuid';

import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluation, BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';
import { LRUInMemoryAssignmentCache } from '../cache/lru-in-memory-assignment-cache';
import { NonExpiringInMemoryAssignmentCache } from '../cache/non-expiring-in-memory-cache-assignment';
import { TLRUInMemoryAssignmentCache } from '../cache/tlru-in-memory-assignment-cache';
import {
  IConfigurationWire,
  ConfigurationWireV1,
  IPrecomputedConfiguration,
  ObfuscatedPrecomputedConfiguration,
  PrecomputedConfiguration,
} from '../configuration';
import ConfigurationRequestor from '../configuration-requestor';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '../constants';
import { decodeFlag } from '../decoding';
import { EppoValue } from '../eppo_value';
import { Evaluator, FlagEvaluation, noneResult } from '../evaluator';
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
  BanditParameters,
  BanditVariation,
  ConfigDetails,
  Flag,
  IPrecomputedBandit,
  ObfuscatedFlag,
  PrecomputedFlag,
  Variation,
  VariationType,
} from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import {
  Attributes,
  AttributeType,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
  ValueType,
} from '../types';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';

export interface IAssignmentDetails<T extends Variation['value'] | object> {
  variation: T;
  action: string | null;
  evaluationDetails: IFlagEvaluationDetails;
}

export type FlagConfigurationRequestParameters = {
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

export interface IContainerExperiment<T> {
  flagKey: string;
  controlVariationEntry: T;
  treatmentVariationEntries: Array<T>;
}

export default class EppoClient {
  private eventDispatcher: EventDispatcher;
  private readonly assignmentEventsQueue: BoundedEventQueue<IAssignmentEvent> =
    new BoundedEventQueue<IAssignmentEvent>('assignments');
  private readonly banditEventsQueue: BoundedEventQueue<IBanditEvent> =
    new BoundedEventQueue<IBanditEvent>('bandit');
  private readonly banditEvaluator = new BanditEvaluator();
  private banditLogger?: IBanditLogger;
  private banditAssignmentCache?: AssignmentCache;
  private configurationRequestParameters?: FlagConfigurationRequestParameters;
  private banditModelConfigurationStore?: IConfigurationStore<BanditParameters>;
  private banditVariationConfigurationStore?: IConfigurationStore<BanditVariation[]>;
  private flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>;
  private assignmentLogger?: IAssignmentLogger;
  private assignmentCache?: AssignmentCache;
  // whether to suppress any errors and return default values instead
  private isGracefulFailureMode = true;
  private isObfuscated: boolean;
  private requestPoller?: IPoller;
  private readonly evaluator = new Evaluator();

  constructor({
    eventDispatcher = new NoOpEventDispatcher(),
    isObfuscated = false,
    flagConfigurationStore,
    banditVariationConfigurationStore,
    banditModelConfigurationStore,
    configurationRequestParameters,
  }: {
    // Dispatcher for arbitrary, application-level events (not to be confused with Eppo specific assignment
    // or bandit events). These events are application-specific and captures by EppoClient#track API.
    eventDispatcher?: EventDispatcher;
    flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>;
    banditVariationConfigurationStore?: IConfigurationStore<BanditVariation[]>;
    banditModelConfigurationStore?: IConfigurationStore<BanditParameters>;
    configurationRequestParameters?: FlagConfigurationRequestParameters;
    isObfuscated?: boolean;
  }) {
    this.eventDispatcher = eventDispatcher;
    this.flagConfigurationStore = flagConfigurationStore;
    this.banditVariationConfigurationStore = banditVariationConfigurationStore;
    this.banditModelConfigurationStore = banditModelConfigurationStore;
    this.configurationRequestParameters = configurationRequestParameters;
    this.isObfuscated = isObfuscated;
  }

  setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ) {
    this.configurationRequestParameters = configurationRequestParameters;
  }

  // noinspection JSUnusedGlobalSymbols
  setFlagConfigurationStore(flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>) {
    this.flagConfigurationStore = flagConfigurationStore;
  }

  // noinspection JSUnusedGlobalSymbols
  setBanditVariationConfigurationStore(
    banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]>,
  ) {
    this.banditVariationConfigurationStore = banditVariationConfigurationStore;
  }

  /** Sets the EventDispatcher instance to use when tracking events with {@link track}. */
  // noinspection JSUnusedGlobalSymbols
  setEventDispatcher(eventDispatcher: EventDispatcher) {
    this.eventDispatcher = eventDispatcher;
  }

  // noinspection JSUnusedGlobalSymbols
  setBanditModelConfigurationStore(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters>,
  ) {
    this.banditModelConfigurationStore = banditModelConfigurationStore;
  }

  // noinspection JSUnusedGlobalSymbols
  setIsObfuscated(isObfuscated: boolean) {
    this.isObfuscated = isObfuscated;
  }

  async fetchFlagConfigurations() {
    if (!this.configurationRequestParameters) {
      throw new Error(
        'Eppo SDK unable to fetch flag configurations without configuration request parameters',
      );
    }
    // if fetchFlagConfigurations() was previously called, stop any polling process from that call
    this.requestPoller?.stop();

    const {
      apiKey,
      sdkName,
      sdkVersion,
      baseUrl, // Default is set in ApiEndpoints constructor if undefined
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      numInitialRequestRetries = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      numPollRequestRetries = DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterSuccessfulInitialization = false,
      pollAfterFailedInitialization = false,
      throwOnFailedInitialization = false,
      skipInitialPoll = false,
    } = this.configurationRequestParameters;

    let { pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS } = this.configurationRequestParameters;
    if (pollingIntervalMs <= 0) {
      logger.error('pollingIntervalMs must be greater than 0. Using default');
      pollingIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    }

    // todo: Inject the chain of dependencies below
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams: { apiKey, sdkName, sdkVersion },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const configurationRequestor = new ConfigurationRequestor(
      httpClient,
      this.flagConfigurationStore,
      this.banditVariationConfigurationStore ?? null,
      this.banditModelConfigurationStore ?? null,
    );

    const pollingCallback = async () => {
      if (await this.flagConfigurationStore.isExpired()) {
        return configurationRequestor.fetchAndStoreConfigurations();
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

  // noinspection JSUnusedGlobalSymbols
  stopPolling() {
    if (this.requestPoller) {
      this.requestPoller.stop();
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
   * @deprecated use getBooleanAssignment instead.
   */
  getBoolAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    defaultValue: boolean,
  ): boolean {
    return this.getBooleanAssignment(flagKey, subjectKey, subjectAttributes, defaultValue);
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
    let result: string | null = null;

    const flagBanditVariations = this.banditVariationConfigurationStore?.get(flagKey);
    const banditKey = flagBanditVariations?.at(0)?.key;

    if (banditKey) {
      const banditParameters = this.getBandit(banditKey);
      if (banditParameters) {
        const contextualSubjectAttributes =
          this.ensureContextualSubjectAttributes(subjectAttributes);
        const actionsWithContextualAttributes = this.ensureActionsWithContextualAttributes(actions);

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
    let variation = defaultValue;
    let action: string | null = null;

    // Initialize with a generic evaluation details. This will mutate as the function progresses.
    let evaluationDetails: IFlagEvaluationDetails = this.newFlagEvaluationDetailsBuilder(
      flagKey,
    ).buildForNoneResult(
      'ASSIGNMENT_ERROR',
      'Unexpected error getting assigned variation for bandit action',
    );
    try {
      // Get the assigned variation for the flag with a possible bandit
      // Note for getting assignments, we don't care about context
      const nonContextualSubjectAttributes =
        this.ensureNonContextualSubjectAttributes(subjectAttributes);
      const { variation: assignedVariation, evaluationDetails: assignmentEvaluationDetails } =
        this.getStringAssignmentDetails(
          flagKey,
          subjectKey,
          nonContextualSubjectAttributes,
          defaultValue,
        );
      variation = assignedVariation;
      evaluationDetails = assignmentEvaluationDetails;

      // Check if the assigned variation is an active bandit
      // Note: the reason for non-bandit assignments include the subject being bucketed into a non-bandit variation or
      // a rollout having been done.
      const bandit = this.findBanditByVariation(flagKey, variation);
      if (bandit) {
        evaluationDetails.banditKey = bandit.banditKey;
        const banditEvaluation = this.evaluateBanditAction(
          flagKey,
          subjectKey,
          subjectAttributes,
          actions,
          bandit.modelData,
        );
        action = banditEvaluation?.actionKey ?? null;

        if (banditEvaluation !== null && action !== null) {
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

    const contextualSubjectAttributes = this.ensureContextualSubjectAttributes(subjectAttributes);
    const actionsWithContextualAttributes = this.ensureActionsWithContextualAttributes(actions);

    return this.banditEvaluator.evaluateBandit(
      flagKey,
      subjectKey,
      contextualSubjectAttributes,
      actionsWithContextualAttributes,
      banditModelData,
    );
  }

  private ensureNonContextualSubjectAttributes(
    subjectAttributes: BanditSubjectAttributes,
  ): Attributes {
    let result: Attributes;
    if (this.isInstanceOfContextualAttributes(subjectAttributes)) {
      const contextualSubjectAttributes = subjectAttributes as ContextAttributes;
      result = {
        ...contextualSubjectAttributes.numericAttributes,
        ...contextualSubjectAttributes.categoricalAttributes,
      };
    } else {
      // Attributes are non-contextual
      result = subjectAttributes as Attributes;
    }
    return result;
  }

  private ensureContextualSubjectAttributes(
    subjectAttributes: BanditSubjectAttributes,
  ): ContextAttributes {
    if (this.isInstanceOfContextualAttributes(subjectAttributes)) {
      return subjectAttributes as ContextAttributes;
    } else {
      return this.deduceAttributeContext(subjectAttributes as Attributes);
    }
  }

  private ensureActionsWithContextualAttributes(
    actions: BanditActions,
  ): Record<string, ContextAttributes> {
    let result: Record<string, ContextAttributes> = {};
    if (Array.isArray(actions)) {
      // no context
      actions.forEach((action) => {
        result[action] = { numericAttributes: {}, categoricalAttributes: {} };
      });
    } else if (!Object.values(actions).every(this.isInstanceOfContextualAttributes)) {
      // Actions have non-contextual attributes; bucket based on number or not
      Object.entries(actions).forEach(([action, attributes]) => {
        result[action] = this.deduceAttributeContext(attributes);
      });
    } else {
      // Actions already have contextual attributes
      result = actions as Record<string, ContextAttributes>;
    }
    return result;
  }

  private isInstanceOfContextualAttributes(attributes: unknown): boolean {
    return Boolean(
      typeof attributes === 'object' &&
        attributes && // exclude null
        'numericAttributes' in attributes &&
        'categoricalAttributes' in attributes,
    );
  }

  private deduceAttributeContext(attributes: Attributes): ContextAttributes {
    const contextualAttributes: ContextAttributes = {
      numericAttributes: {},
      categoricalAttributes: {},
    };
    Object.entries(attributes).forEach(([attribute, value]) => {
      const isNumeric = typeof value === 'number' && isFinite(value);
      if (isNumeric) {
        contextualAttributes.numericAttributes[attribute] = value;
      } else {
        contextualAttributes.categoricalAttributes[attribute] = value as AttributeType;
      }
    });
    return contextualAttributes;
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
      logger.error(`[Eppo SDK] Error getting assignment: ${err.message}`);
      return defaultValue ?? EppoValue.Null();
    }
    throw err;
  }

  private getAllAssignments(
    subjectKey: string,
    subjectAttributes: Attributes = {},
  ): Record<string, PrecomputedFlag> {
    const configDetails = this.getConfigDetails();
    const flagKeys = this.getFlagKeys();
    const flags: Record<string, PrecomputedFlag> = {};

    // Evaluate all the enabled flags for the user
    flagKeys.forEach((flagKey) => {
      const flag = this.getFlag(flagKey);
      if (!flag) {
        logger.debug(`[Eppo SDK] No assigned variation. Flag does not exist.`);
        return;
      }

      // Evaluate the flag for this subject.
      const evaluation = this.evaluator.evaluateFlag(
        flag,
        configDetails,
        subjectKey,
        subjectAttributes,
        this.isObfuscated,
      );

      // allocationKey is set along with variation when there is a result. this check appeases typescript below
      if (!evaluation.variation || !evaluation.allocationKey) {
        logger.debug(`[Eppo SDK] No assigned variation: ${flagKey}`);
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
   * @param banditActions
   * @param obfuscated optional whether to obfuscate the results.
   */
  getPrecomputedConfiguration(
    subjectKey: string,
    subjectAttributes: Attributes | ContextAttributes = {},
    banditActions: Record<string, BanditActions> = {},
    obfuscated = false,
  ): string {
    const configDetails = this.getConfigDetails();

    const subjectContextualAttributes = this.ensureContextualSubjectAttributes(subjectAttributes);
    const subjectFlatAttributes = this.ensureNonContextualSubjectAttributes(subjectAttributes);
    const flags = this.getAllAssignments(subjectKey, subjectFlatAttributes);

    const bandits = this.getAllBandits(
      subjectKey,
      subjectContextualAttributes,
      banditActions,
      flags,
    );

    const precomputedConfig: IPrecomputedConfiguration = obfuscated
      ? new ObfuscatedPrecomputedConfiguration(
          subjectKey,
          flags,
          bandits,
          subjectContextualAttributes,
          configDetails.configEnvironment,
        )
      : new PrecomputedConfiguration(
          subjectKey,
          flags,
          bandits,
          subjectContextualAttributes,
          configDetails.configEnvironment,
        );

    const configWire: IConfigurationWire = new ConfigurationWireV1(precomputedConfig);
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

    const flagEvaluationDetailsBuilder = this.newFlagEvaluationDetailsBuilder(flagKey);
    const configDetails = this.getConfigDetails();
    const flag = this.getFlag(flagKey);

    if (flag === null) {
      logger.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
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
        configDetails.configFormat,
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
          configDetails.configFormat,
        );
      }
      throw new TypeError(errorMessage);
    }

    if (!flag.enabled) {
      logger.info(`[Eppo SDK] No assigned variation. Flag is disabled: ${flagKey}`);
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
        configDetails.configFormat,
      );
    }

    const result = this.evaluator.evaluateFlag(
      flag,
      configDetails,
      subjectKey,
      subjectAttributes,
      this.isObfuscated,
      expectedVariationType,
    );
    if (this.isObfuscated) {
      // flag.key is obfuscated, replace with requested flag key
      result.flagKey = flagKey;
    }

    try {
      if (result?.doLog) {
        this.maybeLogAssignment(result);
      }
    } catch (error) {
      logger.error(`[Eppo SDK] Error logging assignment event: ${error}`);
    }

    return result;
  }

  /**
   * Enqueues an arbitrary event. Events must have a type and a payload.
   * TODO: enforce max message size
   */
  track(type: string, payload: Record<string, unknown>) {
    this.eventDispatcher.dispatch({
      uuid: randomUUID(),
      type,
      timestamp: new Date().getTime(),
      payload,
    });
  }

  private newFlagEvaluationDetailsBuilder(flagKey: string): FlagEvaluationDetailsBuilder {
    const flag = this.getFlag(flagKey);
    const configDetails = this.getConfigDetails();
    return new FlagEvaluationDetailsBuilder(
      configDetails.configEnvironment.name,
      flag?.allocations ?? [],
      configDetails.configFetchedAt,
      configDetails.configPublishedAt,
    );
  }

  private getConfigDetails(): ConfigDetails {
    return {
      configFetchedAt: this.flagConfigurationStore.getConfigFetchedAt() ?? '',
      configPublishedAt: this.flagConfigurationStore.getConfigPublishedAt() ?? '',
      configEnvironment: this.flagConfigurationStore.getEnvironment() ?? { name: '' },
      configFormat: this.flagConfigurationStore.getFormat() ?? '',
    };
  }

  private getFlag(flagKey: string): Flag | null {
    return this.isObfuscated
      ? this.getObfuscatedFlag(flagKey)
      : this.flagConfigurationStore.get(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): Flag | null {
    const flag: ObfuscatedFlag | null = this.flagConfigurationStore.get(
      getMD5Hash(flagKey),
    ) as ObfuscatedFlag;
    return flag ? decodeFlag(flag) : null;
  }

  private getBandit(banditKey: string): BanditParameters | null {
    // Upstreams for this SDK do not yet support obfuscating bandits, so no `isObfuscated` check here.
    return this.banditModelConfigurationStore?.get(banditKey) ?? null;
  }

  // noinspection JSUnusedGlobalSymbols
  getFlagKeys() {
    /**
     * Returns a list of all flag keys that have been initialized.
     * This can be useful to debug the initialization process.
     *
     * Note that it is generally not a good idea to preload all flag configurations.
     */
    return this.flagConfigurationStore.getKeys();
  }

  isInitialized() {
    return (
      this.flagConfigurationStore.isInitialized() &&
      (!this.banditVariationConfigurationStore ||
        this.banditVariationConfigurationStore.isInitialized()) &&
      (!this.banditModelConfigurationStore || this.banditModelConfigurationStore.isInitialized())
    );
  }

  /** @deprecated Use `setAssignmentLogger` */
  setLogger(logger: IAssignmentLogger) {
    this.setAssignmentLogger(logger);
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

  getFlagConfigurations(): Record<string, Flag> {
    return this.flagConfigurationStore.entries();
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
        logger.error(`[Eppo SDK] Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private maybeLogAssignment(result: FlagEvaluation) {
    const { flagKey, format, subjectKey, allocationKey, subjectAttributes, variation } = result;
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
      evaluationDetails: result.flagEvaluationDetails,
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

  private getAllBandits(
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    banditActions: Record<string, BanditActions>,
    flags: Record<string, PrecomputedFlag>,
  ): Record<string, Record<string, IPrecomputedBandit>> {
    const banditResults: Record<string, Record<string, IPrecomputedBandit>> = {};

    // Computing Bandits
    // The first case is easy: a flag resolves to a bandit-key for this subject; compute that bandit.
    // The second case is more involved: the flag resolves to null. On the client side, the user can now enter a bandit
    // key as the `default` variation, so we need have every bandit referenced by this flag computed and available.
    Object.keys(banditActions).forEach((flagKey: string) => {
      // First, check how the flag evaluated.
      const flagVariation = flags[flagKey];
      if (flagVariation) {
        banditResults[flagKey] ??= {};

        // First case: flag resolved to a value, check if it's a bandit and if so, compute it.
        const precomputedResult = this.getPrecomputedBandit(
          flagKey,
          flagVariation.variationValue,
          subjectKey,
          subjectAttributes,
          banditActions[flagKey],
        );
        if (precomputedResult) {
          banditResults[flagKey][flagVariation.variationValue] = precomputedResult;
        }
      } else {
        // Second case; compute all the bandits referenced by this flag.
        const banditVariations = this.banditVariationConfigurationStore?.get(flagKey);
        if (!banditVariations) {
          return;
        }
        banditResults[flagKey] = {};

        banditVariations.forEach((banditVariation: BanditVariation) => {
          const precomputedResult = this.getPrecomputedBandit(
            flagKey,
            banditVariation.variationValue,
            subjectKey,
            subjectAttributes,
            banditActions[flagKey],
          );

          if (precomputedResult) {
            banditResults[flagKey][banditVariation.variationValue] = precomputedResult;
          }
        });
      }
    });
    return banditResults;
  }

  private findBanditByVariation(flagKey: string, variationValue: string): BanditParameters | null {
    const banditVariations = this.banditVariationConfigurationStore?.get(flagKey);
    const banditKey = banditVariations?.find(
      (banditVariation) => banditVariation.variationValue === variationValue,
    )?.key;

    if (banditKey) {
      // Retrieve the model parameters for the bandit
      return this.getBandit(banditKey);
    }
    return null;
  }

  private getPrecomputedBandit(
    flagKey: string,
    variationValue: string,
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    banditActions: BanditActions,
  ): IPrecomputedBandit | null {
    const bandit = this.findBanditByVariation(flagKey, variationValue);
    if (bandit) {
      const result = this.evaluateBanditAction(
        flagKey,
        subjectKey,
        subjectAttributes,
        banditActions,
        bandit.modelData,
      );
      if (result) {
        return {
          action: result.actionKey,
          actionAttributes: result.actionAttributes,
          actionProbability: result.actionWeight,
          metaData: this.buildLoggerMetadata(),
          modelVersion: bandit.modelVersion,
          optimalityGap: result.optimalityGap,
          variation: variationValue,
        };
      }
    }
    return null;
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
