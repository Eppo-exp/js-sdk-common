import { LIB_VERSION } from './version';

describe('Version Module', () => {
  it('should export a LIB_VERSION constant', () => {
    expect(LIB_VERSION).toBeDefined();
  });

  it('should match the version specified in package.json', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const packageJson = require('../package.json');
    expect(LIB_VERSION).toBe(packageJson.version);
  });
});
