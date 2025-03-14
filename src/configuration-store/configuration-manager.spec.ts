import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../http-client';
import { ConfigStoreHydrationPacket, StoreBackedConfiguration } from '../i-configuration';
import {
  BanditParameters,
  BanditReference,
  BanditVariation,
  Flag,
  FormatEnum,
  ObfuscatedFlag,
  VariationType,
} from '../interfaces';

import { ConfigurationManager } from './configuration-manager';
import { IConfigurationStore } from './configuration-store';
import { hydrateConfigurationStore } from './configuration-store-utils';
import { MemoryOnlyConfigurationStore } from './memory.store';

describe('ConfigurationManager', () => {
  let flagStore: IConfigurationStore<Flag | ObfuscatedFlag>;
  let banditVariationStore: IConfigurationStore<BanditVariation[]>;
  let banditModelStore: IConfigurationStore<BanditParameters>;
  let configManager: ConfigurationManager;

  beforeEach(() => {
    // Create fresh stores for each test
    flagStore = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();
    banditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
    banditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();

    // Create a ConfigurationManager instance
    configManager = new ConfigurationManager(flagStore, banditVariationStore, banditModelStore);
  });

  describe('constructor', () => {
    it('should create a StoreBackedConfiguration with the provided stores', () => {
      const config = configManager.getConfiguration();
      expect(config).toBeInstanceOf(StoreBackedConfiguration);
      expect(config.getFlagKeys()).toEqual([]);
    });

    it('should handle null bandit stores', () => {
      const managerWithNullStores = new ConfigurationManager(flagStore, null, null);
      const config = managerWithNullStores.getConfiguration();
      expect(config).toBeInstanceOf(StoreBackedConfiguration);
      expect(config.getFlagKeys()).toEqual([]);
    });
  });

  describe('getConfiguration', () => {
    it('should return the StoreBackedConfiguration instance', () => {
      const config = configManager.getConfiguration();
      expect(config).toBeInstanceOf(StoreBackedConfiguration);
    });
  });

  describe('hydrateConfigurationStores', () => {
    it('should hydrate flag configuration store', async () => {
      const flagPacket: ConfigStoreHydrationPacket<Flag> = {
        entries: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'var-a': { key: 'var-a', value: 'A' },
              'var-b': { key: 'var-b', value: 'B' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      await configManager.hydrateConfigurationStores(flagPacket);

      const config = configManager.getConfiguration();
      expect(config.getFlagKeys()).toEqual(['test-flag']);
      expect(config.getFlag('test-flag')).toEqual(flagPacket.entries['test-flag']);
    });

    it('should hydrate bandit variation store', async () => {
      const flagPacket: ConfigStoreHydrationPacket<Flag> = {
        entries: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'bandit-var': { key: 'bandit-var', value: 'bandit' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      const banditVariationPacket: ConfigStoreHydrationPacket<BanditVariation[]> = {
        entries: {
          'test-flag': [
            {
              key: 'bandit-1',
              flagKey: 'test-flag',
              variationKey: 'bandit-var',
              variationValue: 'bandit',
            },
          ],
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      await configManager.hydrateConfigurationStores(flagPacket, banditVariationPacket);

      const config = configManager.getConfiguration();
      expect(config.getFlagBanditVariations('test-flag')).toEqual(
        banditVariationPacket.entries['test-flag'],
      );
    });

    it('should hydrate bandit model store', async () => {
      const flagPacket: ConfigStoreHydrationPacket<Flag> = {
        entries: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'bandit-var': { key: 'bandit-var', value: 'bandit' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      const banditVariationPacket: ConfigStoreHydrationPacket<BanditVariation[]> = {
        entries: {
          'test-flag': [
            {
              key: 'bandit-1',
              flagKey: 'test-flag',
              variationKey: 'bandit-var',
              variationValue: 'bandit',
              // allocationKey: 'allocation-1',
            },
          ],
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      const banditModelPacket: ConfigStoreHydrationPacket<BanditParameters> = {
        entries: {
          'bandit-1': {
            banditKey: 'bandit-1',
            modelName: 'test-model',
            modelVersion: '1.0',
            // updatedAt: '2023-01-01',
            modelData: {
              gamma: 0,
              defaultActionScore: 0,
              actionProbabilityFloor: 0,
              coefficients: {},
            },
          },
        },

        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      };

      await configManager.hydrateConfigurationStores(
        flagPacket,
        banditVariationPacket,
        banditModelPacket,
      );

      const config = configManager.getConfiguration();
      expect(config.getBandit('bandit-1')).toEqual(banditModelPacket.entries['bandit-1']);
    });
  });

  describe('hydrateConfigurationStoresFromUfc', () => {
    it('should return false if no flags in response', async () => {
      const result = await configManager.hydrateConfigurationStoresFromUfc(
        {} as IUniversalFlagConfigResponse,
      );
      expect(result).toBe(false);
    });

    it('should hydrate flag configuration from UFC response', async () => {
      const ufcResponse: IUniversalFlagConfigResponse = {
        flags: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'var-a': { key: 'var-a', value: 'A' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        banditReferences: {},
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: FormatEnum.SERVER,
      };

      await configManager.hydrateConfigurationStoresFromUfc(ufcResponse);

      const config = configManager.getConfiguration();
      expect(config.getFlagKeys()).toEqual(['test-flag']);
      expect(config.getFlag('test-flag')).toEqual(ufcResponse.flags['test-flag']);
    });

    it('should hydrate bandit variations from UFC response', async () => {
      const ufcResponse: IUniversalFlagConfigResponse = {
        flags: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'bandit-var': { key: 'bandit-var', value: 'bandit' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        banditReferences: {
          'bandit-1': {
            modelVersion: '1.0',
            flagVariations: [
              {
                key: 'bandit-1',
                flagKey: 'test-flag',
                variationKey: 'bandit-var',
                variationValue: 'bandit',
                // allocationKey: 'allocation-1',
              },
            ],
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: FormatEnum.SERVER,
      };

      await configManager.hydrateConfigurationStoresFromUfc(ufcResponse);

      const config = configManager.getConfiguration();
      expect(config.getFlagBanditVariations('test-flag')).toHaveLength(1);
      expect(config.getFlagBanditVariations('test-flag')[0].key).toBe('bandit-1');
    });

    it('should hydrate bandit models from bandit response', async () => {
      const ufcResponse: IUniversalFlagConfigResponse = {
        flags: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'bandit-var': { key: 'bandit-var', value: 'bandit' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        banditReferences: {
          'bandit-1': {
            modelVersion: '1.0',
            flagVariations: [
              {
                key: 'bandit-1',
                flagKey: 'test-flag',
                variationKey: 'bandit-var',
                variationValue: 'bandit',
                // allocationKey: 'allocation-1',
              },
            ],
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: FormatEnum.SERVER,
      };

      const banditResponse: IBanditParametersResponse = {
        bandits: {
          'bandit-1': {
            banditKey: 'bandit-1',
            modelName: 'test-model',
            modelVersion: '1.0',
            // updatedAt: '2023-01-01',
            modelData: {
              coefficients: {},
              gamma: 0,
              defaultActionScore: 0,
              actionProbabilityFloor: 0,
            },
          },
        },
      };

      await configManager.hydrateConfigurationStoresFromUfc(ufcResponse, banditResponse);

      const config = configManager.getConfiguration();
      expect(config.getBandit('bandit-1')).toEqual(banditResponse.bandits['bandit-1']);
    });

    it('should handle UFC response with no bandit references', async () => {
      const ufcResponse: IUniversalFlagConfigResponse = {
        flags: {
          'test-flag': {
            key: 'test-flag',
            enabled: true,
            variationType: VariationType.STRING,
            variations: {
              'var-a': { key: 'var-a', value: 'A' },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: FormatEnum.SERVER,
        banditReferences: {},
      };

      await configManager.hydrateConfigurationStoresFromUfc(ufcResponse);

      const config = configManager.getConfiguration();
      expect(config.getFlagKeys()).toEqual(['test-flag']);
      expect(config.getFlagBanditVariations('test-flag')).toEqual([]);
    });
  });

  describe('setConfigurationStores', () => {
    it('should update the flag configuration store', async () => {
      const newFlagStore = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();

      // Pre-populate the new store
      await hydrateConfigurationStore(newFlagStore, {
        entries: {
          'new-flag': {
            key: 'new-flag',
            enabled: true,
            variationType: VariationType.BOOLEAN,
            variations: {
              true: { key: 'true', value: true },
              false: { key: 'false', value: false },
            },
            allocations: [],
            totalShards: 10,
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: FormatEnum.SERVER,
      });

      configManager.setConfigurationStores({
        flagConfigurationStore: newFlagStore,
        banditReferenceConfigurationStore: banditVariationStore,
        banditConfigurationStore: banditModelStore,
      });

      const config = configManager.getConfiguration();
      expect(config.getFlagKeys()).toEqual(['new-flag']);
    });

    it('should update the bandit variation store', async () => {
      const newBanditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();

      // Pre-populate the new store
      hydrateConfigurationStore(newBanditVariationStore, {
        entries: {
          'test-flag': [
            {
              key: 'new-bandit',
              flagKey: 'test-flag',
              variationKey: 'var-a',
              variationValue: 'A',
              // allocationKey: 'allocation-1',
            },
          ],
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      });

      configManager.setConfigurationStores({
        flagConfigurationStore: flagStore,
        banditReferenceConfigurationStore: newBanditVariationStore,
        banditConfigurationStore: banditModelStore,
      });

      const config = configManager.getConfiguration();
      expect(config.getFlagBanditVariations('test-flag')).toHaveLength(1);
      expect(config.getFlagBanditVariations('test-flag')[0].key).toBe('new-bandit');
    });

    it('should update the bandit model store', async () => {
      const newBanditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();

      // Pre-populate the new store
      hydrateConfigurationStore(newBanditModelStore, {
        entries: {
          'new-bandit': {
            banditKey: 'new-bandit',
            modelName: 'new-model',
            modelVersion: '2.0',
            // updatedAt: '2023-02-01',
            modelData: {
              gamma: 0,
              defaultActionScore: 0,
              actionProbabilityFloor: 0,
              coefficients: {},
            },
          },
        },
        environment: { name: 'test' },
        createdAt: '2023-01-01',
        format: 'SERVER',
      });

      configManager.setConfigurationStores({
        flagConfigurationStore: flagStore,
        banditReferenceConfigurationStore: banditVariationStore,
        banditConfigurationStore: newBanditModelStore,
      });

      const config = configManager.getConfiguration();
      expect(config.getBandit('new-bandit')).toEqual({
        banditKey: 'new-bandit',
        modelName: 'new-model',
        modelVersion: '2.0',
        // updatedAt: '2023-02-01',
        modelData: {
          gamma: 0,
          defaultActionScore: 0,
          actionProbabilityFloor: 0,
          coefficients: {},
        },
      });
    });

    it('should handle optional bandit stores', () => {
      configManager.setConfigurationStores({
        flagConfigurationStore: flagStore,
      });

      const config = configManager.getConfiguration();
      expect(config).toBeInstanceOf(StoreBackedConfiguration);
      expect(config.getFlagKeys()).toEqual([]);
    });
  });

  describe('indexBanditVariationsByFlagKey', () => {
    it('should correctly index bandit variations by flag key', async () => {
      // We need to test the private method, so we'll use a test-only approach
      // by creating a subclass that exposes the private method for testing
      class TestableConfigManager extends ConfigurationManager {
        public testIndexBanditVariationsByFlagKey(banditRefs: Record<string, BanditReference>) {
          return this['indexBanditVariationsByFlagKey'](banditRefs);
        }
      }

      const testManager = new TestableConfigManager(
        flagStore,
        banditVariationStore,
        banditModelStore,
      );

      const banditReferences: Record<string, BanditReference> = {
        'bandit-1': {
          modelVersion: '1.0',
          flagVariations: [
            {
              key: 'bandit-1-var-1',
              flagKey: 'flag-1',
              variationKey: 'var-a',
              variationValue: 'A',
              // allocationKey: 'alloc-1',
            },
            {
              key: 'bandit-1-var-2',
              flagKey: 'flag-2',
              variationKey: 'var-b',
              variationValue: 'B',
              // allocationKey: 'alloc-2',
            },
          ],
        },
        'bandit-2': {
          modelVersion: '2.0',
          flagVariations: [
            {
              key: 'bandit-2-var-1',
              flagKey: 'flag-1',
              variationKey: 'var-c',
              variationValue: 'C',
              // allocationKey: 'alloc-3',
            },
          ],
        },
      };

      const result = testManager.testIndexBanditVariationsByFlagKey(banditReferences);

      expect(Object.keys(result)).toEqual(['flag-1', 'flag-2']);
      expect(result['flag-1']).toHaveLength(2);
      expect(result['flag-2']).toHaveLength(1);

      // Check that the variations are correctly assigned to their flag keys
      expect(result['flag-1'].map((v) => v.key)).toEqual(['bandit-1-var-1', 'bandit-2-var-1']);
      expect(result['flag-2'].map((v) => v.key)).toEqual(['bandit-1-var-2']);
    });
  });
});
