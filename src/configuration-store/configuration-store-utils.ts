import {
  BanditParameters,
  BanditVariation,
  Environment,
  Flag,
  PrecomputedFlag,
} from '../interfaces';

import { IConfigurationStore } from './configuration-store';

type Entry = Flag | BanditVariation[] | BanditParameters | PrecomputedFlag;

export async function hydrateConfigurationStore<T extends Entry>(
  configurationStore: IConfigurationStore<T> | null,
  response: {
    entries: Record<string, T>;
    environment: Environment;
    createdAt: string;
    format: string;
  },
): Promise<void> {
  if (configurationStore) {
    const didUpdate = await configurationStore.setEntries(response.entries);
    if (didUpdate) {
      configurationStore.setEnvironment(response.environment);
      configurationStore.setConfigFetchedAt(new Date().toISOString());
      configurationStore.setConfigPublishedAt(response.createdAt);
      configurationStore.setFormat(response.format);
    }
  }
}
