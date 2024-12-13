import { decodeBase64, encodeBase64, generateSalt, setSaltOverrideForTests } from './obfuscation';

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

  describe('salt', () => {
    it('converts from bytes to base64 string', () => {
      const chars = new Uint8Array([101, 112, 112, 111]); // eppo
      setSaltOverrideForTests(chars);

      const salt64 = generateSalt();
      expect(salt64).toEqual('ZXBwbw==');
    });
  });
});
