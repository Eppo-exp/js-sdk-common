import { ConfigurationManager } from './configuration-store/configuration-manager';
import { IHttpClient } from './http-client';
import { IConfiguration } from './i-configuration';
import { BanditReference, BanditParameters } from './interfaces';

// Requests configurations and delegates storage to the ConfigurationManager
export default class ConfigurationRequestor {
  private banditModelVersions: string[] = [];

  constructor(
    private readonly httpClient: IHttpClient,
    private readonly configurationManager: ConfigurationManager,
    private readonly fetchBandits: boolean,
  ) {}

  public getConfiguration(): IConfiguration {
    return this.configurationManager.getConfiguration();
  }

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      return;
    }

    const flagsHaveBandits = Object.keys(configResponse.banditReferences ?? {}).length > 0;
    let banditResponse = undefined;

    if (this.fetchBandits && flagsHaveBandits) {
      // Check if we need to fetch bandit parameters
      if (this.requiresBanditModelConfigurationStoreUpdate(configResponse.banditReferences)) {
        banditResponse = await this.httpClient.getBanditParameters();
        if (banditResponse?.bandits) {
          this.banditModelVersions = this.getLoadedBanditModelVersions(banditResponse.bandits);
        }
      }
    }

    await this.configurationManager.hydrateConfigurationStoresFromUfc(
      configResponse,
      banditResponse,
    );
  }

  private getLoadedBanditModelVersions(entries: Record<string, BanditParameters>): string[] {
    return Object.values(entries).map((banditParam: BanditParameters) => banditParam.modelVersion);
  }

  private requiresBanditModelConfigurationStoreUpdate(
    banditReferences: Record<string, BanditReference>,
  ): boolean {
    const referencedModelVersions = Object.values(banditReferences).map(
      (banditReference: BanditReference) => banditReference.modelVersion,
    );

    return !referencedModelVersions.every((modelVersion) =>
      this.banditModelVersions.includes(modelVersion),
    );
  }
}
