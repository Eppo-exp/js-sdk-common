import { MOCK_UFC_RESPONSE_FILE, readMockUfcConfiguration, readMockUFCResponse } from '../../test/testHelpers';
import * as applicationLogger from '../application-logger';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { Flag, ObfuscatedFlag } from '../interfaces';

import EppoClient, { IContainerExperiment } from './eppo-client';
import { initConfiguration } from './test-utils';

type Container = { name: string };

describe('getExperimentContainerEntry', () => {
  const controlContainer: Container = { name: 'Control Container' };
  const treatment1Container: Container = { name: 'Treatment Variation 1 Container' };
  const treatment2Container: Container = { name: 'Treatment Variation 2 Container' };
  const treatment3Container: Container = { name: 'Treatment Variation 3 Container' };

  let client: EppoClient;
  let flagExperiment: IContainerExperiment<Container>;
  let getStringAssignmentSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    client = new EppoClient({ 
      configuration: {
        initializationStrategy: 'none',
        initialConfiguration: readMockUfcConfiguration(),
      },
      sdkKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '1.0.0',
      baseUrl: 'http://127.0.0.1:4000',
    });
    client.setIsGracefulFailureMode(true);
    flagExperiment = {
      flagKey: 'my-key',
      controlVariationEntry: controlContainer,
      treatmentVariationEntries: [treatment1Container, treatment2Container, treatment3Container],
    };
    getStringAssignmentSpy = jest.spyOn(client, 'getStringAssignment');
    loggerWarnSpy = jest.spyOn(applicationLogger.logger, 'warn');
  });

  afterAll(() => {
    getStringAssignmentSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('should return the right container when a treatment variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('treatment-2');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      treatment2Container,
    );

    jest.spyOn(client, 'getStringAssignment').mockReturnValue('treatment-3');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      treatment3Container,
    );
  });

  it('should return the right container when control is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('control');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should default to the control container if a treatment number cannot be parsed', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('treatment-asdf');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('should default to the control container if an unknown variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('adsfsadfsadf');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('should default to the control container if an out-of-bounds treatment variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('treatment-9');
    expect(client.getExperimentContainerEntry(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });
});
