import * as fs from 'fs';

import { isEqual } from 'lodash';

import { AttributeType, ContextAttributes, IAssignmentDetails, VariationType } from '../src';
import { IFlagEvaluationDetails } from '../src/flag-evaluation-details-builder';
import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../src/http-client';
import { Configuration } from '../src/configuration';
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

export interface SubjectTestCase {
  subjectKey: string;
  subjectAttributes: Record<string, AttributeType>;
  assignment: string | number | boolean | object;
  evaluationDetails: IFlagEvaluationDetails;
}

export interface IAssignmentTestCase {
  flag: string;
  variationType: VariationType;
  defaultValue: string | number | boolean | object;
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
    defaultValue: string | number | boolean | object,
  ) => string | number | boolean | object,
): { subject: SubjectTestCase; assignment: string | boolean | number | null | object }[] {
  const assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | null | object;
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

export function getTestAssignmentDetails(
  testCase: IAssignmentTestCase,
  assignmentDetailsFn: (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string | number | boolean | object,
  ) => IAssignmentDetails<string | boolean | number | object>,
): {
  subject: SubjectTestCase;
  assignmentDetails: IAssignmentDetails<string | boolean | number | object>;
}[] {
  return testCase.subjects.map((subject) => ({
    subject,
    assignmentDetails: assignmentDetailsFn(
      testCase.flag,
      subject.subjectKey,
      subject.subjectAttributes,
      testCase.defaultValue,
    ),
  }));
}

export function validateTestAssignments(
  assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | object | null;
  }[],
  flag: string,
) {
  for (const { subject, assignment } of assignments) {
    if (!isEqual(assignment, subject.assignment)) {
      // More friendly error message
      console.error(
        `subject ${subject.subjectKey} was assigned ${JSON.stringify(
          assignment,
          undefined,
          2,
        )} when expected ${JSON.stringify(subject.assignment, undefined, 2)} for flag ${flag}`,
      );
    }

    expect(assignment).toEqual(subject.assignment);
  }
}
