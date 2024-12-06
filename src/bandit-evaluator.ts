import { BANDIT_ASSIGNMENT_SHARDS } from './constants';
import {
  BanditCategoricalAttributeCoefficients,
  BanditModelData,
  BanditNumericAttributeCoefficients,
} from './interfaces';
import { MD5Sharder, Sharder } from './sharders';
import { Attributes, ContextAttributes } from './types';

export interface BanditEvaluation {
  flagKey: string;
  subjectKey: string;
  subjectAttributes: ContextAttributes;
  actionKey: string;
  actionAttributes: ContextAttributes;
  actionScore: number;
  actionWeight: number;
  gamma: number;
  optimalityGap: number;
}

export class BanditEvaluator {
  private readonly assignmentShards = BANDIT_ASSIGNMENT_SHARDS; // We just hard code this for now
  private readonly sharder: Sharder = new MD5Sharder();

  public evaluateBestBandit(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    actions: Record<string, ContextAttributes>,
    banditModel: BanditModelData,
  ): BanditEvaluation {
    const actionScores: Record<string, number> = this.scoreActions(
      subjectAttributes,
      actions,
      banditModel,
    );

    const actionWeights: Record<string, number> = this.weighActions(
      actionScores,
      banditModel.gamma,
      banditModel.actionProbabilityFloor,
    );

    const selectedActionKey = Object.keys(actionScores).reduce((prev, cur) => {
      if (!prev || actionScores[cur] > actionScores[prev]) {
        return cur;
      }
      return prev;
    });

    return {
      flagKey,
      subjectKey,
      subjectAttributes,
      actionKey: selectedActionKey,
      actionAttributes: actions[selectedActionKey],
      actionScore: actionScores[selectedActionKey],
      actionWeight: actionWeights[selectedActionKey],
      gamma: banditModel.gamma,
      optimalityGap: 0,
    };
  }

  public evaluateBandit(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: ContextAttributes,
    actions: Record<string, ContextAttributes>,
    banditModel: BanditModelData,
  ): BanditEvaluation {
    const actionScores: Record<string, number> = this.scoreActions(
      subjectAttributes,
      actions,
      banditModel,
    );
    const actionWeights: Record<string, number> = this.weighActions(
      actionScores,
      banditModel.gamma,
      banditModel.actionProbabilityFloor,
    );
    const selectedActionKey: string = this.selectAction(flagKey, subjectKey, actionWeights);

    // Compute optimality gap in terms of score
    const topScore = Object.values(actionScores).reduce(
      (maxScore, score) => (score > maxScore ? score : maxScore),
      -Infinity,
    );
    const optimalityGap = topScore - actionScores[selectedActionKey];

    return {
      flagKey,
      subjectKey,
      subjectAttributes,
      actionKey: selectedActionKey,
      actionAttributes: actions[selectedActionKey],
      actionScore: actionScores[selectedActionKey],
      actionWeight: actionWeights[selectedActionKey],
      gamma: banditModel.gamma,
      optimalityGap,
    };
  }

  private scoreActions(
    subjectAttributes: ContextAttributes,
    actions: Record<string, ContextAttributes>,
    banditModel: Pick<BanditModelData, 'coefficients' | 'defaultActionScore'>,
  ): Record<string, number> {
    const actionScores: Record<string, number> = {};
    Object.entries(actions).forEach(([actionKey, actionAttributes]) => {
      let score = banditModel.defaultActionScore;
      const coefficients = banditModel.coefficients[actionKey];
      if (coefficients) {
        score = coefficients.intercept;
        score += this.scoreNumericAttributes(
          coefficients.subjectNumericCoefficients,
          subjectAttributes.numericAttributes,
        );
        score += this.scoreCategoricalAttributes(
          coefficients.subjectCategoricalCoefficients,
          subjectAttributes.categoricalAttributes,
        );
        score += this.scoreNumericAttributes(
          coefficients.actionNumericCoefficients,
          actionAttributes.numericAttributes,
        );
        score += this.scoreCategoricalAttributes(
          coefficients.actionCategoricalCoefficients,
          actionAttributes.categoricalAttributes,
        );
      }
      actionScores[actionKey] = score;
    });
    return actionScores;
  }

  private scoreNumericAttributes(
    coefficients: BanditNumericAttributeCoefficients[],
    attributes: Attributes,
  ): number {
    return coefficients.reduce((score, numericCoefficients) => {
      const attributeValue = attributes[numericCoefficients.attributeKey];
      if (typeof attributeValue === 'number' && isFinite(attributeValue)) {
        score += attributeValue * numericCoefficients.coefficient;
      } else {
        score += numericCoefficients.missingValueCoefficient;
      }
      return score;
    }, 0);
  }

  private scoreCategoricalAttributes(
    coefficients: BanditCategoricalAttributeCoefficients[],
    attributes: Attributes,
  ): number {
    return coefficients.reduce((score, attributeCoefficients) => {
      const attributeValue = attributes[attributeCoefficients.attributeKey]?.toString();
      const applicableCoefficient =
        attributeValue && attributeCoefficients.valueCoefficients[attributeValue];

      score +=
        typeof applicableCoefficient === 'number'
          ? applicableCoefficient
          : attributeCoefficients.missingValueCoefficient;

      return score;
    }, 0);
  }

  private weighActions(
    actionScores: Record<string, number>,
    gamma: number,
    actionProbabilityFloor: number,
  ) {
    const actionWeights: Record<string, number> = {};
    const actionScoreEntries = Object.entries(actionScores);

    if (!actionScoreEntries.length) {
      return actionWeights;
    }

    // First find the action with the highest score
    let currTopScore: number | null = null;
    let currTopAction: string | null = null;
    actionScoreEntries.forEach(([actionKey, actionScore]) => {
      if (
        currTopScore === null ||
        currTopAction === null ||
        actionScore > currTopScore ||
        (actionScore === currTopScore && actionKey < currTopAction)
      ) {
        currTopScore = actionScore;
        currTopAction = actionKey;
      }
    });

    if (currTopScore === null || currTopAction === null) {
      // Appease typescript with this check and extra variables
      throw new Error('Unable to find top score');
    }
    const topScore: number = currTopScore;
    const topAction: string = currTopAction;

    // Then weigh every action but the top one
    const numActions = actionScoreEntries.length;
    const minimumWeight = actionProbabilityFloor / numActions;
    let cumulativeWeight = 0;

    actionScoreEntries.forEach(([actionKey, actionScore]) => {
      if (actionKey === topAction) {
        // We weigh the top action later
        return;
      }
      const weight = 1 / (numActions + gamma * (topScore - actionScore));
      const boundedWeight = Math.max(weight, minimumWeight);
      cumulativeWeight += boundedWeight;
      actionWeights[actionKey] = boundedWeight;
    });

    // Finally weigh the top action (defensively bounding to 0.0)
    actionWeights[topAction] = Math.max(1 - cumulativeWeight, 0.0);

    return actionWeights;
  }

  private selectAction(
    flagKey: string,
    subjectKey: string,
    actionWeights: Record<string, number>,
  ): string {
    // Deterministically "shuffle" the actions
    // This way as action weights shift, a bunch of users who were on the edge of one action won't all be shifted to the
    // same new action at the same time.
    const shuffledActions = Object.entries(actionWeights).sort((a, b) => {
      const actionAShard = this.sharder.getShard(
        `${flagKey}-${subjectKey}-${a[0]}`,
        this.assignmentShards,
      );
      const actionBShard = this.sharder.getShard(
        `${flagKey}-${subjectKey}-${b[0]}`,
        this.assignmentShards,
      );
      let result = actionAShard - actionBShard;
      if (result === 0) {
        // In the unlikely case of a tie in randomized assigned shards, break the tie with the action names
        result = a[0] < b[0] ? -1 : 1;
      }
      return result;
    });

    // Select action from the shuffled actions, based on weight
    const assignedShard = this.sharder.getShard(`${flagKey}-${subjectKey}`, this.assignmentShards);
    const assignmentWeightThreshold = assignedShard / this.assignmentShards;
    let cumulativeWeight = 0;
    let assignedAction: string | null = null;
    for (const actionWeight of shuffledActions) {
      cumulativeWeight += actionWeight[1];
      if (cumulativeWeight > assignmentWeightThreshold) {
        assignedAction = actionWeight[0];
        break;
      }
    }
    if (assignedAction === null) {
      throw new Error(
        `No bandit action selected for flag "${flagKey}" and subject "${subjectKey}"`,
      );
    }
    return assignedAction;
  }
}
