import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

import { PrecomputedFlag } from './interfaces';

export function getMD5Hash(input: string, salt: string | null = null): string {
  const md5 = new SparkMD5();
  if (salt) {
    md5.append(salt);
  }
  return md5.append(input).end();
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
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
      Object.entries(assignment.extraLogging).map((kvArr) => kvArr.map(encodeBase64)),
    );

    const hashedKey = getMD5Hash(flagKey, salt);
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

export interface ISalt {
  saltString: string;
  base64String: string;
  bytes: Uint8Array;
}

class Salt implements ISalt {
  public readonly saltString: string;
  public readonly base64String: string;
  constructor(public readonly bytes: Uint8Array) {
    this.saltString = String.fromCharCode(...bytes);
    this.base64String = encodeBase64(this.saltString);
  }
}

let _saltOverride: ISalt | null = null;
export function setSaltOverrideForTests(salt: Uint8Array | null) {
  _saltOverride = salt ? new Salt(salt) : null;
}

export function generateSalt(length = 16): ISalt {
  if (_saltOverride) return _saltOverride;
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return new Salt(array);
}
