import {
  ASSIGNMENT_TEST_DATA_DIR,
  IAssignmentTestCase,
  readMockUfcConfiguration,
  readMockUfcObfuscatedConfiguration,
  testCasesByFileName,
} from '../../test/testHelpers';
import { Configuration } from '../configuration';
import { VariationType } from '../interfaces';

import EppoClient from './eppo-client';

describe('SDK Test Data / assignment tests', () => {
  const testCases = testCasesByFileName<IAssignmentTestCase>(ASSIGNMENT_TEST_DATA_DIR);

  describe('Not obfuscated', () => {
    defineTestCases(readMockUfcConfiguration(), testCases);
  });

  describe('Obfuscated', () => {
    defineTestCases(readMockUfcObfuscatedConfiguration(), testCases);
  });
});

function defineTestCases(
  configuration: Configuration,
  testCases: Record<string, IAssignmentTestCase>,
) {
  let client: EppoClient;

  beforeAll(() => {
    client = new EppoClient({
      sdkKey: 'test',
      sdkName: 'test',
      sdkVersion: 'test',
      configuration: {
        initialConfiguration: configuration,
        initializationStrategy: 'none',
        enablePolling: false,
      },
    });
    client.setIsGracefulFailureMode(false);
  });

  describe.each(Object.keys(testCases))('%s', (fileName) => {
    const { flag, variationType, defaultValue, subjects } = testCases[fileName];
    test.each(subjects)('$subjectKey', (subject) => {
      let assignment: string | number | boolean | object;
      switch (variationType) {
        case VariationType.BOOLEAN:
          assignment = client.getBooleanAssignment(
            flag,
            subject.subjectKey,
            subject.subjectAttributes,
            defaultValue as boolean,
          );
          break;
        case VariationType.NUMERIC:
          assignment = client.getNumericAssignment(
            flag,
            subject.subjectKey,
            subject.subjectAttributes,
            defaultValue as number,
          );
          break;
        case VariationType.INTEGER:
          assignment = client.getIntegerAssignment(
            flag,
            subject.subjectKey,
            subject.subjectAttributes,
            defaultValue as number,
          );
          break;
        case VariationType.STRING:
          assignment = client.getStringAssignment(
            flag,
            subject.subjectKey,
            subject.subjectAttributes,
            defaultValue as string,
          );
          break;
        case VariationType.JSON:
          assignment = client.getJSONAssignment(
            flag,
            subject.subjectKey,
            subject.subjectAttributes,
            defaultValue as object,
          );
          break;
        default:
          throw new Error(`Unknown variation type: ${variationType}`);
      }

      expect(assignment).toEqual(subject.assignment);
    });
  });
}
