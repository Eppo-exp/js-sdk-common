import { IConfigurationStore } from './configuration-store/configuration-store';
import { ImmutableConfiguration, StoreBackedConfiguration } from './i-configuration';
import {
  BanditParameters,
  BanditVariation,
  ConfigDetails,
  Environment,
  Flag,
  ObfuscatedFlag,
  VariationType,
} from './interfaces';
import { BanditKey, FlagKey } from './types';

describe('StoreBackedConfiguration', () => {
  let mockFlagStore: jest.Mocked<IConfigurationStore<Flag | ObfuscatedFlag>>;
  let mockBanditVariationStore: jest.Mocked<IConfigurationStore<BanditVariation[]>>;
  let mockBanditModelStore: jest.Mocked<IConfigurationStore<BanditParameters>>;

  beforeEach(() => {
    mockFlagStore = {
      get: jest.fn(),
      getKeys: jest.fn(),
      entries: jest.fn(),
      setEntries: jest.fn(),
      setEnvironment: jest.fn(),
      setConfigFetchedAt: jest.fn(),
      setConfigPublishedAt: jest.fn(),
      setFormat: jest.fn(),
      getConfigFetchedAt: jest.fn(),
      getConfigPublishedAt: jest.fn(),
      getEnvironment: jest.fn(),
      getFormat: jest.fn(),
      salt: undefined,
      init: jest.fn(),
      isInitialized: jest.fn(),
      isExpired: jest.fn(),
    };

    mockBanditVariationStore = {
      get: jest.fn(),
      getKeys: jest.fn(),
      entries: jest.fn(),
      setEntries: jest.fn(),
      setEnvironment: jest.fn(),
      setConfigFetchedAt: jest.fn(),
      setConfigPublishedAt: jest.fn(),
      setFormat: jest.fn(),
      getConfigFetchedAt: jest.fn(),
      getConfigPublishedAt: jest.fn(),
      getEnvironment: jest.fn(),
      getFormat: jest.fn(),
      salt: undefined,
      init: jest.fn(),
      isInitialized: jest.fn(),
      isExpired: jest.fn(),
    };

    mockBanditModelStore = {
      get: jest.fn(),
      getKeys: jest.fn(),
      entries: jest.fn(),
      setEntries: jest.fn(),
      setEnvironment: jest.fn(),
      setConfigFetchedAt: jest.fn(),
      setConfigPublishedAt: jest.fn(),
      setFormat: jest.fn(),
      getConfigFetchedAt: jest.fn(),
      getConfigPublishedAt: jest.fn(),
      getEnvironment: jest.fn(),
      getFormat: jest.fn(),
      salt: undefined,
      init: jest.fn(),
      isInitialized: jest.fn(),
      isExpired: jest.fn(),
    };
  });

  describe('hydrateConfigurationStores', () => {
    it('should hydrate flag store and return true if updates occurred', async () => {
      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      mockFlagStore.setEntries.mockResolvedValue(true);
      mockBanditVariationStore.setEntries.mockResolvedValue(true);
      mockBanditModelStore.setEntries.mockResolvedValue(true);

      const result = await config.hydrateConfigurationStores(
        {
          entries: { testFlag: { key: 'test' } as Flag },
          environment: { name: 'test' },
          createdAt: '2024-01-01',
          format: 'SERVER',
        },
        {
          entries: { testVar: [] },
          environment: { name: 'test' },
          createdAt: '2024-01-01',
          format: 'SERVER',
        },
        {
          entries: { testBandit: {} as BanditParameters },
          environment: { name: 'test' },
          createdAt: '2024-01-01',
          format: 'SERVER',
        },
      );

      expect(result).toBe(true);
      expect(mockFlagStore.setEntries).toHaveBeenCalled();
      expect(mockBanditVariationStore.setEntries).toHaveBeenCalled();
      expect(mockBanditModelStore.setEntries).toHaveBeenCalled();
    });
  });

  describe('getFlag', () => {
    it('should return flag when it exists', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      const mockFlag: Flag = { key: 'test-flag' } as Flag;
      mockFlagStore.get.mockReturnValue(mockFlag);

      const result = config.getFlag('test-flag');
      expect(result).toEqual(mockFlag);
    });

    it('should return null when flag does not exist', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.get.mockReturnValue(null);

      const result = config.getFlag('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getFlagVariationBandit', () => {
    it('should return bandit parameters when variation exists', () => {
      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      const mockVariations: BanditVariation[] = [
        {
          key: 'bandit-1',
          variationValue: 'var-1',
          flagKey: 'test-flag',
          variationKey: 'test-variation',
        },
      ];
      const mockBanditParams: BanditParameters = {} as BanditParameters;

      mockBanditVariationStore.get.mockReturnValue(mockVariations);
      mockBanditModelStore.get.mockReturnValue(mockBanditParams);

      const result = config.getFlagVariationBandit('test-flag', 'var-1');
      expect(result).toEqual(mockBanditParams);
    });

    it('should return null when variation does not exist', () => {
      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      mockBanditVariationStore.get.mockReturnValue([]);

      const result = config.getFlagVariationBandit('test-flag', 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getFlagConfigDetails', () => {
    it('should return config details with default values when store returns null', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.getConfigFetchedAt.mockReturnValue(null);
      mockFlagStore.getConfigPublishedAt.mockReturnValue(null);
      mockFlagStore.getEnvironment.mockReturnValue(null);
      mockFlagStore.getFormat.mockReturnValue(null);

      const result = config.getFlagConfigDetails();
      expect(result).toEqual({
        configFetchedAt: '',
        configPublishedAt: '',
        configEnvironment: { name: '' },
        configFormat: '',
      });
    });

    it('should return actual config details when available', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      const mockEnvironment: Environment = { name: 'test' };

      mockFlagStore.getConfigFetchedAt.mockReturnValue('2024-01-01T00:00:00Z');
      mockFlagStore.getConfigPublishedAt.mockReturnValue('2024-01-01T00:00:00Z');
      mockFlagStore.getEnvironment.mockReturnValue(mockEnvironment);
      mockFlagStore.getFormat.mockReturnValue('SERVER');

      const result = config.getFlagConfigDetails();
      expect(result).toEqual({
        configFetchedAt: '2024-01-01T00:00:00Z',
        configPublishedAt: '2024-01-01T00:00:00Z',
        configEnvironment: mockEnvironment,
        configFormat: 'SERVER',
      });
    });
  });

  describe('getBanditVariations', () => {
    it('should return variations when they exist', () => {
      const config = new StoreBackedConfiguration(mockFlagStore, mockBanditVariationStore);
      const mockVariations: BanditVariation[] = [
        {
          key: 'bandit-1',
          variationValue: 'var-1',
          flagKey: 'test-flag',
          variationKey: 'test-variation',
        },
      ];
      mockBanditVariationStore.get.mockReturnValue(mockVariations);

      const result = config.getFlagBanditVariations('test-flag');
      expect(result).toEqual(mockVariations);
    });

    it('should return empty array when variations do not exist', () => {
      const config = new StoreBackedConfiguration(mockFlagStore, mockBanditVariationStore);
      mockBanditVariationStore.get.mockReturnValue(null);

      const result = config.getFlagBanditVariations('test-flag');
      expect(result).toEqual([]);
    });
  });

  describe('getFlagKeys', () => {
    it('should return flag keys from store', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      const mockKeys = ['flag-1', 'flag-2'];
      mockFlagStore.getKeys.mockReturnValue(mockKeys);

      const result = config.getFlagKeys();
      expect(result).toEqual(mockKeys);
    });
  });

  describe('getFlags', () => {
    it('should return all flags from store', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      const mockFlags: Record<FlagKey, Flag> = {
        'flag-1': { key: 'flag-1' } as Flag,
        'flag-2': { key: 'flag-2' } as Flag,
      };
      mockFlagStore.entries.mockReturnValue(mockFlags);

      const result = config.getFlags();
      expect(result).toEqual(mockFlags);
    });
  });

  describe('isObfuscated', () => {
    it('should return true for CLIENT format', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.getFormat.mockReturnValue('CLIENT');

      expect(config.isObfuscated()).toBe(true);
    });

    it('should return true for PRECOMPUTED format', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.getFormat.mockReturnValue('PRECOMPUTED');

      expect(config.isObfuscated()).toBe(true);
    });

    it('should return false for SERVER format', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.getFormat.mockReturnValue('SERVER');

      expect(config.isObfuscated()).toBe(false);
    });

    it('should return false when format is undefined', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      mockFlagStore.getFormat.mockReturnValue(null);

      expect(config.isObfuscated()).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('should return false when no stores are initialized', () => {
      mockFlagStore.isInitialized.mockReturnValue(false);
      mockBanditVariationStore.isInitialized.mockReturnValue(false);
      mockBanditModelStore.isInitialized.mockReturnValue(false);

      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      expect(config.isInitialized()).toBe(false);
    });

    it('should return true when all stores are initialized', () => {
      mockFlagStore.isInitialized.mockReturnValue(true);
      mockBanditVariationStore.isInitialized.mockReturnValue(true);
      mockBanditModelStore.isInitialized.mockReturnValue(true);

      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      expect(config.isInitialized()).toBe(true);
    });

    it('should return true when flag store is initialized and no bandit stores are provided', () => {
      mockFlagStore.isInitialized.mockReturnValue(true);

      const config = new StoreBackedConfiguration(mockFlagStore);

      expect(config.isInitialized()).toBe(true);
    });

    it('should return false if flag store is uninitialized even if bandit stores are initialized', () => {
      mockFlagStore.isInitialized.mockReturnValue(false);
      mockBanditVariationStore.isInitialized.mockReturnValue(true);
      mockBanditModelStore.isInitialized.mockReturnValue(true);

      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      expect(config.isInitialized()).toBe(false);
    });

    it('should return false if any bandit store is uninitialized', () => {
      mockFlagStore.isInitialized.mockReturnValue(true);
      mockBanditVariationStore.isInitialized.mockReturnValue(true);
      mockBanditModelStore.isInitialized.mockReturnValue(false);

      const config = new StoreBackedConfiguration(
        mockFlagStore,
        mockBanditVariationStore,
        mockBanditModelStore,
      );

      expect(config.isInitialized()).toBe(false);
    });
  });

  describe('getBandits', () => {
    it('should return empty object when bandit store is null', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      expect(config.getBandits()).toEqual({});
    });

    it('should return bandits from store', () => {
      const mockBandits: Record<BanditKey, BanditParameters> = {
        'bandit-1': {
          banditKey: 'bandit-1',
          modelName: 'falcon',
          modelVersion: '123',
          modelData: {
            gamma: 0,
            defaultActionScore: 0,
            actionProbabilityFloor: 0,
            coefficients: {},
          },
        },
        'bandit-2': {
          banditKey: 'bandit-2',
          modelName: 'falcon',
          modelVersion: '123',
          modelData: {
            gamma: 0,
            defaultActionScore: 0,
            actionProbabilityFloor: 0,
            coefficients: {},
          },
        },
      };

      mockBanditModelStore.entries.mockReturnValue(mockBandits);

      const config = new StoreBackedConfiguration(mockFlagStore, null, mockBanditModelStore);

      expect(config.getBandits()).toEqual(mockBandits);
    });
  });

  describe('getBanditVariations', () => {
    it('should return empty variations when bandit variation store is null', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      expect(config.getBanditVariations()).toEqual({});
    });

    it('should return flag variations from store', () => {
      const mockVariations: Record<BanditKey, BanditVariation[]> = {
        'bandit-1': [
          {
            key: 'bandit-1',
            variationValue: 'true',
            flagKey: 'flag_with_bandit',
            variationKey: 'bandit-1',
          },
        ],
        'bandit-2': [
          {
            key: 'bandit-2',
            variationValue: 'true',
            flagKey: 'flag_with_bandit2',
            variationKey: 'bandit-2',
          },
        ],
      };

      mockBanditVariationStore.entries.mockReturnValue(mockVariations);

      const config = new StoreBackedConfiguration(mockFlagStore, mockBanditVariationStore);

      expect(config.getBanditVariations()['bandit-1']).toEqual([
        {
          key: 'bandit-1',
          variationValue: 'true',
          flagKey: 'flag_with_bandit',
          variationKey: 'bandit-1',
        },
      ]);
    });
  });

  describe('copy', () => {
    it('should prevent modification of stored config', () => {
      const config = new StoreBackedConfiguration(mockFlagStore);
      const mockFlag: Flag = { key: 'test-flag', enabled: true } as Flag;
      mockFlagStore.get.mockReturnValue(mockFlag);
      mockFlagStore.entries.mockReturnValue({ [mockFlag.key]: mockFlag });

      const storedFlag = config.getFlag('test-flag');
      expect(storedFlag?.enabled).toBeTruthy();

      const roConfig = config.copy();
      expect(roConfig).toBeInstanceOf(ImmutableConfiguration);

      const flag = roConfig.getFlag('test-flag');
      expect(flag).toBeTruthy();
      if (flag) {
        flag.enabled = false;
      } else {
        fail('flag is null');
      }

      expect(flag?.enabled).toBeFalsy();
      expect(storedFlag?.enabled).toBeTruthy();
    });
  });
});

describe('ImmutableConfiguration', () => {
  let config: ImmutableConfiguration;

  const mockFlags: Record<string, Flag> = {
    'feature-a': {
      key: 'feature-a',
      variationType: VariationType.BOOLEAN,
      enabled: true,
      variations: {},
      allocations: [],
      totalShards: 10_000,
    },
    'feature-b': {
      key: 'feature-b',
      variationType: VariationType.STRING,
      enabled: true,
      variations: {},
      allocations: [],
      totalShards: 10_000,
    },
  };

  const mockBanditVariations: Record<string, BanditVariation[]> = {
    'feature-a': [
      {
        key: 'bandit-1',
        variationValue: 'bandit-1',
        flagKey: 'feature-a',
        variationKey: 'bandit-1',
      },
    ],
  };

  const mockBandits: Record<string, BanditParameters> = {
    'bandit-1': {
      banditKey: 'bandit-1',
      modelName: 'falcon',
      modelVersion: 'v123',
      modelData: {
        gamma: 0,
        defaultActionScore: 0,
        actionProbabilityFloor: 0,
        coefficients: {},
      },
    },
  };

  const mockConfigDetails: ConfigDetails = {
    configEnvironment: { name: 'test' },
    configFormat: 'SERVER',
    configPublishedAt: '2024-03-20T00:00:00Z',
    configFetchedAt: '2024-03-20T00:00:00Z',
  };

  beforeEach(() => {
    config = new ImmutableConfiguration(
      mockFlags,
      true, // initialized
      false, // obfuscated
      mockConfigDetails,
      mockBanditVariations,
      mockBandits,
    );
  });

  describe('immutability', () => {
    it('should create deep copies of input data', () => {
      const originalFlags = { ...mockFlags };
      const flags = config.getFlags();

      // Attempt to modify the returned data
      flags['feature-a'].enabled = false;

      // Verify original configuration remains unchanged
      expect(originalFlags['feature-a'].enabled).toBeTruthy();
    });

    it('should create deep copies of bandit variations', () => {
      const variations = config.getBanditVariations();
      const originalVariation = [...mockBanditVariations['feature-a']];

      variations['feature-a'][0].variationValue = 'modified';

      expect(originalVariation[0].variationValue).toEqual('bandit-1');
    });

    it('should create deep copies of bandits', () => {
      const bandits = config.getBandits();
      const originalBandit = { ...mockBandits['bandit-1'] };

      bandits['bandit-1'].modelName = 'eagle';

      expect(originalBandit.modelName).toEqual('falcon');
    });

    it('should create deep copies of config details', () => {
      const details = config.getFlagConfigDetails();
      const originalDetails = { ...mockConfigDetails };

      details.configFormat = 'CLIENT';

      expect(originalDetails.configFormat).toEqual('SERVER');
    });
  });

  describe('flag operations', () => {
    it('should get existing flag', () => {
      expect(config.getFlag('feature-a')).toEqual(mockFlags['feature-a']);
    });

    it('should return null for non-existent flag', () => {
      expect(config.getFlag('non-existent')).toBeNull();
    });

    it('should get all flags', () => {
      expect(config.getFlags()).toEqual(mockFlags);
    });

    it('should get all flag keys', () => {
      expect(config.getFlagKeys()).toEqual(['feature-a', 'feature-b']);
    });
  });

  describe('bandit operations', () => {
    it('should get bandit variations for flag', () => {
      expect(config.getFlagBanditVariations('feature-a')).toEqual(
        mockBanditVariations['feature-a'],
      );
    });

    it('should return empty array for flag without bandit variations', () => {
      expect(config.getFlagBanditVariations('feature-b')).toEqual([]);
    });

    it('should get specific bandit', () => {
      expect(config.getBandit('bandit-1')).toEqual(mockBandits['bandit-1']);
    });

    it('should return null for non-existent bandit', () => {
      expect(config.getBandit('non-existent')).toBeNull();
    });

    it('should get flag variation bandit', () => {
      expect(config.getFlagVariationBandit('feature-a', 'bandit-1')).toEqual(
        mockBandits['bandit-1'],
      );
    });

    it('should return null for non-matching variation value', () => {
      expect(config.getFlagVariationBandit('feature-a', 'control')).toBeNull();
    });
  });

  describe('configuration state', () => {
    it('should return initialization state', () => {
      expect(config.isInitialized()).toBe(true);
    });

    it('should return obfuscation state', () => {
      expect(config.isObfuscated()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle configuration without bandit variations', () => {
      const configWithoutBandits = new ImmutableConfiguration(
        mockFlags,
        true,
        false,
        mockConfigDetails,
      );

      expect(configWithoutBandits.getBanditVariations()).toEqual({});
      expect(configWithoutBandits.getFlagBanditVariations('feature-a')).toEqual([]);
    });

    it('should handle configuration without bandits', () => {
      const configWithoutBandits = new ImmutableConfiguration(
        mockFlags,
        true,
        false,
        mockConfigDetails,
        mockBanditVariations,
      );

      expect(configWithoutBandits.getBandits()).toEqual({});
      expect(configWithoutBandits.getBandit('bandit-1')).toBeNull();
    });
  });
});
