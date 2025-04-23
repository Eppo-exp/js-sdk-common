import { TLRUCache } from './cache/tlru-cache';
import { Variation } from './interfaces';
import { FlagKey } from './types';

const FIVE_MINUTES_IN_MS = 5 * 3600 * 1000;
const KEY_VALIDATION_URL = 'https://eppo.cloud/api/flag-overrides/v1/validate-key';

export interface OverridePayload {
  browserExtensionKey: string;
  overrides: Record<FlagKey, Variation>;
}

export const sendValidationRequest = async (browserExtensionKey: string) => {
  const response = await fetch(KEY_VALIDATION_URL, {
    method: 'POST',
    body: JSON.stringify({
      key: browserExtensionKey,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (response.status !== 200) {
    throw new Error(`Unable to authorize key: ${response.statusText}`);
  }
};

export class OverrideValidator {
  private validKeyCache = new TLRUCache(100, FIVE_MINUTES_IN_MS);

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
    if (!keys.includes('browserExtensionKey')) {
      throw new Error(`Missing required field: 'browserExtensionKey'`);
    }
    if (!keys.includes('overrides')) {
      throw new Error(`Missing required field: 'overrides'`);
    }
    if (typeof parsed['browserExtensionKey'] !== 'string') {
      throw new Error(
        `Invalid type for 'browserExtensionKey'. Expected string, but received ${typeof parsed[
          'browserExtensionKey'
        ]}`,
      );
    }
    if (typeof parsed['overrides'] !== 'object') {
      throw new Error(
        `Invalid type for 'overrides'. Expected object, but received ${typeof parsed[
          'overrides'
        ]}.`,
      );
    }
  }

  async validateKey(browserExtensionKey: string) {
    if (this.validKeyCache.get(browserExtensionKey) === 'true') {
      return true;
    }
    await sendValidationRequest(browserExtensionKey);
    this.validKeyCache.set(browserExtensionKey, 'true');
  }
}
