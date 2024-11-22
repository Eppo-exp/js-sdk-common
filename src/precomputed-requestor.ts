import { IConfigurationStore } from './configuration-store/configuration-store';
import { hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { IHttpClient } from './http-client';
import { PrecomputedFlag } from './interfaces';
import { Attributes } from './types';

// Requests AND stores precomputed flags, reuses the configuration store
export default class PrecomputedFlagRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private readonly subjectKey: string,
    private readonly subjectAttributes: Attributes,
  ) {}

  async fetchAndStorePrecomputedFlags(): Promise<void> {
    const precomputedResponse = await this.httpClient.getPrecomputedFlags({
      subjectKey: this.subjectKey,
      subjectAttributes: this.subjectAttributes,
    });

    if (!precomputedResponse?.flags) {
      return;
    }

    await hydrateConfigurationStore(this.precomputedFlagStore, {
      entries: precomputedResponse.flags,
      environment: precomputedResponse.environment,
      createdAt: precomputedResponse.createdAt,
      format: precomputedResponse.format,
    });
  }
}
