import { logger } from '../application-logger';
import { IAssignmentLogger } from '../assignment-logger';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { Flag, FormatEnum, PrecomputedFlag, VariationType } from '../interfaces';
import { encodeBase64, getMD5Hash } from '../obfuscation';

import EppoClient from './eppo-client';
import EppoPrecomputedClient from './eppo-precomputed-client';

const flag: Flag = {
  key: 'flag',
  enabled: true,
  variationType: VariationType.STRING,
  variations: { A: { key: 'A', value: 'A' } },
  allocations: [
    {
      key: 'allocation',
      rules: [],
      splits: [{ shards: [], variationKey: 'A' }],
      doLog: true,
    },
  ],
  totalShards: 10000,
};

async function createClient(precomputed: boolean) {
  if (precomputed) {
    const store = new MemoryOnlyConfigurationStore<PrecomputedFlag>();
    store.setFormat(FormatEnum.PRECOMPUTED);
    store.salt = 'test-salt';
    await store.setEntries(
      Object.fromEntries(
        Array.from({ length: MAX_EVENT_QUEUE_SIZE + 1 }, (_, i) => {
          const flagKey = getMD5Hash(`flag-${i}`, store.salt);
          return [
            flagKey,
            {
              flagKey,
              allocationKey: encodeBase64('allocation'),
              variationKey: encodeBase64('A'),
              variationValue: encodeBase64('A'),
              variationType: VariationType.STRING,
              doLog: true,
              extraLogging: {},
            },
          ];
        }),
      ),
    );
    const client = new EppoPrecomputedClient({
      precomputedFlagStore: store,
      subject: { subjectKey: 'subject', subjectAttributes: {} },
    });
    client.useNonExpiringInMemoryAssignmentCache();
    return {
      evaluate: (i: number) => client.getStringAssignment(`flag-${i}`, 'default'),
      setLogger: (logger: IAssignmentLogger) => client.setAssignmentLogger(logger),
      setVariation: (variation: string) => {
        const key = getMD5Hash('flag-0', store.salt);
        return store.setEntries({
          [key]: {
            ...store.get(key)!,
            variationKey: encodeBase64(variation),
            variationValue: encodeBase64(variation),
          },
        });
      },
    };
  }
  const store = new MemoryOnlyConfigurationStore<Flag>();
  store.setFormat(FormatEnum.SERVER);
  await store.setEntries({ flag });
  const client = new EppoClient({ flagConfigurationStore: store });
  client.useNonExpiringInMemoryAssignmentCache();
  return {
    evaluate: (i: number) => client.getStringAssignment('flag', `subject-${i}`, {}, 'default'),
    setLogger: (logger: IAssignmentLogger) => client.setAssignmentLogger(logger),
    setVariation: (variation: string) =>
      store.setEntries({
        flag: {
          ...flag,
          variations: { [variation]: { key: variation, value: variation } },
          allocations: [
            { ...flag.allocations[0], splits: [{ shards: [], variationKey: variation }] },
          ],
        },
      }),
  };
}

describe.each([false, true])('assignment logging queue (precomputed: %s)', (precomputed) => {
  afterEach(() => jest.restoreAllMocks());

  it('does not mark an assignment as logged when a full queue drops it', async () => {
    jest.spyOn(logger, 'warn').mockImplementation();
    const client = await createClient(precomputed);
    for (let i = 0; i <= MAX_EVENT_QUEUE_SIZE; i++) expect(client.evaluate(i)).toBe('A');
    const logAssignment = jest.fn();
    client.setLogger({ logAssignment });
    expect(logAssignment).toHaveBeenCalledTimes(MAX_EVENT_QUEUE_SIZE);
    expect(client.evaluate(MAX_EVENT_QUEUE_SIZE)).toBe('A');
    expect(logAssignment).toHaveBeenCalledTimes(MAX_EVENT_QUEUE_SIZE + 1);
    client.evaluate(MAX_EVENT_QUEUE_SIZE);
    expect(logAssignment).toHaveBeenCalledTimes(MAX_EVENT_QUEUE_SIZE + 1);
  });

  it('retries on evaluation when logging a queued assignment fails', async () => {
    jest.spyOn(logger, 'error').mockImplementation();
    const client = await createClient(precomputed);
    client.evaluate(0);
    const logAssignment = jest.fn().mockImplementationOnce(() => {
      throw new Error('logger failed');
    });
    client.setLogger({ logAssignment });
    client.evaluate(0);
    expect(logAssignment).toHaveBeenCalledTimes(2);
    client.evaluate(0);
    expect(logAssignment).toHaveBeenCalledTimes(2);
  });

  it('deduplicates queued assignments and preserves deduplication after flushing', async () => {
    const client = await createClient(precomputed);
    client.evaluate(0);
    client.evaluate(0);
    const logAssignment = jest.fn();
    client.setLogger({ logAssignment });
    client.evaluate(0);
    expect(logAssignment).toHaveBeenCalledTimes(1);
  });

  it('preserves A to B to A transitions while the logger is not yet installed', async () => {
    const client = await createClient(precomputed);
    for (const variation of ['A', 'B', 'A']) {
      await client.setVariation(variation);
      expect(client.evaluate(0)).toBe(variation);
      expect(client.evaluate(0)).toBe(variation);
    }
    const logAssignment = jest.fn();
    client.setLogger({ logAssignment });
    expect(logAssignment.mock.calls.map(([event]) => event.variation)).toEqual(['A', 'B', 'A']);
    client.evaluate(0);
    expect(logAssignment).toHaveBeenCalledTimes(3);
  });
});
