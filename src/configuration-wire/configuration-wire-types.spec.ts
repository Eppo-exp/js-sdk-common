import {
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  readMockUFCResponse,
} from '../../test/testHelpers';
import { IUniversalFlagConfigResponse, IBanditParametersResponse } from '../http-client';
import { FormatEnum } from '../interfaces';

import { ConfigurationWireV1, deflateResponse, inflateResponse } from './configuration-wire-types';

describe('Response String Type Safety', () => {
  const mockFlagConfig: IUniversalFlagConfigResponse = readMockUFCResponse(
    MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  ) as IUniversalFlagConfigResponse;
  const mockBanditConfig: IBanditParametersResponse = readMockUFCResponse(
    MOCK_BANDIT_MODELS_RESPONSE_FILE,
  ) as IBanditParametersResponse;

  describe('deflateResponse and inflateResponse', () => {
    it('should correctly serialize and deserialize flag config', () => {
      const serialized = deflateResponse(mockFlagConfig);
      const deserialized = inflateResponse(serialized);

      expect(deserialized).toEqual(mockFlagConfig);
    });

    it('should correctly serialize and deserialize bandit config', () => {
      const serialized = deflateResponse(mockBanditConfig);
      const deserialized = inflateResponse(serialized);

      expect(deserialized).toEqual(mockBanditConfig);
    });

    it('should maintain type information through serialization', () => {
      const serialized = deflateResponse(mockFlagConfig);
      const deserialized = inflateResponse(serialized);

      // TypeScript compilation check: these should work
      expect(deserialized.format).toBe(FormatEnum.SERVER);
      expect(deserialized.environment).toStrictEqual({ name: 'Test' });
    });
  });

  describe('ConfigurationWireV1', () => {
    it('should create configuration with flag config', () => {
      const wirePacket = ConfigurationWireV1.fromResponses(mockFlagConfig);

      expect(wirePacket.version).toBe(1);
      expect(wirePacket.config).toBeDefined();
      expect(wirePacket.bandits).toBeUndefined();

      // Verify we can deserialize the response
      expect(wirePacket.config).toBeTruthy();
      if (!wirePacket.config) {
        fail('Flag config not present in ConfigurationWire');
      }
      const deserializedConfig = inflateResponse(wirePacket.config.response);
      expect(deserializedConfig).toEqual(mockFlagConfig);
    });

    it('should create configuration with both flag and bandit configs', () => {
      const wirePacket = ConfigurationWireV1.fromResponses(
        mockFlagConfig,
        mockBanditConfig,
        'flag-etag',
        'bandit-etag',
      );

      if (!wirePacket.config) {
        fail('Flag config not present in ConfigurationWire');
      }
      if (!wirePacket.bandits) {
        fail('Bandit Model Parameters not present in ConfigurationWire');
      }

      expect(wirePacket.version).toBe(1);
      expect(wirePacket.config).toBeDefined();
      expect(wirePacket.bandits).toBeDefined();
      expect(wirePacket.config.etag).toBe('flag-etag');
      expect(wirePacket.bandits.etag).toBe('bandit-etag');

      // Verify we can deserialize both responses
      const deserializedConfig = inflateResponse(wirePacket.config.response);
      const deserializedBandits = inflateResponse(wirePacket.bandits.response);

      expect(deserializedConfig).toEqual(mockFlagConfig);
      expect(deserializedBandits).toEqual(mockBanditConfig);
    });

    it('should create empty configuration', () => {
      const config = ConfigurationWireV1.empty();

      expect(config.version).toBe(1);
      expect(config.config).toBeUndefined();
      expect(config.bandits).toBeUndefined();
      expect(config.precomputed).toBeUndefined();
    });

    it('should include fetchedAt timestamps', () => {
      const wirePacket = ConfigurationWireV1.fromResponses(mockFlagConfig, mockBanditConfig);

      if (!wirePacket.config) {
        fail('Flag config not present in ConfigurationWire');
      }
      if (!wirePacket.bandits) {
        fail('Bandit Model Parameters not present in ConfigurationWire');
      }
      expect(wirePacket.config.fetchedAt).toBeDefined();
      expect(Date.parse(wirePacket.config.fetchedAt ?? '')).not.toBeNaN();
      expect(Date.parse(wirePacket.bandits.fetchedAt ?? '')).not.toBeNaN();
    });
  });
});
