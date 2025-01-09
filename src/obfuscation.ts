import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

import { logger } from './application-logger';
import { PrecomputedFlag } from './interfaces';

// Import randomBytes according to the environment
let getRandomValues: (length: number) => Uint8Array;
if (typeof window !== 'undefined' && window.crypto) {
  // Browser environment
  getRandomValues = (length: number) => window.crypto.getRandomValues(new Uint8Array(length));
} else if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  // React Native environment
  require('react-native-get-random-values');
  getRandomValues = (length: number) => {
    const array = new Uint8Array(length);
    return window.crypto.getRandomValues(array);
  };
} else {
  // Node.js environment
  import('crypto')
    .then((crypto) => {
      getRandomValues = (length: number) => new Uint8Array(crypto.randomBytes(length));
      return;
    })
    .catch((error) => {
      logger.error('[Eppo SDK] Failed to load crypto module:', error);
    });
}

export function getMD5Hash(input: string, salt = ''): string {
  return new SparkMD5().append(salt).append(input).end();
}

export function encodeBase64(input: string) {
  return base64.encode(input);
}

export function decodeBase64(input: string) {
  return base64.decode(input);
}

export function obfuscatePrecomputedFlags(
  salt: string,
  precomputedFlags: Record<string, PrecomputedFlag>,
): Record<string, PrecomputedFlag> {
  const response: Record<string, PrecomputedFlag> = {};

  Object.keys(precomputedFlags).map((flagKey) => {
    const assignment = precomputedFlags[flagKey];

    // Encode extraLogging keys and values.
    const encodedExtraLogging = Object.fromEntries(
      Object.entries(assignment.extraLogging ?? {}).map((kvArr) => kvArr.map(encodeBase64)),
    );

    const hashedKey = getMD5Hash(flagKey, salt);
    response[hashedKey] = {
      flagKey: hashedKey,
      variationType: assignment.variationType,
      extraLogging: encodedExtraLogging,
      doLog: assignment.doLog,
      allocationKey: encodeBase64(assignment.allocationKey ?? ''),
      variationKey: encodeBase64(assignment.variationKey ?? ''),
      variationValue: encodeBase64(assignment.variationValue),
    };
  });
  return response;
}

let saltOverrideBytes: Uint8Array | null;
export function setSaltOverrideForTests(salt: Uint8Array | null) {
  saltOverrideBytes = salt ? salt : null;
}

export function generateSalt(length = 16): string {
  return base64.fromUint8Array(saltOverrideBytes ? saltOverrideBytes : getRandomValues(length));
}
