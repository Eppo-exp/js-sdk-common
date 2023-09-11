import * as md5 from 'md5';

import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { IAllocation } from '../dto/allocation-dto';
import { IExperimentConfiguration } from '../dto/experiment-configuration-dto';
import { EppoValue, ValueType } from '../eppo_value';
import { findMatchingRule } from '../rule_evaluator';
import { getShard, isShardInRange } from '../shard';
import { validateNotBlank } from '../validation';

/**
 * Client for assigning experiment variations.
 * @public
 */
export interface IEppoClient {
  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param flagKey feature flag identifier
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @param assignmentHooks optional interface for pre and post assignment hooks
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;

  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param flagKey feature flag identifier
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getStringAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): boolean | null;

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): number | null;

  getJSONAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;
}

export default class EppoClient implements IEppoClient {
  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger: IAssignmentLogger | undefined;

  constructor(private configurationStore: IConfigurationStore) { }

  public getAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
  ): string | null {
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      ValueType.StringType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (assignment !== null)
      this.logAssignment(flagKey, assignment, subjectKey, subjectAttributes);

    return assignment?.stringValue ?? null;
  }

  public getStringAssignment(
    subjectKey: string,
    flagKey: string,
    subjectAttributes: Record<string, EppoValue> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
  ): string | null {
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      ValueType.StringType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (assignment !== null)
      this.logAssignment(flagKey, assignment, subjectKey, subjectAttributes);

    return assignment?.stringValue ?? null;
  }

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    subjectAttributes: Record<string, EppoValue> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
  ): boolean | null {
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      ValueType.BoolType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (assignment !== null)
      this.logAssignment(flagKey, assignment, subjectKey, subjectAttributes);

    return assignment?.boolValue ?? null;
  }

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    subjectAttributes?: Record<string, EppoValue>,
    assignmentHooks?: IAssignmentHooks | undefined,
  ): number | null {
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      ValueType.NumericType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (assignment !== null)
      this.logAssignment(flagKey, assignment, subjectKey, subjectAttributes,);

    return assignment?.numericValue ?? null;
  }

  public getJSONAssignment(
    subjectKey: string,
    flagKey: string,
    subjectAttributes: Record<string, EppoValue> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
  ): string | null {
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      ValueType.StringType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (assignment !== null)
      this.logAssignment(flagKey, assignment, subjectKey, subjectAttributes);

    return assignment?.stringValue ?? null;
  }

  private getAssignmentInternal(
    subjectKey: string,
    flagKey: string,
    subjectAttributes = {},
    assignmentHooks: IAssignmentHooks | undefined,
    valueType: ValueType,
  ): { allocationKey?: string, assignment: EppoValue | null } {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const experimentConfig = this.configurationStore.get<IExperimentConfiguration>(flagKey);
    const allowListOverride = this.getSubjectVariationOverride(
      subjectKey,
      experimentConfig,
      valueType,
    );

    const nullAssignment = { assignment: null };

    if (allowListOverride) return { assignment: allowListOverride };

    // Check for disabled flag.
    if (!experimentConfig?.enabled) return nullAssignment;

    // check for overridden assignment via hook
    const overriddenAssignment = assignmentHooks?.onPreAssignment(flagKey, subjectKey);
    if (overriddenAssignment !== null && overriddenAssignment !== undefined) {
      return { assignment: overriddenAssignment };
    }

    // Attempt to match a rule from the list.
    const matchedRule = findMatchingRule(subjectAttributes || {}, experimentConfig.rules);
    if (!matchedRule) return nullAssignment;

    // Check if subject is in allocation sample.
    const allocation = experimentConfig.allocations[matchedRule.allocationKey];
    if (!this.isInExperimentSample(subjectKey, flagKey, experimentConfig, allocation))
      return nullAssignment;

    // Compute variation for subject.
    const { subjectShards } = experimentConfig;
    const { variations } = allocation;

    const shard = getShard(`assignment-${subjectKey}-${flagKey}`, subjectShards);
    const assignedVariation = variations.find((variation) =>
      isShardInRange(shard, variation.shardRange),
    )?.typedValue;

    const allocationKey = { allocationKey: matchedRule.allocationKey };

    switch (valueType) {
      case ValueType.BoolType:
        return { ...allocationKey, assignment: EppoValue.Bool(assignedVariation as boolean) };
      case ValueType.NumericType:
        return { ...allocationKey, assignment: EppoValue.Numeric(assignedVariation as number) };
      case ValueType.StringType:
        return { ...allocationKey, assignment: EppoValue.String(assignedVariation as string) };
      default:
        return nullAssignment;
    }
  }

  public setLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    this.flushQueuedEvents(); // log any events that may have been queued while initializing
  }

  private flushQueuedEvents() {
    const eventsToFlush = this.queuedEvents;
    this.queuedEvents = [];
    try {
      for (const event of eventsToFlush) {
        this.assignmentLogger?.logAssignment(event);
      }
    } catch (error) {
      console.error(`[Eppo SDK] Error flushing assignment events: ${error.message}`);
    }
  }

  private logAssignment(
    flagKey: string,
    variation: EppoValue,
    subjectKey: string,
    subjectAttributes: Record<string, EppoValue> | undefined = {},
  ) {
    const event: IAssignmentEvent = {
      allocation: flagKey,
      experiment: flagKey,
      featureFlag: flagKey,
      variation: variation.toString(), // return the string representation to the logging callback
      timestamp: new Date().toISOString(),
      subject: subjectKey,
      subjectAttributes,
    };
    // assignment logger may be null while waiting for initialization
    if (this.assignmentLogger == null) {
      this.queuedEvents.length < MAX_EVENT_QUEUE_SIZE && this.queuedEvents.push(event);
      return;
    }
    try {
      this.assignmentLogger.logAssignment(event);
    } catch (error) {
      console.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }

  private getSubjectVariationOverride(
    subjectKey: string,
    experimentConfig: IExperimentConfiguration,
    valueType: ValueType,
  ): EppoValue | null {
    const subjectHash = md5(subjectKey);
    const overridden =
      experimentConfig?.typedOverrides && experimentConfig.typedOverrides[subjectHash];
    if (overridden) {
      switch (valueType) {
        case ValueType.BoolType:
          return EppoValue.Bool(overridden as unknown as boolean);
        case ValueType.NumericType:
          return EppoValue.Numeric(overridden as unknown as number);
        case ValueType.StringType:
          return EppoValue.String(overridden as string);
        default:
          return null;
      }
    }

    return null;
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subjectKey: string,
    flagKey: string,
    experimentConfig: IExperimentConfiguration,
    allocation: IAllocation,
  ): boolean {
    const { subjectShards } = experimentConfig;
    const { percentExposure } = allocation;
    const shard = getShard(`exposure-${subjectKey}-${flagKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
