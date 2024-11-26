import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

export function getMD5Hash(input: string): string {
  return SparkMD5.hash(input);
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}
