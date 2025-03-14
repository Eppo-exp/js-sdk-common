import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../http-client';
import { ConfigStoreHydrationPacket, IConfiguration } from '../i-configuration';
import { BanditParameters, BanditVariation, Flag, ObfuscatedFlag } from '../interfaces';

import { IConfigurationStore } from './configuration-store';

export interface IConfigurationManager {
  getConfiguration(): IConfiguration;
  hydrateConfigurationStores(
    flagConfigPacket: ConfigStoreHydrationPacket<Flag | ObfuscatedFlag>,
    banditReferencePacket?: ConfigStoreHydrationPacket<BanditVariation[]>,
    banditParametersPacket?: ConfigStoreHydrationPacket<BanditParameters>,
  ): Promise<boolean>;
  hydrateConfigurationStoresFromUfc(
    flags: IUniversalFlagConfigResponse,
    bandits?: IBanditParametersResponse,
  ): Promise<boolean>;
  setConfigurationStores(configStores: {
    flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>;
    banditReferenceConfigurationStore?: IConfigurationStore<BanditVariation[]>;
    banditConfigurationStore?: IConfigurationStore<BanditParameters>;
  }): void;
}
