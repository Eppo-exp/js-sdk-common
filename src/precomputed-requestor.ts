import { IConfigurationStore } from './configuration-store/configuration-store';
import { hydrateConfigurationStore } from './configuration-store/configuration-store-utils';
import { IHttpClient } from './http-client';
import {
  IObfuscatedPrecomputedBandit,
  PrecomputedFlag,
  UNKNOWN_ENVIRONMENT_NAME,
} from './interfaces';
import { ContextAttributes, FlagKey } from './types';

// Requests AND stores precomputed flags, reuses the configuration store
export default class PrecomputedFlagRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly precomputedFlagStore: IConfigurationStore<PrecomputedFlag>,
    private readonly subjectKey: string,
    private readonly subjectAttributes: ContextAttributes,
    private readonly precomputedBanditsStore?: IConfigurationStore<IObfuscatedPrecomputedBandit>,
    private readonly banditActions?: Record<FlagKey, Record<string, ContextAttributes>>,
  ) {}

  async fetchAndStorePrecomputedFlags(): Promise<void> {
    const precomputedResponse = await this.httpClient.getPrecomputedFlags({
      subject_key: this.subjectKey,
      subject_attributes: this.subjectAttributes,
      bandit_actions: this.banditActions,
    });

    if (!precomputedResponse) {
      return;
    }

    const promises: Promise<void>[] = [];
    promises.push(
      hydrateConfigurationStore(this.precomputedFlagStore, {
        entries: precomputedResponse.flags,
        environment: precomputedResponse.environment ?? { name: UNKNOWN_ENVIRONMENT_NAME },
        createdAt: precomputedResponse.createdAt,
        format: precomputedResponse.format,
        salt: precomputedResponse.salt,
      }),
    );
    if (this.precomputedBanditsStore) {
      promises.push(
        hydrateConfigurationStore(this.precomputedBanditsStore, {
          entries: precomputedResponse.bandits,
          environment: precomputedResponse.environment ?? { name: UNKNOWN_ENVIRONMENT_NAME },
          createdAt: precomputedResponse.createdAt,
          format: precomputedResponse.format,
          salt: precomputedResponse.salt,
        }),
      );
    }
  }
}
