import { TLRUCache } from './cache/tlru-cache';
import { Variation } from './interfaces';
import { FlagKey } from './types';

const FIVE_MINUTES_IN_MS = 5 * 3600 * 1000;
const EPPO_API_URL = 'https://eppo.cloud/api/v1/feature-flags';

export interface OverridePayload {
  apiKey: string;
  overrides: Record<FlagKey, Variation>;
}

export class OverrideValidator {
  private validApiKeyCache = new TLRUCache(100, FIVE_MINUTES_IN_MS);

  parseOverridePayload(overridePayload: string): OverridePayload {
    const errorMsg = (msg: string) => `Unable to parse overridePayload: ${msg}`;
    try {
      const parsed = JSON.parse(overridePayload);
      this.validateParsedOverridePayload(parsed);
      return parsed as OverridePayload;
    } catch (err: unknown) {
      const message: string = (err as any)?.message ?? 'unknown error';
      throw new Error(errorMsg(message));
    }
  }

  private validateParsedOverridePayload(parsed: any) {
    if (typeof parsed !== 'object') {
      throw new Error(`Expected object, but received ${typeof parsed}`);
    }
    const keys = Object.keys(parsed);
    if (!keys.includes('apiKey')) {
      throw new Error(`Missing required field: 'apiKey'`);
    }
    if (!keys.includes('overrides')) {
      throw new Error(`Missing required field: 'overrides'`);
    }
    if (typeof parsed['apiKey'] !== 'string') {
      throw new Error(
        `Invalid type for 'apiKeys'. Expected string, but received ${typeof parsed['apiKey']}`,
      );
    }
    if (typeof parsed['overrides'] !== 'object') {
      throw new Error(
        `Invalid type for 'overrides'. Expected object, but received ${typeof parsed['overrides']}.`,
      );
    }
  }

  async validateOverrideApiKey(overrideApiKey: string) {
    if (this.validApiKeyCache.get(overrideApiKey) === 'true') {
      return true;
    }
    await this.sendValidationRequest(overrideApiKey);
    this.validApiKeyCache.set(overrideApiKey, 'true');
  }

  private async sendValidationRequest(overrideApiKey: string) {
    const response = await fetch(EPPO_API_URL, {
      headers: {
        'X-Eppo-Token': overrideApiKey,
        'Content-Type': 'application/json',
      },
    });
    if (response.status !== 200) {
      throw new Error(`Unable to authorize API token: ${response.statusText}`);
    }
  }
}
