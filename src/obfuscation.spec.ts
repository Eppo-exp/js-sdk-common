import { decodeBase64, encodeBase64 } from './obfuscation';

describe('obfuscation', () => {
  it('encodes strings to base64', () => {
    expect(encodeBase64('5.0')).toEqual('NS4w');
  });

  it('decodes base64 to string', () => {
    expect(Number(decodeBase64('NS4w'))).toEqual(5);
  });

  it('encodes/decodes regex', () => {
    const regexes = [
      '.*@example.com',
      '.*@.*.com$',
    ];

    regexes.forEach((regex) => {
      expect(decodeBase64(encodeBase64(regex))).toEqual(regex);
    })
  });
});
