import * as fs from 'fs';

import { isEqual } from 'lodash';

import { AttributeType, ContextAttributes, IAssignmentDetails, VariationType } from '../src';
import { Configuration } from '../src/configuration';
import { IFlagEvaluationDetails } from '../src/flag-evaluation-details-builder';
import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../src/http-client';
import { Variation } from '../src/interfaces';
export const TEST_DATA_DIR = './test/data/ufc/';
export const ASSIGNMENT_TEST_DATA_DIR = TEST_DATA_DIR + 'tests/';
export const BANDIT_TEST_DATA_DIR = TEST_DATA_DIR + 'bandit-tests/';
const MOCK_UFC_FILENAME = 'flags-v1';
export const MOCK_UFC_RESPONSE_FILE = `${MOCK_UFC_FILENAME}.json`;
export const MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE = `bandit-flags-v1.json`;
export const MOCK_BANDIT_MODELS_RESPONSE_FILE = `bandit-models-v1.json`;
export const OBFUSCATED_MOCK_UFC_RESPONSE_FILE = `${MOCK_UFC_FILENAME}-obfuscated.json`;

const TEST_CONFIGURATION_WIRE_DATA_DIR = './test/data/configuration-wire/';
const MOCK_PRECOMPUTED_FILENAME = 'precomputed-v1';
export const MOCK_PRECOMPUTED_WIRE_FILE = `${MOCK_PRECOMPUTED_FILENAME}.json`;
export const MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE = `${MOCK_PRECOMPUTED_FILENAME}-deobfuscated.json`;

export type AssignmentVariationValue = Variation['value'] | object;

export interface SubjectTestCase {
  subjectKey: string;
  subjectAttributes: Record<string, AttributeType>;
  assignment: AssignmentVariationValue;
  evaluationDetails: IFlagEvaluationDetails;
}

export interface IAssignmentTestCase {
  flag: string;
  variationType: VariationType;
  defaultValue: AssignmentVariationValue;
  subjects: SubjectTestCase[];
}

export interface BanditTestCase {
  flag: string;
  defaultValue: string;
  subjects: BanditTestCaseSubject[];
}

interface BanditTestCaseSubject {
  subjectKey: string;
  subjectAttributes: ContextAttributes;
  actions: BanditTestCaseAction[];
  assignment: { variation: string; action: string | null };
}

interface BanditTestCaseAction extends ContextAttributes {
  actionKey: string;
}

export function readMockUFCResponse(
  filename: string,
): IUniversalFlagConfigResponse | IBanditParametersResponse {
  return JSON.parse(fs.readFileSync(TEST_DATA_DIR + filename, 'utf-8'));
}

export function readMockUfcConfiguration(): Configuration {
  const config = fs.readFileSync(TEST_DATA_DIR + 'flags-v1.json', 'utf-8');
  return Configuration.fromResponses({
    flags: {
      response: JSON.parse(config),
      fetchedAt: new Date().toISOString(),
    },
  });
}

export function readMockUfcObfuscatedConfiguration(): Configuration {
  const config = fs.readFileSync(TEST_DATA_DIR + 'flags-v1-obfuscated.json', 'utf-8');
  return Configuration.fromResponses({
    flags: {
      response: JSON.parse(config),
      fetchedAt: new Date().toISOString(),
    },
  });
}

export function readMockBanditsConfiguration(): Configuration {
  const flags = fs.readFileSync(TEST_DATA_DIR + 'bandit-flags-v1.json', 'utf-8');
  const bandits = fs.readFileSync(TEST_DATA_DIR + 'bandit-models-v1.json', 'utf-8');
  return Configuration.fromResponses({
    flags: {
      response: JSON.parse(flags),
      fetchedAt: new Date().toISOString(),
    },
    bandits: {
      response: JSON.parse(bandits),
      fetchedAt: new Date().toISOString(),
    },
  });
}

export function readMockConfigurationWireResponse(filename: string): string {
  return fs.readFileSync(TEST_CONFIGURATION_WIRE_DATA_DIR + filename, 'utf-8');
}

export function testCasesByFileName<T>(testDirectory: string): Record<string, T> {
  const testCasesWithFileName: Array<T & { fileName: string }> = fs
    .readdirSync(testDirectory)
    .map((fileName) => ({
      ...JSON.parse(fs.readFileSync(testDirectory + fileName, 'utf8')),
      fileName,
    }));
  if (!testCasesWithFileName.length) {
    throw new Error('No test cases at ' + testDirectory);
  }
  const mappedTestCase: Record<string, T> = {};
  testCasesWithFileName.forEach((testCaseWithFileName) => {
    mappedTestCase[testCaseWithFileName.fileName] = testCaseWithFileName;
  });

  return mappedTestCase;
}

export function getTestAssignments(
  testCase: IAssignmentTestCase,
  assignmentFn: (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: AssignmentVariationValue,
  ) => AssignmentVariationValue | IAssignmentDetails<AssignmentVariationValue>,
): {
  subject: SubjectTestCase;
  assignment: AssignmentVariationValue | IAssignmentDetails<AssignmentVariationValue>;
}[] {
  const assignments: {
    subject: SubjectTestCase;
    assignment: AssignmentVariationValue;
  }[] = [];
  for (const subject of testCase.subjects) {
    const assignment = assignmentFn(
      testCase.flag,
      subject.subjectKey,
      subject.subjectAttributes,
      testCase.defaultValue,
    );
    assignments.push({ subject, assignment });
  }
  return assignments;
}

const configCreatedAt = (
  readMockUFCResponse(MOCK_UFC_RESPONSE_FILE) as IUniversalFlagConfigResponse
).createdAt;
const testHelperInstantiationDate = new Date();

export function validateTestAssignments(
  assignments: {
    subject: SubjectTestCase;
    assignment: AssignmentVariationValue | IAssignmentDetails<AssignmentVariationValue>;
  }[],
  flag: string,
  withDetails: boolean,
  isObfuscated: boolean,
) {
  for (const { subject, assignment } of assignments) {
    let assignedVariation = assignment;
    let assignmentDetails: IFlagEvaluationDetails | null = null;
    if (
      withDetails === true &&
      typeof assignment === 'object' &&
      assignment !== null &&
      'variation' in assignment
    ) {
      assignedVariation = assignment.variation;
      assignmentDetails = assignment.evaluationDetails;
    }

    if (!isEqual(assignedVariation, subject.assignment)) {
      // More friendly error message
      console.error(
        `subject ${subject.subjectKey} was assigned ${JSON.stringify(
          assignedVariation,
          undefined,
          2,
        )} when expected ${JSON.stringify(subject.assignment, undefined, 2)} for flag ${flag}`,
      );
    }

    expect(assignedVariation).toEqual(subject.assignment);

    if (withDetails) {
      if (!assignmentDetails) {
        throw new Error('Expected assignmentDetails to be populated');
      }
      expect(assignmentDetails.environmentName).toBe(subject.evaluationDetails.environmentName);
      expect(assignmentDetails.flagEvaluationCode).toBe(
        subject.evaluationDetails.flagEvaluationCode,
      );
      expect(assignmentDetails.flagEvaluationDescription).toBe(
        subject.evaluationDetails.flagEvaluationDescription,
      );
      expect(assignmentDetails.variationKey).toBe(subject.evaluationDetails.variationKey);
      // Use toString() to handle comparing JSON
      expect(assignmentDetails.variationValue?.toString()).toBe(
        subject.evaluationDetails.variationValue?.toString(),
      );
      expect(assignmentDetails.configPublishedAt).toBe(configCreatedAt);
      // cannot do an exact match for configFetchedAt because it will change based on fetch
      expect(new Date(assignmentDetails.configFetchedAt).getTime()).toBeGreaterThan(
        testHelperInstantiationDate.getTime(),
      );

      if (!isObfuscated) {
        expect(assignmentDetails.matchedRule).toEqual(subject.evaluationDetails.matchedRule);
      } else {
        // When obfuscated, rules may be one-way hashed (e.g., for ONE_OF checks) so cannot be unobfuscated
        // Thus we'll just check that the number of conditions is equal and relay on the unobfuscated
        // tests for correctness
        expect(assignmentDetails.matchedRule?.conditions || []).toHaveLength(
          subject.evaluationDetails.matchedRule?.conditions.length || 0,
        );
      }

      expect(assignmentDetails.matchedAllocation).toEqual(
        subject.evaluationDetails.matchedAllocation,
      );
      expect(assignmentDetails.unmatchedAllocations).toEqual(
        subject.evaluationDetails.unmatchedAllocations,
      );
      expect(assignmentDetails.unevaluatedAllocations).toEqual(
        subject.evaluationDetails.unevaluatedAllocations,
      );
    }
  }
}
