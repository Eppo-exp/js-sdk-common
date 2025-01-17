import {
  decodeAllocation,
  decodePrecomputedBandit,
  decodeSplit,
  decodeValue,
  decodeVariations,
} from './decoding';
import {
  VariationType,
  ObfuscatedVariation,
  Variation,
  IObfuscatedPrecomputedBandit,
} from './interfaces';

describe('decoding', () => {
  describe('decodeVariations', () => {
    it('should correctly decode variations', () => {
      const encodedVariations: Record<string, ObfuscatedVariation> = {
        'Y29udHJvbA==': {
          key: 'Y29udHJvbA==',
          value: 'MA==',
        },
        dHJlYXRtZW50: {
          key: 'dHJlYXRtZW50',
          value: 'MQ==',
        },
      };

      const expectedVariations: Record<string, Variation> = {
        control: {
          key: 'control',
          value: 0,
        },
        treatment: {
          key: 'treatment',
          value: 1,
        },
      };

      expect(decodeVariations(encodedVariations, VariationType.INTEGER)).toEqual(
        expectedVariations,
      );
    });
  });

  describe('decodeValue', () => {
    it('should correctly decode string values', () => {
      expect(decodeValue('Y29udHJvbA==', VariationType.STRING)).toEqual('control');
    });
    it('should correctly decode integer values', () => {
      expect(decodeValue('NDI=', VariationType.INTEGER)).toEqual(42);
    });
    it('should correctly decode numeric values', () => {
      expect(decodeValue('My4xNDE1OTI2NTM1OQ==', VariationType.NUMERIC)).toEqual(3.14159265359);
    });
    it('should correctly decode "true" boolean values', () => {
      expect(decodeValue('dHJ1ZQ==', VariationType.BOOLEAN)).toEqual(true);
    });
    it('should correctly decode "false" boolean values', () => {
      expect(decodeValue('ZmFsc2U=', VariationType.BOOLEAN)).toEqual(false);
    });

    it('should correctly decode JSON values', () => {
      expect(
        JSON.parse(
          decodeValue(
            'eyJoZWxsbyI6ICJ3b3JsZCIsICJieWUiOiAid29ybGQifQ==',
            VariationType.JSON,
          ) as string,
        ),
      ).toEqual({ hello: 'world', bye: 'world' });
    });
  });
  describe('decodeSplit', () => {
    it('should correctly decode split without extra logging', () => {
      const obfuscatedSplit = {
        shards: [
          {
            salt: 'c2FsdA==',
            ranges: [
              {
                start: 0,
                end: 100,
              },
            ],
          },
        ],
        variationKey: 'Y29udHJvbA==',
      };

      const expectedSplit = {
        shards: [
          {
            salt: 'salt',
            ranges: [
              {
                start: 0,
                end: 100,
              },
            ],
          },
        ],
        variationKey: 'control',
      };

      expect(decodeSplit(obfuscatedSplit)).toEqual(expectedSplit);
    });
    it('should correctly decode split with extra logging', () => {
      const obfuscatedSplit = {
        shards: [
          {
            salt: 'c2FsdA==',
            ranges: [
              {
                start: 0,
                end: 100,
              },
            ],
          },
        ],
        variationKey: 'Y29udHJvbA==',
        extraLogging: { 'aGVsbG8=': 'd29ybGQ=', Ynll: 'd29ybGQ=' },
      };

      const expectedSplit = {
        shards: [
          {
            salt: 'salt',
            ranges: [
              {
                start: 0,
                end: 100,
              },
            ],
          },
        ],
        variationKey: 'control',
        extraLogging: {
          hello: 'world',
          bye: 'world',
        },
      };

      expect(decodeSplit(obfuscatedSplit)).toEqual(expectedSplit);
    });
  });

  describe('decodeAllocation', () => {
    it('should correctly decode allocation without startAt and endAt', () => {
      const obfuscatedAllocation = {
        key: 'ZXhwZXJpbWVudA==',
        rules: [],
        splits: [], // tested in decodeSplit
        doLog: true,
      };

      const expectedAllocation = {
        key: 'experiment',
        rules: [],
        splits: [],
        doLog: true,
      };

      expect(decodeAllocation(obfuscatedAllocation)).toEqual(expectedAllocation);
    });

    it('should correctly decode allocation with startAt and endAt', () => {
      const obfuscatedAllocation = {
        key: 'ZXhwZXJpbWVudA==',
        startAt: 'MjAyMC0wNC0wMVQxODo1ODo1NS44Mjla',
        endAt: 'MjAyNS0wNy0yOVQwOTowMDoxMy4yMDVa',
        rules: [],
        splits: [], // tested in decodeSplit
        doLog: true,
      };

      const expectedAllocation = {
        key: 'experiment',
        rules: [],
        splits: [],
        doLog: true,
        startAt: '2020-04-01T18:58:55.829Z',
        endAt: '2025-07-29T09:00:13.205Z',
      };

      expect(decodeAllocation(obfuscatedAllocation)).toEqual(expectedAllocation);
    });
  });

  describe('decode bandit', () => {
    it('should correctly decode bandit', () => {
      const encodedBandit = {
        action: 'Z3JlZW5CYWNrZ3JvdW5k',
        actionCategoricalAttributes: {
          'Y29sb3I=': 'Z3JlZW4=',
          'dHlwZQ==': 'YmFja2dyb3VuZA==',
        },
        actionNumericAttributes: { Zm9udEhlaWdodEVt: 'MTA=' },
        actionProbability: 0.95,
        banditKey: 'bGF1bmNoLWJ1dHRvbi10cmVhdG1lbnQ=',
        modelVersion: 'MzI0OQ==',
        optimalityGap: 0,
      } as IObfuscatedPrecomputedBandit;

      const decodedBandit = decodePrecomputedBandit(encodedBandit);

      expect(decodedBandit).toEqual({
        action: 'greenBackground',
        actionCategoricalAttributes: {
          color: 'green',
          type: 'background',
        },
        actionNumericAttributes: {
          fontHeightEm: 10,
        },
        actionProbability: 0.95,
        banditKey: 'launch-button-treatment',
        modelVersion: '3249',
        optimalityGap: 0,
      });
    });
  });
});
