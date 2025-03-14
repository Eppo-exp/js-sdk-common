import { IAssignmentEvent, IAssignmentLogger } from './assignment-logger';
import EppoClient from './client/eppo-client';

/**
 * Tracks an assignment event by submitting it to the Eppo Ingestion API.
 * Events are queued up for delivery according to the EppoClient's `EventDispatcher` implementation.
 */
export class EppoAssignmentLogger implements IAssignmentLogger {
  constructor(private readonly eppoClient: EppoClient) {}

  logAssignment(event: IAssignmentEvent): void {
    const {
      entityId: entity_id,
      featureFlag: feature_flag,
      experiment,
      allocation,
      // holdout and holdout_variant come from `extraLogging` in FlagEvaluation
      holdoutKey: holdout,
      holdoutVariation: holdout_variation,
      subject,
      variation,
    } = event;

    // Skip tracking if no entityId
    if (!entity_id) {
      return;
    }

    const payload = {
      entity_id,
      experiment,
      feature_flag,
      allocation,
      holdout_variation,
      holdout,
      subject,
      variation,
    };
    this.eppoClient.track('__eppo_assignment', payload);
  }
}
