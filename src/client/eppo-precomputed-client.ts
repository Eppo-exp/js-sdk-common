import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import { AssignmentCache } from '../cache/abstract-assignment-cache';
import ConfigurationRequestor from '../configuration-requestor';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
} from '../constants';
import { Evaluator } from '../evaluator';
import { IFlagEvaluationDetails } from '../flag-evaluation-details-builder';
import FetchHttpClient from '../http-client';
import { BanditParameters, BanditVariation, Flag, ObfuscatedFlag, Variation } from '../interfaces';
import initPoller, { IPoller } from '../poller';

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
  private readonly queuedAssignmentEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private readonly queuedBanditEvents: IBanditEvent[] = [];
  private banditLogger?: IBanditLogger;
  private isGracefulFailureMode = true;
  private assignmentCache?: AssignmentCache;
  private banditAssignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;
  private readonly evaluator = new Evaluator();
  private readonly banditEvaluator = new BanditEvaluator();

  constructor(
    private flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private banditVariationConfigurationStore?: IConfigurationStore<BanditVariation[]>,
    private banditModelConfigurationStore?: IConfigurationStore<BanditParameters>,
    private configurationRequestParameters?: FlagConfigurationRequestParameters,
  ) {}

  public setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ) {
    this.configurationRequestParameters = configurationRequestParameters;
  }

  public setFlagConfigurationStore(
    flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
  ) {
    this.flagConfigurationStore = flagConfigurationStore;
  }

  public setBanditVariationConfigurationStore(
    banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]>,
  ) {
    this.banditVariationConfigurationStore = banditVariationConfigurationStore;
  }

  public setBanditModelConfigurationStore(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters>,
  ) {
    this.banditModelConfigurationStore = banditModelConfigurationStore;
  }

  public setIsObfuscated(isObfuscated: boolean) {
    this.isObfuscated = isObfuscated;
  }

  public async fetchFlagConfigurations() {
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

  public stopPolling() {
    if (this.requestPoller) {
      this.requestPoller.stop();
    }
  }
}
