import { decodeBase64, encodeBase64 } from './obfuscation';

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
});
