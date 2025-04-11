import * as fs from 'fs';

import {
  IAssignmentTestCase,
  MOCK_UFC_RESPONSE_FILE,
  readMockUfcConfiguration,
  readMockUFCResponse,
} from '../../test/testHelpers';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { AllocationEvaluationCode } from '../flag-evaluation-details-builder';
import { Flag, ObfuscatedFlag, Variation, VariationType } from '../interfaces';
import { OperatorType } from '../rules';
import { AttributeType } from '../types';

import EppoClient, { IAssignmentDetails } from './eppo-client';
import { initConfiguration } from './test-utils';
import { read } from 'fs';

describe('EppoClient get*AssignmentDetails', () => {
  const testStart = Date.now();

  let client: EppoClient;

  beforeEach(() => {
    client = new EppoClient({
      sdkKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '1.0.0',
      baseUrl: 'http://127.0.0.1:4000',
      configuration: { initialConfiguration: readMockUfcConfiguration() },
    });
    client.setIsGracefulFailureMode(false);
  });

  it('should set the details for a matched rule', () => {
    const subjectAttributes = { email: 'alice@mycompany.com', country: 'US' };
    const result = client.getIntegerAssignmentDetails(
      'integer-flag',
      'alice',
      subjectAttributes,
      0,
    );
    const expected: IAssignmentDetails<number> = {
      variation: 3,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        variationKey: 'three',
        variationValue: 3,
        banditKey: null,
        banditAction: null,
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'Supplied attributes match rules defined in allocation "targeted allocation".',
        configFetchedAt: expect.any(String),
        configPublishedAt: '2024-04-17T19:40:53.716Z',
        matchedRule: {
          conditions: [
            {
              attribute: 'country',
              operator: OperatorType.ONE_OF,
              value: ['US', 'Canada', 'Mexico'],
            },
          ],
        },
        matchedAllocation: {
          key: 'targeted allocation',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 1,
        },
        unmatchedAllocations: [],
        unevaluatedAllocations: [
          {
            key: '50/50 split',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 2,
          },
        ],
      },
    };
    expect(Date.parse(result.evaluationDetails.configFetchedAt)).toBeGreaterThanOrEqual(testStart);
    expect(result).toEqual(expected);
  });

  it('should set the details for a matched split', () => {
    const subjectAttributes = { email: 'alice@mycompany.com', country: 'Brazil' };
    const result = client.getIntegerAssignmentDetails(
      'integer-flag',
      'alice',
      subjectAttributes,
      0,
    );
    const expected: IAssignmentDetails<number> = {
      variation: 2,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        variationKey: 'two',
        variationValue: 2,
        banditKey: null,
        banditAction: null,
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'alice belongs to the range of traffic assigned to "two" defined in allocation "50/50 split".',
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: null,
        matchedAllocation: {
          key: '50/50 split',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 2,
        },
        unmatchedAllocations: [
          {
            key: 'targeted allocation',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 1,
          },
        ],
        unevaluatedAllocations: [],
      },
    };
    expect(result).toEqual(expected);
  });

  it('should handle matching a split allocation with a matched rule', () => {
    const subjectAttributes = { id: 'alice', email: 'alice@external.com', country: 'Brazil' };
    const result = client.getStringAssignmentDetails(
      'new-user-onboarding',
      'alice',
      subjectAttributes,
      '',
    );
    const expected: IAssignmentDetails<string> = {
      variation: 'control',
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'Supplied attributes match rules defined in allocation "experiment" and alice belongs to the range of traffic assigned to "control".',
        variationKey: 'control',
        variationValue: 'control',
        banditKey: null,
        banditAction: null,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: {
          conditions: [
            {
              attribute: 'country',
              operator: OperatorType.NOT_ONE_OF,
              value: ['US', 'Canada', 'Mexico'],
            },
          ],
        },
        matchedAllocation: {
          key: 'experiment',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 3,
        },
        unmatchedAllocations: [
          {
            key: 'id rule',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 1,
          },
          {
            key: 'internal users',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 2,
          },
        ],
        unevaluatedAllocations: [
          {
            key: 'rollout',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 4,
          },
        ],
      },
    };
    expect(result).toEqual(expected);
  });

  it('should handle unrecognized flags', () => {
    const result = client.getIntegerAssignmentDetails('asdf', 'alice', {}, 0);
    expect(result).toEqual({
      variation: 0,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        flagEvaluationCode: 'FLAG_UNRECOGNIZED_OR_DISABLED',
        flagEvaluationDescription: 'Unrecognized or disabled flag: asdf',
        variationKey: null,
        variationValue: null,
        banditKey: null,
        banditAction: null,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: null,
        matchedAllocation: null,
        unmatchedAllocations: [],
        unevaluatedAllocations: [],
      },
    } as IAssignmentDetails<number>);
  });

  it('should handle type mismatches with graceful failure mode enabled', () => {
    client.setIsGracefulFailureMode(true);
    const result = client.getBooleanAssignmentDetails('integer-flag', 'alice', {}, true);
    expect(result).toEqual({
      variation: true,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        flagEvaluationCode: 'TYPE_MISMATCH',
        flagEvaluationDescription:
          'Variation value does not have the correct type. Found INTEGER, but expected BOOLEAN for flag integer-flag',
        variationKey: null,
        variationValue: null,
        banditKey: null,
        banditAction: null,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: null,
        matchedAllocation: null,
        unmatchedAllocations: [],
        unevaluatedAllocations: [
          {
            key: 'targeted allocation',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 1,
          },
          {
            key: '50/50 split',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 2,
          },
        ],
      },
    } as IAssignmentDetails<boolean>);
  });

  it('should throw an error for type mismatches with graceful failure mode disabled', () => {
    client.setIsGracefulFailureMode(false);
    expect(() => client.getBooleanAssignmentDetails('integer-flag', 'alice', {}, true)).toThrow();
  });

  describe('UFC General Test Cases', () => {
    const testStart = Date.now();

    const getTestFilePaths = () => {
      const testDir = 'test/data/ufc/tests';
      return fs.readdirSync(testDir).map((testFilename) => `${testDir}/${testFilename}`);
    };

    const parseJSON = (testFilePath: string) => {
      try {
        const fileContents = fs.readFileSync(testFilePath, 'utf-8');
        const parsedJSON = JSON.parse(fileContents);
        return parsedJSON as IAssignmentTestCase;
      } catch (err) {
        console.error(`failed to parse JSON in ${testFilePath}`);
        console.error(err);
        process.exit(1);
      }
    };

    describe.each(getTestFilePaths())('for file: %s', (testFilePath: string) => {
      const testCase = parseJSON(testFilePath);
      describe.each(testCase.subjects.map(({ subjectKey }) => subjectKey))(
        'with subjectKey %s',
        (subjectKey) => {
          const { flag, variationType, defaultValue, subjects } = testCase;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const subject = subjects.find((subject) => subject.subjectKey === subjectKey)!;

          const focusOn = {
            testFilePath: '', // focus on test file paths (don't forget to set back to empty string!)
            subjectKey: '', // focus on subject (don't forget to set back to empty string!)
          };

          const shouldRunTestForFilePath =
            !focusOn.testFilePath || focusOn.testFilePath === testFilePath;

          const shouldRunTestForSubject = !focusOn.subjectKey || focusOn.subjectKey === subjectKey;

          if (shouldRunTestForFilePath && shouldRunTestForSubject) {
            it('handles variation assignment details', async () => {
              const typeAssignmentDetailsFunctions = {
                [VariationType.BOOLEAN]: client.getBooleanAssignmentDetails.bind(client),
                [VariationType.NUMERIC]: client.getNumericAssignmentDetails.bind(client),
                [VariationType.INTEGER]: client.getIntegerAssignmentDetails.bind(client),
                [VariationType.STRING]: client.getStringAssignmentDetails.bind(client),
                [VariationType.JSON]: client.getJSONAssignmentDetails.bind(client),
              };
              const assignmentFn = typeAssignmentDetailsFunctions[variationType] as (
                flagKey: string,
                subjectKey: string,
                subjectAttributes: Record<string, AttributeType>,
                defaultValue: boolean | string | number | object,
              ) => IAssignmentDetails<boolean | string | number | object>;
              if (!assignmentFn) {
                throw new Error(`Unknown variation type: ${variationType}`);
              }
              const result: IAssignmentDetails<Variation['value'] | object> = assignmentFn(
                flag,
                subject.subjectKey,
                subject.subjectAttributes,
                defaultValue,
              );
              expect(result.variation).toEqual(subject.assignment);
              expect(result.evaluationDetails).toEqual({
                ...subject.evaluationDetails,
                configFetchedAt: expect.any(String),
                configPublishedAt: expect.any(String),
              });
              expect(result.evaluationDetails.configPublishedAt).toEqual(
                '2024-04-17T19:40:53.716Z',
              );
              expect(Date.parse(result.evaluationDetails.configFetchedAt)).toBeGreaterThanOrEqual(
                testStart,
              );
            });
          }
        },
      );
    });
  });
});
