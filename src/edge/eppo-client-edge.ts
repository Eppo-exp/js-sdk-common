import { Variation } from '../interfaces';

type VariationValue = Variation['value'] | object;

export class EppoClientEdge {
  constructor(private cachedAssignments: Record<string, VariationValue>) {}

  getAssignments() {
    return this.cachedAssignments;
  }

  getStringAssignment(flagKey: string, defaultValue: string): string {
    if (typeof this.cachedAssignments[flagKey] === 'string') {
      return this.cachedAssignments[flagKey];
    }
    return defaultValue;
  }

  getBooleanAssignment(flagKey: string, defaultValue: boolean): boolean {
    if (typeof this.cachedAssignments[flagKey] === 'boolean') {
      return this.cachedAssignments[flagKey];
    }
    return defaultValue;
  }

  getNumericAssignment(flagKey: string, defaultValue: number): number {
    if (typeof this.cachedAssignments[flagKey] === 'number') {
      return this.cachedAssignments[flagKey];
    }
    return defaultValue;
  }

  getJSONAssignment(flagKey: string, defaultValue: object): object {
    if (typeof this.cachedAssignments[flagKey] === 'object') {
      return this.cachedAssignments[flagKey];
    }
    return defaultValue;
  }
}
