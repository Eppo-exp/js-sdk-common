import { IAssignmentEvent, IAssignmentLogger } from './assignment-logger';
import EppoClient from './client/eppo-client';

/** TODO docs */
export class EppoAssignmentLogger implements IAssignmentLogger {
  constructor(private readonly eppoClient: EppoClient) {}

  logAssignment(event: IAssignmentEvent): void {
    const entity = event.subjectAttributes.entity;
    const {
      holdoutKey: holdout,
      holdoutVariation: holdout_variant,
      subject: subject_id,
      experiment,
      variant,
    } = event;
    this.eppoClient.track('__eppo_assignment', {
      subject_id,
      experiment,
      variant,
      entity,
      holdout,
      holdout_variant,
    });
  }
}
