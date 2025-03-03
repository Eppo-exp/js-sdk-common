import ApiEndpoints from './api-endpoints';
import { TLRUCache } from './cache/tlru-cache';
import { Variation } from './interfaces';
import { FlagKey } from './types';

const FIVE_MINUTES_IN_MS = 5 * 3600 * 1000;

export interface OverridePayload {
  browserExtensionKey: string;
  overrides: Record<FlagKey, Variation>;
}

export const sendValidationRequest = async (
  browserExtensionKey: string,
  validationEndpoint: string,
) => {
  const response = await fetch(validationEndpoint, {
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
        `Invalid type for 'browserExtensionKey'. Expected string, but received ${typeof parsed['browserExtensionKey']}`,
      );
    }
    if (typeof parsed['overrides'] !== 'object') {
      throw new Error(
        `Invalid type for 'overrides'. Expected object, but received ${typeof parsed['overrides']}.`,
      );
    }
  }

  async validateKey(browserExtensionKey: string, baseUrl: string | undefined) {
    if (this.validKeyCache.get(browserExtensionKey) === 'true') {
      return true;
    }
    const endpoint = new ApiEndpoints({ baseUrl }).flagOverridesKeyValidationEndpoint().toString();
    await sendValidationRequest(browserExtensionKey, endpoint);
    this.validKeyCache.set(browserExtensionKey, 'true');
  }
}
