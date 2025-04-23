import {
  MOCK_PRECOMPUTED_WIRE_FILE,
  MOCK_DEOBFUSCATED_PRECOMPUTED_RESPONSE_FILE,
  readMockConfigurationWireResponse,
} from '../../test/testHelpers';
import { IAssignmentLogger } from '../assignment-logger';
import { IBanditLogger } from '../bandit-logger';
import { Configuration } from '../configuration';

import EppoClient from './eppo-client';

describe('EppoClient Precomputed Mode', () => {
  // Read both configurations for test reference
  const precomputedConfigurationWire = readMockConfigurationWireResponse(
    MOCK_PRECOMPUTED_WIRE_FILE,
  );
  const initialConfiguration = Configuration.fromString(precomputedConfigurationWire);

  let client: EppoClient;
  let mockAssignmentLogger: jest.Mocked<IAssignmentLogger>;
  let mockBanditLogger: jest.Mocked<IBanditLogger>;

  beforeEach(() => {
    mockAssignmentLogger = { logAssignment: jest.fn() } as jest.Mocked<IAssignmentLogger>;
    mockBanditLogger = { logBanditAction: jest.fn() } as jest.Mocked<IBanditLogger>;

    // Create EppoClient with precomputed configuration
    client = new EppoClient({
      sdkKey: 'test-key',
      sdkName: 'test-sdk',
      sdkVersion: '1.0.0',
      configuration: {
        initialConfiguration,
        initializationStrategy: 'none',
        enablePolling: false,
      },
    });

    client.setAssignmentLogger(mockAssignmentLogger);
    client.setBanditLogger(mockBanditLogger);
  });

  it('correctly evaluates string flag', () => {
    const result = client.getStringAssignment('string-flag', 'test-subject-key', {}, 'default');
    expect(result).toBe('red');
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('correctly evaluates boolean flag', () => {
    const result = client.getBooleanAssignment('boolean-flag', 'test-subject-key', {}, false);
    expect(result).toBe(true);
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('correctly evaluates integer flag', () => {
    const result = client.getIntegerAssignment('integer-flag', 'test-subject-key', {}, 0);
    expect(result).toBe(42);
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('correctly evaluates numeric flag', () => {
    const result = client.getNumericAssignment('numeric-flag', 'test-subject-key', {}, 0);
    expect(result).toBe(3.14);
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('correctly evaluates JSON flag', () => {
    const result = client.getJSONAssignment('json-flag', 'test-subject-key', {}, {});
    expect(result).toEqual({ key: 'value', number: 123 });
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('correctly evaluates flag with extra logging', () => {
    const result = client.getStringAssignment(
      'string-flag-with-extra-logging',
      'test-subject-key',
      {},
      'default',
    );
    expect(result).toBe('red');
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
  });

  it('logs bandit evaluation for flag with bandit data', () => {
    const banditActions = {
      show_red_button: {
        expectedConversion: 0.23,
        expectedRevenue: 15.75,
        category: 'promotion',
        placement: 'home_screen',
      },
    };

    const result = client.getBanditAction(
      'string-flag',
      'test-subject-key',
      {},
      banditActions,
      'default',
    );

    expect(result.variation).toBe('red');
    expect(result.action).toBe('show_red_button');
    expect(mockBanditLogger.logBanditAction).toHaveBeenCalledTimes(1);

    const call = mockBanditLogger.logBanditAction.mock.calls[0][0];
    expect(call.bandit).toBe('recommendation-model-v1');
    expect(call.action).toBe('show_red_button');
    expect(call.modelVersion).toBe('v2.3.1');
    expect(call.actionProbability).toBe(0.85);
    expect(call.optimalityGap).toBe(0.12);
  });

  it('returns default values for nonexistent flags', () => {
    const stringResult = client.getStringAssignment(
      'nonexistent-flag',
      'test-subject-key',
      {},
      'default-string',
    );
    expect(stringResult).toBe('default-string');

    const boolResult = client.getBooleanAssignment(
      'nonexistent-flag',
      'test-subject-key',
      {},
      true,
    );
    expect(boolResult).toBe(true);

    const intResult = client.getIntegerAssignment('nonexistent-flag', 'test-subject-key', {}, 100);
    expect(intResult).toBe(100);
  });

  it('correctly handles assignment details', () => {
    const details = client.getStringAssignmentDetails(
      'string-flag',
      'test-subject-key',
      {},
      'default',
    );

    expect(details.variation).toBe('red');
    expect(details.evaluationDetails.variationKey).toBe('variation-123');

    // Assignment should be logged
    expect(mockAssignmentLogger.logAssignment).toHaveBeenCalledTimes(1);
    const call = mockAssignmentLogger.logAssignment.mock.calls[0][0];
    expect(call.allocation).toBe('allocation-123');
    expect(call.featureFlag).toBe('string-flag');
    expect(call.subject).toBe('test-subject-key');
  });
});
