import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

import { IPrecomputedBandit, PrecomputedFlag } from './interfaces';

export function getMD5Hash(input: string, salt = ''): string {
  return new SparkMD5().append(salt).append(input).end();
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}

export function obfuscatePrecomputedBandits(
  salt: string,
  bandits: Record<string, IPrecomputedBandit>,
): Record<string, IPrecomputedBandit> {
  const obfuscatedBandits: Record<string, IPrecomputedBandit> = {};

  Object.entries(bandits).forEach((entry) => {
    const [banditKey, banditResult] = entry;

    // Encode metaData keys and values.
    const encodedMetaData = Object.fromEntries(
      Object.entries(banditResult.metaData).map((kvArr) => [
        encodeBase64(kvArr[0]),
        typeof kvArr[1] === 'string' ? encodeBase64(kvArr[1]) : kvArr[1],
      ]),
    ) as Record<string, unknown>;

    const encodedAttributes = {
      categoricalAttributes: Object.fromEntries(
        Object.entries(banditResult.actionAttributes.categoricalAttributes).map((kvArr) => [
          encodeBase64(kvArr[0]),
          typeof kvArr[1] === 'string' ? encodeBase64(kvArr[1]) : kvArr[1],
        ]),
      ),
      numericAttributes: Object.fromEntries(
        Object.entries(banditResult.actionAttributes.numericAttributes).map((kvArr) => [
          encodeBase64(kvArr[0]),
          kvArr[1], // Numeric data is not expected to be encoded
        ]),
      ),
    };
    const hashedKey = getMD5Hash(salt + banditKey); //flagKey, salt);
    obfuscatedBandits[hashedKey] = {
      action: banditResult.action ? encodeBase64(banditResult.action) : null,
      variation: hashedKey,
      actionProbability: banditResult.actionProbability,
      optimalityGap: banditResult.optimalityGap,
      modelVersion: encodeBase64(banditResult.modelVersion),
      actionAttributes: encodedAttributes,
      metaData: encodedMetaData,
    };
  });
  return obfuscatedBandits;
}

export function obfuscatePrecomputedFlags(
  salt: string,
  precomputedFlags: Record<string, PrecomputedFlag>,
): Record<string, PrecomputedFlag> {
  const response: Record<string, PrecomputedFlag> = {};

  Object.keys(precomputedFlags).forEach((flagKey) => {
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

let saltOverrideBytes: Uint8Array | null;
export function setSaltOverrideForTests(salt: Uint8Array | null) {
  saltOverrideBytes = salt ? salt : null;
}

export function generateSalt(length = 16): string {
  return base64.fromUint8Array(
    saltOverrideBytes ? saltOverrideBytes : crypto.getRandomValues(new Uint8Array(length)),
  );
}
