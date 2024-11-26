import { checkValueTypeMatch } from './client/eppo-client';
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
  ConfigDetails,
} from './interfaces';
import { Rule, matchesRule } from './rules';
import { MD5Sharder, Sharder } from './sharders';
import { Attributes } from './types';

export interface FlagEvaluationWithoutDetails {
  flagKey: string;
  format: string;
  subjectKey: string;
  subjectAttributes: Attributes;
  allocationKey: string | null;
  variation: Variation | null;
  extraLogging: Record<string, string>;
  // whether to log assignment event
  doLog: boolean;
}

export interface FlagEvaluation extends FlagEvaluationWithoutDetails {
  flagEvaluationDetails: IFlagEvaluationDetails;
}

export class Evaluator {
  private readonly sharder: Sharder;

  constructor(sharder?: Sharder) {
    this.sharder = sharder ?? new MD5Sharder();
  }

  evaluateFlag(
    flag: Flag,
    configDetails: ConfigDetails,
    subjectKey: string,
    subjectAttributes: Attributes,
    obfuscated: boolean,
    expectedVariationType?: VariationType,
  ): FlagEvaluation {
    const flagEvaluationDetailsBuilder = new FlagEvaluationDetailsBuilder(
      configDetails.configEnvironment.name,
      flag.allocations,
      configDetails.configFetchedAt,
      configDetails.configPublishedAt,
    );
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
          configDetails.configFormat,
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
              return {
                flagKey: flag.key,
                format: configDetails.configFormat,
                subjectKey,
                subjectAttributes,
                allocationKey: allocation.key,
                variation,
                extraLogging: split.extraLogging ?? {},
                doLog: allocation.doLog,
                flagEvaluationDetails,
              };
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
        configDetails.configFormat,
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
    flagKey,
    format,
    subjectKey,
    subjectAttributes,
    allocationKey: null,
    variation: null,
    extraLogging: {},
    doLog: false,
    flagEvaluationDetails,
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
