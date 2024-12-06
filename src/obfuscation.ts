import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

import { PrecomputedFlag } from './interfaces';

export function getMD5Hash(input: string): string {
  return SparkMD5.hash(input);
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}

export function obfuscatePrecomputedFlags(
  precomputedFlags: Record<string, PrecomputedFlag>,
): Record<string, PrecomputedFlag> {
  const response: Record<string, PrecomputedFlag> = {};
  Object.keys(precomputedFlags).map((flagKey) => {
    const assignment = precomputedFlags[flagKey];

    response[getMD5Hash(flagKey)] = {
      variationType: assignment.variationType,
      extraLogging: assignment.extraLogging,
      doLog: assignment.doLog,
      allocationKey: getMD5Hash(assignment.allocationKey),
      variationKey: getMD5Hash(assignment.variationKey),
      variationValue: encodeBase64(assignment.variationValue),
    };
  });
  return response;
}
