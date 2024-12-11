import { Base64 } from 'js-base64';

const PATH = 'v0/i';

export default class SdkKeyDecoder {
  /**
   * Decodes and returns the event ingestion hostname from the provided Eppo SDK key string.
   * If the SDK key doesn't contain the event ingestion hostname, or it's invalid, it returns null.
   */
  decodeEventIngestionUrl(sdkKey: string): string | null {
    const encodedPayload = sdkKey.split('.')[1];
    if (!encodedPayload) return null;

    const decodedPayload = Base64.decode(encodedPayload);
    const params = new URLSearchParams(decodedPayload);
    const hostname = params.get('eh');
    if (!hostname) return null;

    const hostAndPath = hostname.endsWith('/') ? `${hostname}${PATH}` : `${hostname}/${PATH}`;
    if (!hostAndPath.startsWith('http://') && !hostAndPath.startsWith('https://')) {
      // prefix hostname with https scheme if none present
      return `https://${hostAndPath}`;
    } else {
      return hostAndPath;
    }
  }
}
