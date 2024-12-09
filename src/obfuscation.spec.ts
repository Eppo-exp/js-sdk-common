import { decodeBase64, encodeBase64, getMD5HashWithSalt } from './obfuscation';

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

  describe('getMD5HashWithSalt', () => {
    it('generates consistent hashes for same input and salt', () => {
      const input = 'test-input';
      const salt = 'test-salt';

      const hash1 = getMD5HashWithSalt(input, salt);
      const hash2 = getMD5HashWithSalt(input, salt);

      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different salts', () => {
      const input = 'test-input';
      const salt1 = 'salt1';
      const salt2 = 'salt2';

      const hash1 = getMD5HashWithSalt(input, salt1);
      const hash2 = getMD5HashWithSalt(input, salt2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different inputs with same salt', () => {
      const input1 = 'input1';
      const input2 = 'input2';
      const salt = 'same-salt';

      const hash1 = getMD5HashWithSalt(input1, salt);
      const hash2 = getMD5HashWithSalt(input2, salt);

      expect(hash1).not.toBe(hash2);
    });

    it('generates expected hash value', () => {
      const input = 'hello';
      const salt = 'world';
      const expectedHash = '5acd1fb6f07255681a2f6187123c0d39';

      const hash = getMD5HashWithSalt(input, salt);

      expect(hash).toBe(expectedHash);
    });
  });
});
