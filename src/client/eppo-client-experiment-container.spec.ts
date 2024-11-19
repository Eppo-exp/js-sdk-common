import { MOCK_UFC_RESPONSE_FILE, readMockUFCResponse } from '../../test/testHelpers';
import * as applicationLogger from '../application-logger';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { Flag, ObfuscatedFlag } from '../interfaces';

import EppoClient, { IContainerExperiment } from './eppo-client';
import { initConfiguration } from './test-utils';

type Container = { name: string };

describe('getExperimentContainerEntry', () => {
  global.fetch = jest.fn(() => {
    const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ufc),
    });
  }) as jest.Mock;

  const controlContainer: Container = { name: 'Control Container' };
  const treatment1Container: Container = { name: 'Treatment Variation 1 Container' };
  const treatment2Container: Container = { name: 'Treatment Variation 2 Container' };
  const treatment3Container: Container = { name: 'Treatment Variation 3 Container' };

  let client: EppoClient;
  let flagExperiment: IContainerExperiment<Container>;
  let getStringAssignmentSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    const storage = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();
    await initConfiguration(storage);
    client = new EppoClient(storage);
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
