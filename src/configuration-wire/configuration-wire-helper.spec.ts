import { IBanditParametersResponse, IUniversalFlagConfigResponse } from '../http-client';
import { FormatEnum } from '../interfaces';
import { getMD5Hash } from '../obfuscation';

import { ConfigurationWireHelper } from './configuration-wire-helper';

const TEST_BASE_URL = 'https://us-central1-eppo-qa.cloudfunctions.net/serveGitHubRacTestFile';
const DUMMY_SDK_KEY = 'dummy-sdk-key';

// This SDK causes the cloud endpoint below to serve the UFC test file with bandit flags.
const BANDIT_SDK_KEY = 'this-key-serves-bandits';

describe('ConfigurationWireHelper', () => {
  describe('getBootstrapConfigurationFromApi', () => {
    it('should fetch obfuscated flags with android SDK', async () => {
      const helper = ConfigurationWireHelper.build(DUMMY_SDK_KEY, {
        sdkName: 'android',
        sdkVersion: '4.0.0',
        baseUrl: TEST_BASE_URL,
      });

      const wirePacket = await helper.fetchConfiguration();

      expect(wirePacket.version).toBe(1);
      expect(wirePacket.config).toBeDefined();

      if (!wirePacket.config) {
        throw new Error('Flag config not present in ConfigurationWire');
      }

      const configResponse = JSON.parse(wirePacket.config.response) as IUniversalFlagConfigResponse;
      expect(configResponse.format).toBe(FormatEnum.CLIENT);
      expect(configResponse.flags).toBeDefined();
      expect(Object.keys(configResponse.flags).length).toBeGreaterThan(1);
      expect(Object.keys(configResponse.flags)).toHaveLength(23); // Hardcoded number of flags in the shared test file.

      const testFlagKey = getMD5Hash('numeric_flag');
      expect(Object.keys(configResponse.flags)).toContain(testFlagKey);

      // No bandits.
      expect(configResponse.banditReferences).toBeUndefined();
      expect(wirePacket.bandits).toBeUndefined();
    });

    it('should fetch flags and bandits for node-server SDK', async () => {
      const helper = ConfigurationWireHelper.build(BANDIT_SDK_KEY, {
        sdkName: 'node-server',
        sdkVersion: '4.0.0',
        baseUrl: TEST_BASE_URL,
        fetchBandits: true,
      });

      const wirePacket = await helper.fetchConfiguration();

      expect(wirePacket.version).toBe(1);
      expect(wirePacket.config).toBeDefined();

      if (!wirePacket.config) {
        throw new Error('Flag config not present in ConfigurationWire');
      }

      const configResponse = JSON.parse(wirePacket.config.response) as IUniversalFlagConfigResponse;
      expect(configResponse.format).toBe(FormatEnum.SERVER);
      expect(configResponse.flags).toBeDefined();
      expect(configResponse.banditReferences).toBeDefined();
      expect(Object.keys(configResponse.flags)).toContain('banner_bandit_flag');
      expect(Object.keys(configResponse.flags)).toContain('car_bandit_flag');

      expect(wirePacket.bandits).toBeDefined();
      const banditResponse = JSON.parse(
        wirePacket.bandits?.response ?? '',
      ) as IBanditParametersResponse;
      expect(Object.keys(banditResponse.bandits).length).toBeGreaterThan(1);
      expect(Object.keys(banditResponse.bandits)).toContain('banner_bandit');
      expect(Object.keys(banditResponse.bandits)).toContain('car_bandit');
    });

    it('should include fetchedAt timestamps', async () => {
      const helper = ConfigurationWireHelper.build(BANDIT_SDK_KEY, {
        sdkName: 'node-server',
        baseUrl: TEST_BASE_URL,
        fetchBandits: true,
      });

      const wirePacket = await helper.fetchConfiguration();

      if (!wirePacket.config) {
        throw new Error('Flag config not present in ConfigurationWire');
      }
      if (!wirePacket.bandits) {
        throw new Error('Bandit config not present in ConfigurationWire');
      }

      expect(wirePacket.config.fetchedAt).toBeDefined();
      expect(Date.parse(wirePacket.config.fetchedAt ?? '')).not.toBeNaN();
      expect(Date.parse(wirePacket.bandits.fetchedAt ?? '')).not.toBeNaN();
    });
  });
});
