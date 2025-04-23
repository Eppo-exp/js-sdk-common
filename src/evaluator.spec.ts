import { Configuration } from './configuration';
import { Evaluator, hashKey, isInShardRange, matchesRules } from './evaluator';
import { Flag, Variation, Shard, VariationType, ConfigDetails, FormatEnum } from './interfaces';
import { getMD5Hash } from './obfuscation';
import { ObfuscatedOperatorType, OperatorType, Rule } from './rules';
import { DeterministicSharder } from './sharders';

describe('Evaluator', () => {
  const VARIATION_A: Variation = { key: 'a', value: 'A' };
  const VARIATION_B: Variation = { key: 'b', value: 'B' };
  const VARIATION_C: Variation = { key: 'c', value: 'C' };

  const evaluator = new Evaluator();

  let configuration: Configuration = Configuration.fromResponses({
    flags: {
      fetchedAt: new Date().toISOString(),
      response: {
        environment: {
          name: 'Test',
        },
        createdAt: new Date().toISOString(),
        flags: {},
        format: FormatEnum.SERVER,
        banditReferences: {},
      },
    },
  });

  it('should return none result for disabled flag', () => {
    const flag: Flag = {
      key: 'disabled_flag',
      enabled: false,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A },
      allocations: [
        {
          key: 'default',
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [{ salt: 'a', ranges: [{ start: 0, end: 10 }] }],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('disabled_flag');
    expect(result.assignmentDetails.allocationKey).toBeNull();
    expect(result.assignmentDetails.variation).toBeNull();
    expect(result.assignmentDetails.doLog).toBeFalsy();
  });

  it('should match shard with full range', () => {
    const shard: Shard = {
      salt: 'a',
      ranges: [{ start: 0, end: 100 }],
    };

    expect(evaluator.matchesShard(shard, 'subject_key', 100)).toBeTruthy();
  });

  it('should match shard with full range split', () => {
    const shard: Shard = {
      salt: 'a',
      ranges: [
        { start: 0, end: 50 },
        { start: 50, end: 100 },
      ],
    };

    expect(evaluator.matchesShard(shard, 'subject_key', 100)).toBeTruthy();

    const deterministicEvaluator = new Evaluator({
      sharder: new DeterministicSharder({ subject_key: 50 }),
    });
    expect(deterministicEvaluator.matchesShard(shard, 'subject_key', 100)).toBeTruthy();
  });

  it('should not match shard when out of range', () => {
    const shard: Shard = {
      salt: 'a',
      ranges: [{ start: 0, end: 50 }],
    };

    const evaluator = new Evaluator({ sharder: new DeterministicSharder({ 'a-subject_key': 99 }) });
    expect(evaluator.matchesShard(shard, 'subject_key', 100)).toBeFalsy();
  });

  it('should evaluate empty flag to none result', () => {
    const emptyFlag: Flag = {
      key: 'empty',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B },
      allocations: [],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, emptyFlag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('empty');
    expect(result.assignmentDetails.allocationKey).toBeNull();
    expect(result.assignmentDetails.variation).toBeNull();
    expect(result.assignmentDetails.doLog).toBeFalsy();
  });

  it('should evaluate simple flag and return control variation', () => {
    const flag: Flag = {
      key: 'flag-key',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { control: { key: 'control', value: 'control-value' } },
      allocations: [
        {
          key: 'allocation',
          rules: [],
          splits: [
            {
              variationKey: 'control',
              shards: [{ salt: 'salt', ranges: [{ start: 0, end: 10000 }] }],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10000,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'user-1', {});
    expect(result.assignmentDetails.variation).toEqual({ key: 'control', value: 'control-value' });
  });

  it('should evaluate flag based on a targeting condition based on id', () => {
    const flag: Flag = {
      key: 'flag-key',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { control: { key: 'control', value: 'control' } },
      allocations: [
        {
          key: 'allocation',
          rules: [
            {
              conditions: [
                { operator: OperatorType.ONE_OF, attribute: 'id', value: ['alice', 'bob'] },
              ],
            },
          ],
          splits: [
            {
              variationKey: 'control',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10000,
    };

    let result = evaluator.evaluateFlag(configuration, flag, 'alice', {});
    expect(result.assignmentDetails.variation).toEqual({ key: 'control', value: 'control' });

    result = evaluator.evaluateFlag(configuration, flag, 'bob', {});
    expect(result.assignmentDetails.variation).toEqual({ key: 'control', value: 'control' });

    result = evaluator.evaluateFlag(configuration, flag, 'charlie', {});
    expect(result.assignmentDetails.variation).toBeNull();
  });

  it('should evaluate flag based on a targeting condition with overwritten id', () => {
    const flag: Flag = {
      key: 'flag-key',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { control: { key: 'control', value: 'control' } },
      allocations: [
        {
          key: 'allocation',
          rules: [
            {
              conditions: [
                { operator: OperatorType.ONE_OF, attribute: 'id', value: ['alice', 'bob'] },
              ],
            },
          ],
          splits: [
            {
              variationKey: 'control',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10000,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'alice', { id: 'charlie' });
    expect(result.assignmentDetails.variation).toBeNull();
  });

  it('should catch all allocation and return variation A', () => {
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B },
      allocations: [
        {
          key: 'default',
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toEqual('default');
    expect(result.assignmentDetails.variation).toEqual(VARIATION_A);
    expect(result.assignmentDetails.doLog).toBeTruthy();
  });

  it('should match first allocation rule and return variation B', () => {
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B },
      allocations: [
        {
          key: 'first',
          rules: [
            {
              conditions: [
                { operator: OperatorType.MATCHES, attribute: 'email', value: '.*@example\\.com$' },
              ],
            },
          ],
          splits: [
            {
              variationKey: 'b',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
        {
          key: 'default',
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {
      email: 'eppo@example.com',
    });
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toEqual('first');
    expect(result.assignmentDetails.variation).toEqual(VARIATION_B);
  });

  it('should not match first allocation rule and return variation A', () => {
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B },
      allocations: [
        {
          key: 'first',
          rules: [
            {
              conditions: [
                { operator: OperatorType.MATCHES, attribute: 'email', value: '.*@example\\.com$' },
              ],
            },
          ],
          splits: [
            {
              variationKey: 'b',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
        {
          key: 'default',
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {
      email: 'eppo@test.com',
    });
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toEqual('default');
    expect(result.assignmentDetails.variation).toEqual(VARIATION_A);
  });

  it('should not match first allocation rule and return variation A (obfuscated)', () => {
    const flag: Flag = {
      key: 'obfuscated_flag_key',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B },
      allocations: [
        {
          key: 'first',
          rules: [
            {
              conditions: [
                {
                  operator: ObfuscatedOperatorType.MATCHES,
                  attribute: getMD5Hash('email'),
                  value: 'LipAZXhhbXBsZVxcLmNvbSQ=', //encodeBase64('.*@example\\.com$')
                },
              ],
            },
          ],
          splits: [
            {
              variationKey: 'b',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
        {
          key: 'default',
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {
      email: 'eppo@test.com',
    });
    expect(result.assignmentDetails.flagKey).toEqual('obfuscated_flag_key');
    expect(result.assignmentDetails.allocationKey).toEqual('default');
    expect(result.assignmentDetails.variation).toEqual(VARIATION_A);
  });

  it('should evaluate sharding and return correct variations', () => {
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A, b: VARIATION_B, c: VARIATION_C },
      allocations: [
        {
          key: 'first',
          splits: [
            {
              variationKey: 'a',
              shards: [
                { salt: 'traffic', ranges: [{ start: 0, end: 5 }] },
                { salt: 'split', ranges: [{ start: 0, end: 3 }] },
              ],
              extraLogging: {},
            },
            {
              variationKey: 'b',
              shards: [
                { salt: 'traffic', ranges: [{ start: 0, end: 5 }] },
                { salt: 'split', ranges: [{ start: 3, end: 6 }] },
              ],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
        {
          key: 'default',
          splits: [
            {
              variationKey: 'c',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const deterministicEvaluator = new Evaluator({
      sharder: new DeterministicSharder({
        'traffic-alice': 2,
        'traffic-bob': 3,
        'traffic-charlie': 4,
        'traffic-dave': 7,
        'split-alice': 1,
        'split-bob': 4,
        'split-charlie': 8,
        'split-dave': 1,
      }),
    });

    expect(
      deterministicEvaluator.evaluateFlag(configuration, flag, 'alice', {}).assignmentDetails
        .variation,
    ).toEqual(VARIATION_A);
    expect(
      deterministicEvaluator.evaluateFlag(configuration, flag, 'bob', {}).assignmentDetails
        .variation,
    ).toEqual(VARIATION_B);
    expect(
      deterministicEvaluator.evaluateFlag(configuration, flag, 'charlie', {}).assignmentDetails
        .variation,
    ).toEqual(VARIATION_C);
    expect(
      deterministicEvaluator.evaluateFlag(configuration, flag, 'dave', {}).assignmentDetails
        .variation,
    ).toEqual(VARIATION_C);
  });

  it('should not match on allocation before startAt has passed', () => {
    const now = new Date();
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A },
      allocations: [
        {
          key: 'default',
          startAt: new Date(now.getFullYear() + 1, 0, 1).toISOString(),
          endAt: new Date(now.getFullYear() + 1, 1, 1).toISOString(),
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toBeNull();
    expect(result.assignmentDetails.variation).toBeNull();
  });

  it('should return correct variation for evaluation during allocation', () => {
    const now = new Date();
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A },
      allocations: [
        {
          key: 'default',
          startAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
          endAt: new Date(now.getFullYear() + 1, 0, 1).toISOString(),
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toEqual('default');
    expect(result.assignmentDetails.variation).toEqual(VARIATION_A);
  });

  it('should not match on allocation after endAt has passed', () => {
    const now = new Date();
    const flag: Flag = {
      key: 'flag',
      enabled: true,
      variationType: VariationType.STRING,
      variations: { a: VARIATION_A },
      allocations: [
        {
          key: 'default',
          startAt: new Date(now.getFullYear() - 2, 0, 1).toISOString(),
          endAt: new Date(now.getFullYear() - 1, 0, 1).toISOString(),
          rules: [],
          splits: [
            {
              variationKey: 'a',
              shards: [],
              extraLogging: {},
            },
          ],
          doLog: true,
        },
      ],
      totalShards: 10,
    };

    const result = evaluator.evaluateFlag(configuration, flag, 'subject_key', {});
    expect(result.assignmentDetails.flagKey).toEqual('flag');
    expect(result.assignmentDetails.allocationKey).toBeNull();
    expect(result.assignmentDetails.variation).toBeNull();
  });

  it('should create a hash key that appends subject to salt', () => {
    expect(hashKey('salt', 'subject')).toEqual('salt-subject');
  });

  it('should correctly determine if a shard is within a range', () => {
    expect(isInShardRange(5, { start: 0, end: 10 })).toBeTruthy();
    expect(isInShardRange(10, { start: 0, end: 10 })).toBeFalsy();
    expect(isInShardRange(0, { start: 0, end: 10 })).toBeTruthy();
    expect(isInShardRange(0, { start: 0, end: 0 })).toBeFalsy();
    expect(isInShardRange(0, { start: 0, end: 1 })).toBeTruthy();
    expect(isInShardRange(1, { start: 0, end: 1 })).toBeFalsy();
    expect(isInShardRange(1, { start: 1, end: 1 })).toBeFalsy();
  });
});

describe('matchesRules', () => {
  describe('matchesRules function', () => {
    it('should return true when there are no rules', () => {
      const rules: Rule[] = [];
      const subjectAttributes = { id: 'test-subject' };
      const obfuscated = false;
      expect(matchesRules(rules, subjectAttributes, obfuscated).matched).toBeTruthy();
    });

    it('should return true when a rule matches', () => {
      const rules: Rule[] = [
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.GTE,
              value: 18,
            },
          ],
        },
      ];
      const subjectAttributes = { id: 'test-subject', age: 20 };
      const obfuscated = false;
      expect(matchesRules(rules, subjectAttributes, obfuscated).matched).toBeTruthy();
    });

    it('should return true when one of two rules matches', () => {
      const rules: Rule[] = [
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.GTE,
              value: 18,
            },
          ],
        },
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.LTE,
              value: 10,
            },
          ],
        },
      ];
      const subjectAttributes = { id: 'test-subject', age: 10 };
      const obfuscated = false;
      expect(matchesRules(rules, subjectAttributes, obfuscated).matched).toBeTruthy();
    });

    it('should return true when null or rule is passed', () => {
      const rules: Rule[] = [
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.IS_NULL,
              value: true,
            },
          ],
        },
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.GTE,
              value: 20,
            },
          ],
        },
      ];
      const obfuscated = false;
      expect(matchesRules(rules, { id: 'test-subject', age: 20 }, obfuscated).matched).toBeTruthy();
      expect(matchesRules(rules, { id: 'test-subject', age: 10 }, obfuscated).matched).toBeFalsy();
      expect(
        matchesRules(rules, { id: 'test-subject', country: 'UK' }, obfuscated).matched,
      ).toBeTruthy();
    });

    it('should return false when no rules match', () => {
      const rules: Rule[] = [
        {
          conditions: [
            {
              attribute: 'age',
              operator: OperatorType.GTE,
              value: 18,
            },
          ],
        },
      ];
      const subjectAttributes = { id: 'test-subject', age: 16 };
      const obfuscated = false;
      expect(matchesRules(rules, subjectAttributes, obfuscated).matched).toBeFalsy();
    });
  });
});
