import base64 = require('js-base64');
import * as SparkMD5 from 'spark-md5';

export function getMD5Hash(input: string): string {
  return SparkMD5.hash(input);
}

export function getMD5HashWithSalt(input: string, salt: string): string {
  const spark = new SparkMD5();
  spark.append(salt);
  spark.append(input);
  return spark.end();
}

export function encodeBase64(input: string) {
  return base64.btoaPolyfill(input);
}

export function decodeBase64(input: string) {
  return base64.atobPolyfill(input);
}
