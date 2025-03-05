import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { Flag, FormatEnum, ObfuscatedFlag, VariationType } from '../interfaces';
import * as overrideValidatorModule from '../override-validator';

import EppoClient from './eppo-client';

describe('EppoClient', () => {
  const storage = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();

  function setUnobfuscatedFlagEntries(
    entries: Record<string, Flag | ObfuscatedFlag>,
  ): Promise<boolean> {
    storage.setFormat(FormatEnum.SERVER);
    return storage.setEntries(entries);
  }

  const flagKey = 'mock-flag';

  const variationA = {
    key: 'a',
    value: 'variation-a',
  };

  const variationB = {
    key: 'b',
    value: 'variation-b',
  };

  const mockFlag: Flag = {
    key: flagKey,
    enabled: true,
    variationType: VariationType.STRING,
    variations: { a: variationA, b: variationB },
    allocations: [
      {
        key: 'allocation-a',
        rules: [],
        splits: [
          {
            shards: [],
            variationKey: 'a',
          },
        ],
        doLog: true,
      },
    ],
    totalShards: 10000,
  };

  let client: EppoClient;
  let subjectKey: string;

  beforeEach(async () => {
    await setUnobfuscatedFlagEntries({ [flagKey]: mockFlag });
    subjectKey = 'subject-10';
    client = new EppoClient({ flagConfigurationStore: storage });
  });

  describe('parseOverrides', () => {
    it('should parse a valid payload', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockResolvedValue(undefined);
      const result = await client.parseOverrides(
        JSON.stringify({
          browserExtensionKey: 'my-key',
          overrides: { [flagKey]: variationB },
        }),
      );
      expect(result).toEqual({ [flagKey]: variationB });
    });

    it('should throw an error if the key is missing', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockResolvedValue(undefined);
      expect(() =>
        client.parseOverrides(
          JSON.stringify({
            overrides: { [flagKey]: variationB },
          }),
        ),
      ).rejects.toThrow();
    });

    it('should throw an error if the key is not a string', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockResolvedValue(undefined);
      expect(() =>
        client.parseOverrides(
          JSON.stringify({
            browserExtensionKey: 123,
            overrides: { [flagKey]: variationB },
          }),
        ),
      ).rejects.toThrow();
    });

    it('should throw an error if the overrides are not parseable', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockResolvedValue(undefined);
      expect(() =>
        client.parseOverrides(`{
          browserExtensionKey: 'my-key',
          overrides: { [flagKey]: ,
        }`),
      ).rejects.toThrow();
    });

    it('should throw an error if overrides is not an object', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockResolvedValue(undefined);
      expect(() =>
        client.parseOverrides(
          JSON.stringify({
            browserExtensionKey: 'my-key',
            overrides: false,
          }),
        ),
      ).rejects.toThrow();
    });

    it('should throw an error if an invalid key is supplied', async () => {
      jest.spyOn(overrideValidatorModule, 'sendValidationRequest').mockImplementation(async () => {
        throw new Error(`Unable to authorize key`);
      });
      expect(() =>
        client.parseOverrides(
          JSON.stringify({
            browserExtensionKey: 'my-key',
            overrides: { [flagKey]: variationB },
          }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('withOverrides', () => {
    it('should create a new instance of EppoClient with specified overrides without affecting the original instance', () => {
      const clientWithOverrides = client.withOverrides({ [flagKey]: variationB });

      expect(client.getStringAssignment(flagKey, subjectKey, {}, 'default')).toBe('variation-a');
      expect(clientWithOverrides.getStringAssignment(flagKey, subjectKey, {}, 'default')).toBe(
        'variation-b',
      );
    });
  });
});
