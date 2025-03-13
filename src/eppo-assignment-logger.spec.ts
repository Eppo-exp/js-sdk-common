import { IAssignmentEvent } from './assignment-logger';
import EppoClient from './client/eppo-client';
import { IConfigurationStore } from './configuration-store/configuration-store';
import { EppoAssignmentLogger } from './eppo-assignment-logger';
import { Flag } from './interfaces';

jest.mock('./client/eppo-client');

describe('EppoAssignmentLogger', () => {
  let mockEppoClient: jest.Mocked<EppoClient>;
  let logger: EppoAssignmentLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEppoClient = new EppoClient({
      flagConfigurationStore: {} as IConfigurationStore<Flag>,
    }) as jest.Mocked<EppoClient>;
    mockEppoClient.track = jest.fn();
    logger = new EppoAssignmentLogger(mockEppoClient);
  });

  it('should log assignment events correctly', () => {
    // Arrange
    const assignmentEvent: IAssignmentEvent = {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      entityId: 456,
      holdoutKey: 'holdout-xyz',
      holdoutVariation: 'holdout-variant-1',
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).toHaveBeenCalledTimes(1);
    expect(mockEppoClient.track).toHaveBeenCalledWith('__eppo_assignment', {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variation: 'variation-1',
      allocation: 'allocation-1',
      feature_flag: 'feature-flag-1',
      entity_id: 456,
      holdout: 'holdout-xyz',
      holdout_variation: 'holdout-variant-1',
    });
  });

  it('should handle missing optional fields', () => {
    // Arrange
    const assignmentEvent: IAssignmentEvent = {
      subject: 'user-123',
      experiment: 'experiment-abc',
      entityId: 789,
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).toHaveBeenCalledTimes(1);
    expect(mockEppoClient.track).toHaveBeenCalledWith('__eppo_assignment', {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variation: 'variation-1',
      allocation: 'allocation-1',
      feature_flag: 'feature-flag-1',
      entity_id: 789,
      holdout: undefined,
      holdout_variation: undefined,
    });
  });

  it('should skip tracking when entityId is null', () => {
    // Arrange
    const assignmentEvent: IAssignmentEvent = {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      entityId: null,
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).not.toHaveBeenCalled();
  });

  it('should skip tracking when entityId is undefined', () => {
    // Arrange
    const assignmentEvent: IAssignmentEvent = {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).not.toHaveBeenCalled();
  });
});
