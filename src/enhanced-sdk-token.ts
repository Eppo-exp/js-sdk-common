import { Base64 } from 'js-base64';

/**
 * An SDK Key with encoded data for customer-specific endpoints.
 */
export default class EnhancedSdkToken {
  private readonly encodedPayload: string | null;
  private readonly decodedParams: URLSearchParams | null;

  constructor(private readonly sdkKey: string) {
    const parts = sdkKey.split('.');
    this.encodedPayload = parts.length > 1 ? parts[1] : null;

    if (this.encodedPayload) {
      try {
        const decodedPayload = Base64.decode(this.encodedPayload);
        this.decodedParams = new URLSearchParams(decodedPayload);
      } catch (e) {
        this.decodedParams = null;
      }
    } else {
      this.decodedParams = null;
    }
  }

  private getDecodedValue(key: string): string | null {
    return this.decodedParams?.get(key) || null;
  }

  getEventIngestionHostname(): string | null {
    return this.getDecodedValue('eh');
  }

  getSubdomain(): string | null {
    return this.getDecodedValue('cs');
  }

  /**
   * Gets the raw SDK Key.
   */
  getToken(): string {
    return this.sdkKey;
  }

  /**
   * Checks if the SDK Key had the subdomain or event hostname encoded.
   */
  isValid(): boolean {
    return (
      this.decodedParams !== null &&
      (this.getSubdomain() !== null || this.getEventIngestionHostname() !== null)
    );
  }
}
