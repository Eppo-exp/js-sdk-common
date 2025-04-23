import { checkValueTypeMatch } from './client/eppo-client';
import { Configuration } from './configuration';
import {
  AllocationEvaluationCode,
  IFlagEvaluationDetails,
  FlagEvaluationDetailsBuilder,
  FlagEvaluationCode,
} from './flag-evaluation-details-builder';
import { FlagEvaluationError } from './flag-evaluation-error';
import {
  Flag,
  Shard,
  Range,
  Variation,
  Allocation,
  Split,
  VariationType,
  FormatEnum,
} from './interfaces';
import { Rule, matchesRule } from './rules';
import { MD5Sharder, Sharder } from './sharders';
import { Attributes } from './types';
import { IAssignmentEvent } from './assignment-logger';
import { IBanditEvent } from './bandit-logger';
import { LIB_VERSION } from './version';

export interface AssignmentResult {
  flagKey: string;
  format: string;
  subjectKey: string;
  subjectAttributes: Attributes;
  allocationKey: string | null;
  variation: Variation | null;
  extraLogging: Record<string, string>;
  doLog: boolean;
  entityId: number | null;
  evaluationDetails: IFlagEvaluationDetails;
}

export interface FlagEvaluation {
  assignmentDetails: AssignmentResult;
  assignmentEvent?: IAssignmentEvent;
  banditEvent?: IBanditEvent;
}

export class Evaluator {
  private readonly sharder: Sharder;
  private readonly sdkName: string;
  private readonly sdkVersion: string;

  constructor(options?: { sharder?: Sharder; sdkName?: string; sdkVersion?: string }) {
    this.sharder = options?.sharder ?? new MD5Sharder();
    this.sdkName = options?.sdkName ?? '';
    this.sdkVersion = options?.sdkVersion ?? '';
  }

  evaluateFlag(
    configuration: Configuration,
    flag: Flag,
    subjectKey: string,
    subjectAttributes: Attributes,
    expectedVariationType?: VariationType,
  ): FlagEvaluation {
    const flagsConfig = configuration.getFlagsConfiguration();
    const flagEvaluationDetailsBuilder = new FlagEvaluationDetailsBuilder(
      flagsConfig?.response.environment.name ?? '',
      flag.allocations,
      flagsConfig?.fetchedAt ?? '',
      flagsConfig?.response.createdAt ?? '',
    );
    const configFormat = flagsConfig?.response.format;
    const obfuscated = configFormat !== FormatEnum.SERVER;
    try {
      if (!flag.enabled) {
        return noneResult(
          flag.key,
          subjectKey,
          subjectAttributes,
          flagEvaluationDetailsBuilder.buildForNoneResult(
            'FLAG_UNRECOGNIZED_OR_DISABLED',
            `Unrecognized or disabled flag: ${flag.key}`,
          ),
          configFormat ?? '',
        );
      }

      const now = new Date();
      for (let i = 0; i < flag.allocations.length; i++) {
        const allocation = flag.allocations[i];
        const addUnmatchedAllocation = (code: AllocationEvaluationCode) => {
          flagEvaluationDetailsBuilder.addUnmatchedAllocation({
            key: allocation.key,
            allocationEvaluationCode: code,
            orderPosition: i + 1,
          });
        };

        if (allocation.startAt && now < new Date(allocation.startAt)) {
          addUnmatchedAllocation(AllocationEvaluationCode.BEFORE_START_TIME);
          continue;
        }
        if (allocation.endAt && now > new Date(allocation.endAt)) {
          addUnmatchedAllocation(AllocationEvaluationCode.AFTER_END_TIME);
          continue;
        }
        const { matched, matchedRule } = matchesRules(
          allocation?.rules ?? [],
          { id: subjectKey, ...subjectAttributes },
          obfuscated,
        );
        if (matched) {
          for (const split of allocation.splits) {
            if (
              split.shards.every((shard) => this.matchesShard(shard, subjectKey, flag.totalShards))
            ) {
              const variation = flag.variations[split.variationKey];
              const { flagEvaluationCode, flagEvaluationDescription } =
                this.getMatchedEvaluationCodeAndDescription(
                  variation,
                  allocation,
                  split,
                  subjectKey,
                  expectedVariationType,
                );
              const flagEvaluationDetails = flagEvaluationDetailsBuilder
                .setMatch(i, variation, allocation, matchedRule, expectedVariationType)
                .build(flagEvaluationCode, flagEvaluationDescription);

              const assignmentDetails: AssignmentResult = {
                flagKey: flag.key,
                format: configFormat ?? '',
                subjectKey,
                subjectAttributes,
                allocationKey: allocation.key,
                variation,
                extraLogging: split.extraLogging ?? {},
                doLog: allocation.doLog,
                entityId: flag.entityId ?? null,
                evaluationDetails: flagEvaluationDetails,
              };

              const result: FlagEvaluation = { assignmentDetails };

              // Create assignment event if doLog is true
              if (allocation.doLog) {
                result.assignmentEvent = {
                  ...split.extraLogging,
                  allocation: allocation.key,
                  experiment: `${flag.key}-${allocation.key}`,
                  featureFlag: flag.key,
                  format: configFormat ?? '',
                  variation: variation?.key ?? null,
                  subject: subjectKey,
                  timestamp: new Date().toISOString(),
                  subjectAttributes,
                  metaData: {
                    obfuscated: configFormat === FormatEnum.CLIENT,
                    sdkLanguage: 'javascript',
                    sdkLibVersion: LIB_VERSION,
                    sdkName: this.sdkName,
                    sdkVersion: this.sdkVersion,
                  },
                  evaluationDetails: flagEvaluationDetails,
                  entityId: flag.entityId ?? null,
                };
              }

              return result;
            }
          }
          // matched, but does not fall within split range
          addUnmatchedAllocation(AllocationEvaluationCode.TRAFFIC_EXPOSURE_MISS);
        } else {
          addUnmatchedAllocation(AllocationEvaluationCode.FAILING_RULE);
        }
      }
      return noneResult(
        flag.key,
        subjectKey,
        subjectAttributes,
        flagEvaluationDetailsBuilder.buildForNoneResult(
          'DEFAULT_ALLOCATION_NULL',
          'No allocations matched. Falling back to "Default Allocation", serving NULL',
        ),
        configFormat ?? '',
      );
    } catch (err: any) {
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.gracefulBuild(
        'ASSIGNMENT_ERROR',
        `Assignment Error: ${err.message}`,
      );
      if (flagEvaluationDetails) {
        const flagEvaluationError = new FlagEvaluationError(err.message);
        flagEvaluationError.flagEvaluationDetails = flagEvaluationDetails;
        throw flagEvaluationError;
      }
      throw err;
    }
  }

  matchesShard(shard: Shard, subjectKey: string, totalShards: number): boolean {
    const assignedShard = this.sharder.getShard(hashKey(shard.salt, subjectKey), totalShards);
    return shard.ranges.some((range) => isInShardRange(assignedShard, range));
  }

  private getMatchedEvaluationCodeAndDescription = (
    variation: Variation,
    allocation: Allocation,
    split: Split,
    subjectKey: string,
    expectedVariationType: VariationType | undefined,
  ): {
    flagEvaluationCode: FlagEvaluationCode;
    flagEvaluationDescription: string;
  } => {
    if (!checkValueTypeMatch(expectedVariationType, variation.value)) {
      const { key: vKey, value: vValue } = variation;
      return {
        flagEvaluationCode: 'ASSIGNMENT_ERROR',
        flagEvaluationDescription: `Variation (${vKey}) is configured for type ${expectedVariationType}, but is set to incompatible value (${vValue})`,
      };
    }
    const hasDefinedRules = !!allocation.rules?.length;
    const isExperiment = allocation.splits.length > 1;
    const isPartialRollout = split.shards.length > 1;
    const isExperimentOrPartialRollout = isExperiment || isPartialRollout;

    if (hasDefinedRules && isExperimentOrPartialRollout) {
      return {
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription: `Supplied attributes match rules defined in allocation "${allocation.key}" and ${subjectKey} belongs to the range of traffic assigned to "${split.variationKey}".`,
      };
    }
    if (hasDefinedRules && !isExperimentOrPartialRollout) {
      return {
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription: `Supplied attributes match rules defined in allocation "${allocation.key}".`,
      };
    }
    return {
      flagEvaluationCode: 'MATCH',
      flagEvaluationDescription: `${subjectKey} belongs to the range of traffic assigned to "${split.variationKey}" defined in allocation "${allocation.key}".`,
    };
  };
}

export function isInShardRange(shard: number, range: Range): boolean {
  return range.start <= shard && shard < range.end;
}

export function hashKey(salt: string, subjectKey: string): string {
  return `${salt}-${subjectKey}`;
}

export function noneResult(
  flagKey: string,
  subjectKey: string,
  subjectAttributes: Attributes,
  flagEvaluationDetails: IFlagEvaluationDetails,
  format: string,
): FlagEvaluation {
  return {
    assignmentDetails: {
      flagKey,
      format,
      subjectKey,
      subjectAttributes,
      allocationKey: null,
      variation: null,
      extraLogging: {},
      doLog: false,
      entityId: null,
      evaluationDetails: flagEvaluationDetails,
    },
  };
}

export function matchesRules(
  rules: Rule[],
  subjectAttributes: Attributes,
  obfuscated: boolean,
): { matched: boolean; matchedRule: Rule | null } {
  if (!rules.length) {
    return {
      matched: true,
      matchedRule: null,
    };
  }
  let matchedRule: Rule | null = null;
  const hasMatch = rules.some((rule) => {
    const matched = matchesRule(rule, subjectAttributes, obfuscated);
    if (matched) {
      matchedRule = rule;
    }
    return matched;
  });
  return hasMatch
    ? {
        matched: true,
        matchedRule,
      }
    : {
        matched: false,
        matchedRule: null,
      };
}

export function overrideResult(
  flagKey: string,
  subjectKey: string,
  subjectAttributes: Attributes,
  overrideVariation: Variation,
  flagEvaluationDetailsBuilder: FlagEvaluationDetailsBuilder,
): FlagEvaluation {
  const overrideAllocationKey = 'override-' + overrideVariation.key;
  const flagEvaluationDetails = flagEvaluationDetailsBuilder
    .setMatch(
      0,
      overrideVariation,
      { key: overrideAllocationKey, splits: [], doLog: false },
      null,
      undefined,
    )
    .build('MATCH', 'Flag override applied');

  return {
    assignmentDetails: {
      flagKey,
      subjectKey,
      variation: overrideVariation,
      subjectAttributes,
      doLog: false,
      format: '',
      allocationKey: overrideAllocationKey,
      extraLogging: {},
      entityId: null,
      evaluationDetails: flagEvaluationDetails,
    },
  };
}
