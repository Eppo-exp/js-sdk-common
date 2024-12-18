import { Allocation, Variation, VariationType } from './interfaces';
import { Rule } from './rules';

export const flagEvaluationCodes = [
  'MATCH',
  'FLAG_UNRECOGNIZED_OR_DISABLED',
  'TYPE_MISMATCH',
  'ASSIGNMENT_ERROR',
  'DEFAULT_ALLOCATION_NULL',
  'NO_ACTIONS_SUPPLIED_FOR_BANDIT',
  'BANDIT_ERROR',
] as const;

export type FlagEvaluationCode = (typeof flagEvaluationCodes)[number];

export enum AllocationEvaluationCode {
  UNEVALUATED = 'UNEVALUATED',
  MATCH = 'MATCH',
  BEFORE_START_TIME = 'BEFORE_START_TIME',
  TRAFFIC_EXPOSURE_MISS = 'TRAFFIC_EXPOSURE_MISS',
  AFTER_END_TIME = 'AFTER_END_TIME',
  FAILING_RULE = 'FAILING_RULE',
}

export interface AllocationEvaluation {
  key: string;
  allocationEvaluationCode: AllocationEvaluationCode;
  orderPosition: number;
}

export interface IFlagEvaluationDetails {
  environmentName: string;
  flagEvaluationCode: FlagEvaluationCode;
  flagEvaluationDescription: string;
  variationKey: string | null;
  variationValue: Variation['value'] | null;
  banditKey: string | null;
  banditAction: string | null;
  configFetchedAt: string;
  configPublishedAt: string;
  matchedRule: Rule | null;
  matchedAllocation: AllocationEvaluation | null;
  unmatchedAllocations: Array<AllocationEvaluation>;
  unevaluatedAllocations: Array<AllocationEvaluation>;
}

export class FlagEvaluationDetailsBuilder {
  private variationKey: IFlagEvaluationDetails['variationKey'] = null;
  private variationValue: IFlagEvaluationDetails['variationValue'] = null;
  private matchedRule: IFlagEvaluationDetails['matchedRule'] = null;
  private matchedAllocation: IFlagEvaluationDetails['matchedAllocation'] = null;
  private readonly unmatchedAllocations: IFlagEvaluationDetails['unmatchedAllocations'] = [];

  constructor(
    private readonly environmentName: string,
    private readonly allocations: Allocation[],
    private readonly configFetchedAt: string,
    private readonly configPublishedAt: string,
  ) {
    this.setNone();
  }

  addUnmatchedAllocation = (allocationEvaluation: AllocationEvaluation) => {
    this.unmatchedAllocations.push(allocationEvaluation);
  };

  setNone = (): FlagEvaluationDetailsBuilder => {
    this.variationKey = null;
    this.variationValue = null;
    this.matchedRule = null;
    this.matchedAllocation = null;
    return this;
  };

  setMatch = (
    indexPosition: number,
    variation: Variation,
    allocation: Allocation,
    matchedRule: Rule | null,
    expectedVariationType: VariationType | undefined,
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = variation.key;
    // variation.value needs to be parsed into a JSON object if the variation type is JSON
    // or else it will just remain a string
    this.variationValue =
      expectedVariationType === VariationType.JSON && typeof variation.value === 'string'
        ? JSON.parse(variation.value)
        : variation.value;
    this.matchedRule = matchedRule;
    this.matchedAllocation = {
      key: allocation.key,
      allocationEvaluationCode: AllocationEvaluationCode.MATCH,
      orderPosition: indexPosition + 1, // orderPosition is 1-indexed to match UI
    };
    return this;
  };

  buildForNoneResult = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): IFlagEvaluationDetails => this.setNone().build(flagEvaluationCode, flagEvaluationDescription);

  build = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): IFlagEvaluationDetails => ({
    environmentName: this.environmentName,
    flagEvaluationCode,
    flagEvaluationDescription,
    variationKey: this.variationKey,
    variationValue: this.variationValue,
    banditKey: null, // gets set downstream if applicable
    banditAction: null, // gets set downstream if applicable
    configFetchedAt: this.configFetchedAt,
    configPublishedAt: this.configPublishedAt,
    matchedRule: this.matchedRule,
    matchedAllocation: this.matchedAllocation,
    unmatchedAllocations: this.unmatchedAllocations,
    unevaluatedAllocations: this.calculateUnevaluatedAllocations(),
  });

  gracefulBuild = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): IFlagEvaluationDetails | null => {
    try {
      return this.build(flagEvaluationCode, flagEvaluationDescription);
    } catch (err) {
      return null;
    }
  };

  private calculateUnevaluatedAllocations = (): Array<AllocationEvaluation> => {
    const unevaluatedStartIndex = this.matchedAllocation
      ? this.unmatchedAllocations.length + 1
      : this.unmatchedAllocations.length;
    const unevaluatedStartOrderPosition = unevaluatedStartIndex + 1; // orderPosition is 1-indexed to match UI
    return this.allocations.slice(unevaluatedStartIndex).map(
      (allocation, i) =>
        ({
          key: allocation.key,
          allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
          orderPosition: unevaluatedStartOrderPosition + i,
        } as AllocationEvaluation),
    );
  };
}
