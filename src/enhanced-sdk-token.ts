import { Base64 } from 'js-base64';

/**
 * Represents an enhanced SDK token that can extract various fields from the token.
 */
export default class EnhancedSdkToken {
  private readonly encodedPayload: string | null;
  private readonly decodedParams: URLSearchParams | null;

  /**
   * Creates a new instance of EnhancedSdkToken.
   * @param sdkToken The SDK token string to parse
   */
  constructor(private readonly sdkToken: string) {
    const parts = sdkToken.split('.');
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

  /**
   * Gets the value for a specific key from the decoded token.
   * @param key The key to retrieve from the decoded parameters
   * @returns The value for the key, or null if not found or if token is invalid
   */
  private getDecodedValue(key: string): string | null {
    return this.decodedParams?.get(key) || null;
  }

  /**
   * Gets the event ingestion hostname from the token.
   * @returns The event ingestion hostname, or null if not present
   */
  getEventIngestionHostname(): string | null {
    return this.getDecodedValue('eh');
  }

  /**
   * Gets the subdomain from the token.
   * @returns The subdomain, or null if not present
   */
  getSubdomain(): string | null {
    return this.getDecodedValue('cs');
  }

  /**
   * Gets the raw token string.
   * @returns The original SDK token string
   */
  getToken(): string {
    return this.sdkToken;
  }

  /**
   * Checks if the token is valid (has encoded payload that can be decoded).
   * @returns true if the token is valid, false otherwise
   */
  isValid(): boolean {
    return (
      this.decodedParams !== null &&
      (this.getSubdomain() !== null || this.getEventIngestionHostname() !== null)
    );
  }
}
