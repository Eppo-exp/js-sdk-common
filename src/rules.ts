/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  valid as validSemver,
  gt as semverGt,
  lt as semverLt,
  gte as semverGte,
  lte as semverLte,
} from 'semver';

import { decodeBase64, getMD5Hash } from './obfuscation';
import { ConditionValueType } from './types';

export enum OperatorType {
  MATCHES = 'MATCHES',
  NOT_MATCHES = 'NOT_MATCHES',
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  ONE_OF = 'ONE_OF',
  NOT_ONE_OF = 'NOT_ONE_OF',
  IS_NULL = 'IS_NULL',
}

export enum ObfuscatedOperatorType {
  MATCHES = '05015086bdd8402218f6aad6528bef08',
  NOT_MATCHES = '8323761667755378c3a78e0a6ed37a78',
  GTE = '32d35312e8f24bc1669bd2b45c00d47c',
  GT = 'cd6a9bd2a175104eed40f0d33a8b4020',
  LTE = 'cc981ecc65ecf63ad1673cbec9c64198',
  LT = 'c562607189d77eb9dfb707464c1e7b0b',
  ONE_OF = '27457ce369f2a74203396a35ef537c0b',
  NOT_ONE_OF = '602f5ee0b6e84fe29f43ab48b9e1addf',
  IS_NULL = 'dbd9c38e0339e6c34bd48cafc59be388',
}

enum OperatorValueType {
  PLAIN_STRING = 'PLAIN_STRING',
  STRING_ARRAY = 'STRING_ARRAY',
  SEM_VER = 'SEM_VER',
  NUMERIC = 'NUMERIC',
}

type NumericOperator = OperatorType.GTE | OperatorType.GT | OperatorType.LTE | OperatorType.LT;

type ObfuscatedNumericOperator =
  | ObfuscatedOperatorType.GTE
  | ObfuscatedOperatorType.GT
  | ObfuscatedOperatorType.LTE
  | ObfuscatedOperatorType.LT;

type MatchesCondition = {
  operator: OperatorType.MATCHES | ObfuscatedOperatorType.MATCHES;
  attribute: string;
  value: string;
};

type NotMatchesCondition = {
  operator: OperatorType.NOT_MATCHES | ObfuscatedOperatorType.NOT_MATCHES;
  attribute: string;
  value: string;
};

type OneOfCondition = {
  operator: OperatorType.ONE_OF | ObfuscatedOperatorType.ONE_OF;
  attribute: string;
  value: string[];
};

type NotOneOfCondition = {
  operator: OperatorType.NOT_ONE_OF | ObfuscatedOperatorType.NOT_ONE_OF;
  attribute: string;
  value: string[];
};

type SemVerCondition = {
  operator: NumericOperator;
  attribute: string;
  value: string;
};

type StandardNumericCondition = {
  operator: NumericOperator;
  attribute: string;
  value: number;
};

type ObfuscatedNumericCondition = {
  operator: ObfuscatedNumericOperator;
  attribute: string;
  value: string;
};

type NumericCondition = StandardNumericCondition | ObfuscatedNumericCondition;

type StandardNullCondition = {
  operator: OperatorType.IS_NULL;
  attribute: string;
  value: boolean;
};

type ObfuscatedNullCondition = {
  operator: ObfuscatedOperatorType.IS_NULL;
  attribute: string;
  value: string;
};

type NullCondition = StandardNullCondition | ObfuscatedNullCondition;

export type Condition =
  | MatchesCondition
  | NotMatchesCondition
  | OneOfCondition
  | NotOneOfCondition
  | SemVerCondition
  | NumericCondition
  | NullCondition;

export interface Rule {
  conditions: Condition[];
}

export function matchesRule(
  rule: Rule,
  subjectAttributes: Record<string, any>,
  obfuscated: boolean,
): boolean {
  const conditionEvaluations = evaluateRuleConditions(
    subjectAttributes,
    rule.conditions,
    obfuscated,
  );
  return !conditionEvaluations.includes(false);
}

function evaluateRuleConditions(
  subjectAttributes: Record<string, any>,
  conditions: Condition[],
  obfuscated: boolean,
): boolean[] {
  return conditions.map((condition) =>
    obfuscated
      ? evaluateObfuscatedCondition(
          Object.entries(subjectAttributes).reduce(
            (accum, [key, val]) => ({ [getMD5Hash(key)]: val, ...accum }),
            {},
          ),
          condition,
        )
      : evaluateCondition(subjectAttributes, condition),
  );
}

function evaluateCondition(subjectAttributes: Record<string, any>, condition: Condition): boolean {
  const value = subjectAttributes[condition.attribute];

  if (condition.operator === OperatorType.IS_NULL) {
    if (condition.value) {
      return value === null || value === undefined;
    }
    return value !== null && value !== undefined;
  }

  if (value != null) {
    switch (condition.operator) {
      case OperatorType.GTE:
      case OperatorType.GT:
      case OperatorType.LTE:
      case OperatorType.LT: {
        const conditionValueType = targetingRuleConditionValuesTypesFromValues(condition.value);
        if (conditionValueType === OperatorValueType.SEM_VER) {
          const comparator =
            condition.operator === OperatorType.GTE
              ? semverGte
              : condition.operator === OperatorType.GT
                ? semverGt
                : condition.operator === OperatorType.LTE
                  ? semverLte
                  : semverLt;
          return compareSemVer(value, condition.value, comparator);
        }

        const comparator = (a: number, b: number) =>
          condition.operator === OperatorType.GTE
            ? a >= b
            : condition.operator === OperatorType.GT
              ? a > b
              : condition.operator === OperatorType.LTE
                ? a <= b
                : a < b;
        return compareNumber(value, condition.value, comparator);
      }
      case OperatorType.MATCHES:
        return new RegExp(condition.value as string).test(value as string);
      case OperatorType.NOT_MATCHES:
        return !new RegExp(condition.value as string).test(value as string);
      case OperatorType.ONE_OF:
        return isOneOf(value.toString(), condition.value);
      case OperatorType.NOT_ONE_OF:
        return isNotOneOf(value.toString(), condition.value);
    }
  }
  return false;
}

function evaluateObfuscatedCondition(
  hashedSubjectAttributes: Record<string, any>,
  condition: Condition,
): boolean {
  const value = hashedSubjectAttributes[condition.attribute];

  if (condition.operator === ObfuscatedOperatorType.IS_NULL) {
    if (condition.value === getMD5Hash('true')) {
      return value === null || value === undefined;
    }
    return value !== null && value !== undefined;
  }

  if (value != null) {
    switch (condition.operator) {
      case ObfuscatedOperatorType.GTE:
      case ObfuscatedOperatorType.GT:
      case ObfuscatedOperatorType.LTE:
      case ObfuscatedOperatorType.LT: {
        const conditionValue = decodeBase64(condition.value);
        const conditionValueType = targetingRuleConditionValuesTypesFromValues(conditionValue);
        if (conditionValueType === OperatorValueType.SEM_VER) {
          const comparator =
            condition.operator === ObfuscatedOperatorType.GTE
              ? semverGte
              : condition.operator === ObfuscatedOperatorType.GT
                ? semverGt
                : condition.operator === ObfuscatedOperatorType.LTE
                  ? semverLte
                  : semverLt;
          return compareSemVer(value, conditionValue, comparator);
        }

        const comparator = (a: number, b: number) =>
          condition.operator === ObfuscatedOperatorType.GTE
            ? a >= b
            : condition.operator === ObfuscatedOperatorType.GT
              ? a > b
              : condition.operator === ObfuscatedOperatorType.LTE
                ? a <= b
                : a < b;
        return compareNumber(value, Number(conditionValue), comparator);
      }
      case ObfuscatedOperatorType.MATCHES:
        return new RegExp(decodeBase64(condition.value as string)).test(value as string);
      case ObfuscatedOperatorType.NOT_MATCHES:
        return !new RegExp(decodeBase64(condition.value as string)).test(value as string);
      case ObfuscatedOperatorType.ONE_OF:
        return isOneOf(getMD5Hash(value.toString()), condition.value);
      case ObfuscatedOperatorType.NOT_ONE_OF:
        return isNotOneOf(getMD5Hash(value.toString()), condition.value);
    }
  }
  return false;
}

function isOneOf(attributeValue: string, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue, conditionValue).length > 0;
}

function isNotOneOf(attributeValue: string, conditionValue: string[]) {
  return getMatchingStringValues(attributeValue, conditionValue).length === 0;
}

function getMatchingStringValues(attributeValue: string, conditionValues: string[]): string[] {
  return conditionValues.filter((value) => value === attributeValue);
}

function compareNumber(
  attributeValue: any,
  conditionValue: any,
  compareFn: (a: number, b: number) => boolean,
): boolean {
  return compareFn(Number(attributeValue), Number(conditionValue));
}

function compareSemVer(
  attributeValue: any,
  conditionValue: any,
  compareFn: (a: string, b: string) => boolean,
): boolean {
  return (
    !!validSemver(attributeValue) &&
    !!validSemver(conditionValue) &&
    compareFn(attributeValue, conditionValue)
  );
}

function targetingRuleConditionValuesTypesFromValues(value: ConditionValueType): OperatorValueType {
  // Check if input is a number
  if (typeof value === 'number') {
    return OperatorValueType.NUMERIC;
  }

  if (Array.isArray(value)) {
    return OperatorValueType.STRING_ARRAY;
  }

  // Check if input is a string that represents a SemVer
  if (typeof value === 'string' && validSemver(value)) {
    return OperatorValueType.SEM_VER;
  }

  // Check if input is a string that represents a number
  if (!isNaN(Number(value))) {
    return OperatorValueType.NUMERIC;
  }

  // If none of the above, it's a general string
  return OperatorValueType.PLAIN_STRING;
}
