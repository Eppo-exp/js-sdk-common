import { IConfigurationStore } from './configuration-store/configuration-store';
import { hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { IHttpClient } from './http-client';
import { PrecomputedFlag, UNKNOWN_ENVIRONMENT_NAME } from './interfaces';
import { Attributes } from './types';

export interface PrecomputedResponseData {
  salt: string;
  subjectKey: string;
  subjectAttributes: Attributes;
}

// Requests AND stores precomputed flags, reuses the configuration store
export default class PrecomputedFlagRequestor {
  public onPrecomputedResponse?: (response: PrecomputedResponseData) => void;

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private readonly subjectKey: string,
    private readonly subjectAttributes: Attributes,
  ) {}

  async fetchAndStorePrecomputedFlags(): Promise<void> {
    const precomputedResponse = await this.httpClient.getPrecomputedFlags({
      subject_key: this.subjectKey,
      subject_attributes: this.subjectAttributes,
    });

    if (this.onPrecomputedResponse && precomputedResponse) {
      this.onPrecomputedResponse({
        salt: precomputedResponse.salt,
        subjectKey: this.subjectKey,
        subjectAttributes: this.subjectAttributes,
      });
    }

    if (!precomputedResponse?.flags) {
      return;
    }

    await hydrateConfigurationStore(this.precomputedFlagStore, {
      entries: precomputedResponse.flags,
      environment: precomputedResponse.environment ?? { name: UNKNOWN_ENVIRONMENT_NAME },
      createdAt: precomputedResponse.createdAt,
      format: precomputedResponse.format,
    });
  }
}
