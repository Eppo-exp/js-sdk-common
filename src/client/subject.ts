import EppoClient, { IAssignmentDetails, IContainerExperiment } from './eppo-client';
import { Attributes, BanditActions, ContextAttributes, FlagKey } from '../types';
import { ensureNonContextualSubjectAttributes } from '../attributes';
import { Configuration } from '../configuration';

/**
 * A wrapper around EppoClient that automatically supplies subject key, attributes, and bandit
 * actions for all assignment and bandit methods.
 *
 * This is useful when you always want to use the same subject and attributes for all flag
 * evaluations.
 */
export class Subject {
  private client: EppoClient;
  private subjectKey: string;
  private subjectAttributes: Attributes | ContextAttributes;
  private banditActions?: Record<FlagKey, BanditActions>;

  /**
   * @internal Creates a new Subject instance.
   * 
   * @param client The EppoClient instance to wrap
   * @param subjectKey The subject key to use for all assignments
   * @param subjectAttributes The subject attributes to use for all assignments
   * @param banditActions Optional default bandit actions to use for all bandit evaluations
   */
  constructor(
    client: EppoClient,
    subjectKey: string,
    subjectAttributes: Attributes | ContextAttributes,
    banditActions: Record<FlagKey, BanditActions>
  ) {
    this.client = client;
    this.subjectKey = subjectKey;
    this.subjectAttributes = subjectAttributes;
    this.banditActions = banditActions;
  }

  /**
   * Gets the underlying EppoClient instance.
   */
  public getClient(): EppoClient {
    return this.client;
  }

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getStringAssignment(flagKey: string, defaultValue: string): string {
    return this.client.getStringAssignment(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a string variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an object that includes the variation value along with additional metadata about the assignment
   */
  public getStringAssignmentDetails(flagKey: string, defaultValue: string): IAssignmentDetails<string> {
    return this.client.getStringAssignmentDetails(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a boolean variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
    return this.client.getBooleanAssignment(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a boolean variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an object that includes the variation value along with additional metadata about the assignment
   */
  public getBooleanAssignmentDetails(flagKey: string, defaultValue: boolean): IAssignmentDetails<boolean> {
    return this.client.getBooleanAssignmentDetails(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to an Integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an integer variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getIntegerAssignment(flagKey: string, defaultValue: number): number {
    return this.client.getIntegerAssignment(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to an Integer variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an object that includes the variation value along with additional metadata about the assignment
   */
  public getIntegerAssignmentDetails(flagKey: string, defaultValue: number): IAssignmentDetails<number> {
    return this.client.getIntegerAssignmentDetails(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a numeric variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a number variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getNumericAssignment(flagKey: string, defaultValue: number): number {
    return this.client.getNumericAssignment(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a numeric variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an object that includes the variation value along with additional metadata about the assignment
   */
  public getNumericAssignmentDetails(flagKey: string, defaultValue: number): IAssignmentDetails<number> {
    return this.client.getNumericAssignmentDetails(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a JSON variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a JSON object variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getJSONAssignment(flagKey: string, defaultValue: object): object {
    return this.client.getJSONAssignment(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  /**
   * Maps a subject to a JSON variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns an object that includes the variation value along with additional metadata about the assignment
   */
  public getJSONAssignmentDetails(flagKey: string, defaultValue: object): IAssignmentDetails<object> {
    return this.client.getJSONAssignmentDetails(
      flagKey, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes), 
      defaultValue
    );
  }

  public getBanditAction(
    flagKey: string, 
    defaultValue: string,
  ): Omit<IAssignmentDetails<string>, 'evaluationDetails'> {
    return this.client.getBanditAction(flagKey, this.subjectKey, this.subjectAttributes, this.banditActions?.[flagKey] ?? {}, defaultValue);
  }


  public getBanditActionDetails(
    flagKey: string, 
    defaultValue: string,
  ): IAssignmentDetails<string> {
    return this.client.getBanditActionDetails(flagKey, this.subjectKey, this.subjectAttributes, this.banditActions?.[flagKey] ?? {}, defaultValue);
  }

  /**
   * Evaluates the supplied actions using the first bandit associated with `flagKey` and returns the best ranked action.
   *
   * This method should be considered **preview** and is subject to change as requirements mature.
   *
   * NOTE: This method does not do any logging or assignment computation and so calling this method will have
   * NO IMPACT on bandit and experiment training.
   *
   * Only use this method under certain circumstances (i.e. where the impact of the choice of bandit cannot be measured,
   * but you want to put the "best foot forward", for example, when being web-crawled).
   */
  public getBestAction(
    flagKey: string, 
    defaultAction: string,
  ): string {
    return this.client.getBestAction(flagKey, this.subjectAttributes, this.banditActions?.[flagKey] ?? {}, defaultAction);
  }

  /**
   * For use with 3rd party CMS tooling, such as the Contentful Eppo plugin.
   *
   * CMS plugins that integrate with Eppo will follow a common format for
   * creating a feature flag. The flag created by the CMS plugin will have
   * variations with values 'control', 'treatment-1', 'treatment-2', etc.
   * This function allows users to easily return the CMS container entry
   * for the assigned variation.
   *
   * @param flagExperiment the flag key, control container entry and treatment container entries.
   * @returns The container entry associated with the experiment.
   */
  public getExperimentContainerEntry<T>(flagExperiment: IContainerExperiment<T>): T {
    return this.client.getExperimentContainerEntry(
      flagExperiment, 
      this.subjectKey, 
      ensureNonContextualSubjectAttributes(this.subjectAttributes)
    );
  }

  /**
   * Computes and returns assignments and bandits for the configured subject from all loaded flags.
   *
   * @returns A JSON string containing the precomputed configuration
   */
  public getPrecomputedConfiguration(): Configuration {
    return this.client.getPrecomputedConfiguration(
      this.subjectKey, 
      this.subjectAttributes, 
      this.banditActions || {},
    );
  }

  /**
   * Waits for the client to finish initialization sequence and be ready to serve assignments.
   *
   * @returns A promise that resolves when the client is initialized.
   */
  public waitForInitialization(): Promise<void> {
    return this.client.waitForInitialization();
  }
} 