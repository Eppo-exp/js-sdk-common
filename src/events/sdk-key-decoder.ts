import { Base64 } from 'js-base64';

export default class SdkKeyDecoder {
  /**
   * Decodes and returns the event ingestion hostname from the provided Eppo SDK key string.
   * If the SDK key doesn't contain the event ingestion hostname, or it's invalid, it returns null.
   */
  decodeEventIngestionHostName(sdkKey: string): string | null {
    const encodedPayload = sdkKey.split('.')[1];
    if (!encodedPayload) return null;

    const decodedPayload = Base64.decode(encodedPayload);
    const params = new URLSearchParams(decodedPayload);
    return params.get('eh');
  }
}
