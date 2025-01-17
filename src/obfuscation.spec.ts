import { IPrecomputedBandit } from './interfaces';
import { decodeBase64, encodeBase64, obfuscatePrecomputedBanditMap } from './obfuscation';

describe('obfuscation', () => {
  it('encodes strings to base64', () => {
    expect(encodeBase64('5.0')).toEqual('NS4w');
  });

  it('decodes base64 to string', () => {
    expect(decodeBase64('NS4w')).toEqual('5.0');
  });

  it('encodes/decodes regex', () => {
    const regexes = ['.*@example.com', '.*@.*.com$', 'hello world'];

    regexes.forEach((regex) => {
      expect(decodeBase64(encodeBase64(regex))).toEqual(regex);
    });
  });

  it('encodes/decodes special characters', () => {
    const strings = ['kümmert', 'піклуватися', '照顾', '🤗🌸'];

    strings.forEach((string) => {
      expect(decodeBase64(encodeBase64(string))).toEqual(string);
      expect(decodeBase64(encodeBase64(string))).toEqual(string);
    });

    expect(decodeBase64('a8O8bW1lcnQ=')).toEqual('kümmert');
  });

  describe('bandit obfuscation', () => {
    it('obfuscates precomputed bandits', () => {
      const bandit: IPrecomputedBandit = {
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
      };

      const encodedBandit = obfuscatePrecomputedBanditMap('', {
        'launch-button-treatment': bandit,
      });

      expect(encodedBandit).toEqual({
        '0ae2ece7bf09e40dd6b28a02574a4826': {
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
        },
      });
    });
  });
});
