import {
  BANDIT_ENDPOINT,
  BASE_URL,
  DEFAULT_EVENT_DOMAIN,
  EVENT_ENDPOINT,
  PRECOMPUTED_FLAGS_ENDPOINT,
  UFC_ENDPOINT,
} from './constants';
import { IQueryParams, IQueryParamsWithSubject } from './http-client';
import SdkKeyDecoder from './sdk-key-decoder';

/**
 * Parameters for configuring the API endpoints
 *
 * @param queryParams Query parameters to append to the configuration endpoints
 * @param baseUrl Custom base URL for configuration endpoints (optional)
 * @param defaultUrl Default base URL for configuration endpoints (defaults to BASE_URL)
 * @param sdkTokenDecoder SDK token decoder for subdomain and event hostname extraction
 */
interface IApiEndpointsParams {
  queryParams?: IQueryParams | IQueryParamsWithSubject;
  baseUrl?: string;
  defaultUrl: string;
  sdkTokenDecoder?: SdkKeyDecoder;
}

/**
 * Utility class for constructing Eppo API endpoint URLs.
 *
 * This class handles two distinct types of endpoints:
 * 1. Configuration endpoints (UFC, bandits, precomputed flags) - based on the effective base URL
 *    which considers baseUrl, subdomain from SDK token, and defaultUrl in that order.
 * 2. Event ingestion endpoint - either uses the default event domain with subdomain from SDK token
 *    or a full hostname from SDK token. This endpoint IGNORES the baseUrl and defaultUrl parameters.
 *
 * For event ingestion endpoints, consider using the static helper method:
 * `ApiEndpoints.createEventIngestionUrl(sdkKey)`
 */
export default class ApiEndpoints {
  private readonly sdkToken: SdkKeyDecoder | null;
  private readonly _effectiveBaseUrl: string;
  private readonly params: IApiEndpointsParams;

  constructor(params: Partial<IApiEndpointsParams>) {
    this.params = Object.assign({}, { defaultUrl: BASE_URL }, params);
    this.sdkToken = params.sdkTokenDecoder ?? null;
    this._effectiveBaseUrl = this.determineBaseUrl();
  }

  /**
   * Helper method to return an event ingestion endpoint URL from the customer's SDK token.
   * @param sdkToken
   */
  static createEventIngestionUrl(sdkToken: string): string | null {
    return new ApiEndpoints({
      sdkTokenDecoder: new SdkKeyDecoder(sdkToken),
    }).eventIngestionEndpoint();
  }

  /**
   * Normalizes a URL by ensuring proper protocol and removing trailing slashes
   */
  private normalizeUrl(url: string, protocol = 'https://'): string {
    const protocolMatch = url.match(/^(https?:\/\/|\/\/)/i);

    if (protocolMatch) {
      return url;
    }
    return `${protocol}${url}`;
  }

  private joinUrlParts(...parts: string[]): string {
    return parts
      .map((part) => part.trim())
      .map((part, i) => {
        // For first part, remove trailing slash
        if (i === 0) return part.replace(/\/+$/, '');
        // For other parts, remove leading and trailing slashes
        return part.replace(/^\/+|\/+$/g, '');
      })
      .join('/');
  }

  /**
   * Determines the effective base URL for configuration endpoints based on:
   * 1. If baseUrl is provided, and it is not equal to the DEFAULT_BASE_URL, use it
   * 2. If the api key contains an encoded customer-specific subdomain, use it with DEFAULT_DOMAIN
   * 3. Otherwise, fall back to DEFAULT_BASE_URL
   *
   * @returns The effective base URL to use for configuration endpoints
   */
  private determineBaseUrl(): string {
    // If baseUrl is explicitly provided and different from default, use it
    if (this.params.baseUrl && this.params.baseUrl !== this.params.defaultUrl) {
      return this.normalizeUrl(this.params.baseUrl);
    }

    // If there's a valid SDK token with a subdomain, use it
    const subdomain = this.sdkToken?.getSubdomain();
    if (subdomain && this.sdkToken?.isValid()) {
      // Extract the domain part without protocol
      const defaultUrl = this.params.defaultUrl;
      const domainPart = defaultUrl.replace(/^(https?:\/\/|\/\/)/, '');
      return this.normalizeUrl(`${subdomain}.${domainPart}`);
    }

    // Fall back to default URL
    return this.normalizeUrl(this.params.defaultUrl);
  }

  private endpoint(resource: string): string {
    const url = this.joinUrlParts(this._effectiveBaseUrl, resource);

    const queryParams = this.params.queryParams;
    if (!queryParams) {
      return url;
    }

    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => urlSearchParams.append(key, value));

    return `${url}?${urlSearchParams}`;
  }

  /**
   * Returns the URL for the UFC endpoint.
   * Uses the configuration base URL determined by baseUrl, subdomain, or default.
   *
   * @returns The full UFC endpoint URL
   */
  ufcEndpoint(): string {
    return this.endpoint(UFC_ENDPOINT);
  }

  /**
   * Returns the URL for the bandit parameters endpoint.
   * Uses the configuration base URL determined by baseUrl, subdomain, or default.
   *
   * @returns The full bandit parameters endpoint URL
   */
  banditParametersEndpoint(): string {
    return this.endpoint(BANDIT_ENDPOINT);
  }

  /**
   * Returns the URL for the precomputed flags endpoint.
   * Uses the configuration base URL determined by baseUrl, subdomain, or default.
   *
   * @returns The full precomputed flags endpoint URL
   */
  precomputedFlagsEndpoint(): string {
    return this.endpoint(PRECOMPUTED_FLAGS_ENDPOINT);
  }

  /**
   * Constructs the event ingestion URL from the SDK token.
   *
   * IMPORTANT: This method ignores baseUrl and defaultUrl parameters completely.
   * It uses ONLY the hostname or subdomain from the SDK token with a fixed event domain.
   *
   * @returns The event ingestion URL, or null if the SDK token is invalid or doesn't
   * contain the necessary information.
   */
  eventIngestionEndpoint(): string | null {
    if (!this.sdkToken?.isValid()) return null;

    const hostname = this.sdkToken.getEventIngestionHostname();
    const subdomain = this.sdkToken.getSubdomain();

    if (!hostname && !subdomain) return null;

    // If we have a hostname from the token, use it directly
    if (hostname) {
      return this.normalizeUrl(this.joinUrlParts(hostname, EVENT_ENDPOINT));
    }

    // Otherwise use subdomain with default event domain
    if (subdomain) {
      return this.normalizeUrl(
        this.joinUrlParts(`${subdomain}.${DEFAULT_EVENT_DOMAIN}`, EVENT_ENDPOINT),
      );
    }

    return null;
  }
}
