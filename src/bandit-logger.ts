import { IFlagEvaluationDetails } from './flag-evaluation-details-builder';
import { Attributes } from './types';

export interface IBanditEvent {
  timestamp: string;
  featureFlag: string;
  bandit: string;
  subject: string;
  action: string | null;
  actionProbability: number | null;
  optimalityGap: number | null;
  modelVersion: string;
  subjectNumericAttributes: Attributes;
  subjectCategoricalAttributes: Attributes;
  actionNumericAttributes: Attributes;
  actionCategoricalAttributes: Attributes;
  metaData?: Record<string, unknown>;
  evaluationDetails: IFlagEvaluationDetails | null;
}

export interface IBanditLogger {
  logBanditAction(banditEvent: IBanditEvent): void;
}
