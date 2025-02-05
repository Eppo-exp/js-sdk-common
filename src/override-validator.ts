import { TLRUCache } from './cache/tlru-cache';

const FIVE_MUNITES_IN_MS = 5 * 3600 * 1000;

export class OverrideValidator {
  private validApiKeyCache = new TLRUCache(100, FIVE_MUNITES_IN_MS);

  async validateOverrideApiKey(overrideApiKey: string) {
    if (this.validApiKeyCache.get(overrideApiKey) === 'true') {
      return true;
    }
    const isValid = await this.sendValidationRequest(overrideApiKey);
    this.validApiKeyCache.set(overrideApiKey, `${isValid}`);
    return isValid;
  }

  private async sendValidationRequest(overrideApiKey: string) {
    // TODO: Validate API key on public API
    return true;
  }
}
