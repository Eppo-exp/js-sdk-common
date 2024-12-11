import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

import { IPrecomputedBandit, PrecomputedFlag } from './interfaces';

export function getMD5Hash(input: string): string {
  return SparkMD5.hash(input);
}

function saltedHasher(salt: string) {
  return (input: string) => getMD5Hash(salt + input);
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}

export function obfuscatedPrecomputedBandits(
  salt: string,
  precomputedFlags: Record<string, IPrecomputedBandit>,
): Record<string, IPrecomputedBandit> {
  return {};
}

export function obfuscatePrecomputedFlags(
  salt: string,
  precomputedFlags: Record<string, PrecomputedFlag>,
): Record<string, PrecomputedFlag> {
  const response: Record<string, PrecomputedFlag> = {};
  const hash = saltedHasher(salt);

  Object.keys(precomputedFlags).map((flagKey) => {
    const assignment = precomputedFlags[flagKey];

    // Encode extraLogging keys and values.
    const encodedExtraLogging = Object.fromEntries(
      Object.entries(assignment.extraLogging).map((kvArr) => kvArr.map(encodeBase64)),
    );

    const hashedKey = hash(flagKey);
    response[hashedKey] = {
      flagKey: hashedKey,
      variationType: assignment.variationType,
      extraLogging: encodedExtraLogging,
      doLog: assignment.doLog,
      allocationKey: encodeBase64(assignment.allocationKey),
      variationKey: encodeBase64(assignment.variationKey),
      variationValue: encodeBase64(assignment.variationValue),
    };
  });
  return response;
}

export interface Salt {
  saltString: string;
  base64String: string;
  bytes: Uint8Array;
}

let _saltOverride: Salt | null = null;
export function setSaltOverrideForTests(salt: Salt | null) {
  _saltOverride = salt;
}

export function generateSalt(length = 16): Salt {
  if (_saltOverride) return _saltOverride;
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  const saltString = Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const base64String = encodeBase64(String.fromCharCode(...array));

  return {
    saltString,
    base64String,
    bytes: array,
  };
}
