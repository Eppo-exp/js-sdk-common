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
      entityId: 456, // Changed to number
      holdoutKey: 'holdout-xyz',
      holdoutVariation: 'holdout-variant-1',
      // Add required properties based on the IAssignmentEvent interface
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      flagKey: 'flag-key-1',
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).toHaveBeenCalledTimes(1);
    expect(mockEppoClient.track).toHaveBeenCalledWith('__eppo_assignment', {
      subject_id: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      entity_id: 456,
      holdout: 'holdout-xyz',
      holdout_variant: 'holdout-variant-1',
    });
  });

  it('should handle missing optional fields', () => {
    // Arrange
    const assignmentEvent: IAssignmentEvent = {
      subject: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      // Add required properties based on the IAssignmentEvent interface
      allocation: 'allocation-1',
      featureFlag: 'feature-flag-1',
      variation: 'variation-1',
      timestamp: new Date().toISOString(),
      subjectAttributes: {},
      flagKey: 'flag-key-1',
      format: 'json',
      evaluationDetails: null,
    };

    // Act
    logger.logAssignment(assignmentEvent);

    // Assert
    expect(mockEppoClient.track).toHaveBeenCalledTimes(1);
    expect(mockEppoClient.track).toHaveBeenCalledWith('__eppo_assignment', {
      subject_id: 'user-123',
      experiment: 'experiment-abc',
      variant: 'control',
      entity_id: undefined,
      holdout: undefined,
      holdout_variant: undefined,
    });
  });
});
