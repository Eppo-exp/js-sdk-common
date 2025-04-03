import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import EppoClient from './eppo-client';

describe('EppoClient Switchbacks E2E test', () => {
  const flagStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditVariationStore = new MemoryOnlyConfigurationStore<BanditVariation[]>();
  const banditModelStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  let client: EppoClient;
  const mockLogAssignment = jest.fn();
  const mockLogBanditAction = jest.fn();

  beforeAll(async () => {
    // Mock out fetch to return the switchback flag configuration and model parameters
    global.fetch = jest.fn((url: string) => {
      const responseFile = url.includes('switchbacks')
        ? MOCK_SWITCHBACK_MODELS_RESPONSE_FILE
        : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;
      const response = readMockUFCResponse(responseFile);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });
    }) as jest.Mock;

    // Initialize a configuration requestor
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://127.0.0.1:4000',
      queryParams: {
        apiKey: 'dummy',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, 1000);
    const configurationRequestor = new ConfigurationRequestor(
      httpClient,
      flagStore,
      banditVariationStore,
      banditModelStore,
    );
    await configurationRequestor.fetchAndStoreConfigurations();
  });

  beforeEach(() => {
    client = new EppoClient({
      flagConfigurationStore: flagStore,
      banditVariationConfigurationStore: banditVariationStore,
      banditModelConfigurationStore: banditModelStore,
      isObfuscated: false,
    });
    client.setIsGracefulFailureMode(false);
    client.setAssignmentLogger({ logAssignment: mockLogAssignment });
    client.setBanditLogger({ logBanditAction: mockLogBanditAction });
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});
