import { decodeBase64, encodeBase64, saltedHasher } from './obfuscation';

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

  describe('saltedHasher', () => {
    it('generates consistent hashes for same input and salt', () => {
      const input = 'test-input';
      const salt = 'test-salt';

      const hash1 = saltedHasher(salt)(input);
      const hash2 = saltedHasher(salt)(input);

      expect(hash1).toBe(hash2);
    });

    it('generates different hashes for different salts', () => {
      const input = 'test-input';
      const salt1 = 'salt1';
      const salt2 = 'salt2';

      const hash1 = saltedHasher(salt1)(input);
      const hash2 = saltedHasher(salt2)(input);

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hashes for different inputs with same salt', () => {
      const input1 = 'input1';
      const input2 = 'input2';
      const salt = 'same-salt';

      const hash1 = saltedHasher(salt)(input1);
      const hash2 = saltedHasher(salt)(input2);

      expect(hash1).not.toBe(hash2);
    });

    it('generates expected hash value', () => {
      const input = 'hello';
      const salt = 'world';
      const expectedHash = '5acd1fb6f07255681a2f6187123c0d39';

      const hash = saltedHasher(salt)(input);

      expect(hash).toBe(expectedHash);
    });
  });
});
