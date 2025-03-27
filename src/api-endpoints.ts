import {
  BANDIT_ENDPOINT,
  BASE_URL,
  DEFAULT_EVENT_DOMAIN,
  PRECOMPUTED_FLAGS_ENDPOINT,
  UFC_ENDPOINT,
} from './constants';
import EnhancedSdkToken from './enhanced-sdk-token';
import { IQueryParams, IQueryParamsWithSubject } from './http-client';

const EVENT_ENDPOINT = 'v0/i';

interface IApiEndpointsParams {
  queryParams?: IQueryParams | IQueryParamsWithSubject;
  baseUrl?: string;
  defaultUrl: string;
  sdkToken?: EnhancedSdkToken;
}

/**
 * Utility class for constructing Eppo API endpoint URLs
 */
export default class ApiEndpoints {
  private readonly sdkToken: EnhancedSdkToken | null;
  private readonly _effectiveBaseUrl: string;
  private readonly params: IApiEndpointsParams;

  constructor(params: Partial<IApiEndpointsParams>) {
    this.params = Object.assign({}, { defaultUrl: BASE_URL }, params);
    this.sdkToken = params.sdkToken ?? null;
    this._effectiveBaseUrl = this.determineBaseUrl();
  }

  /**
   * Normalizes a URL by ensuring proper protocol and removing trailing slashes
   */
  private normalizeUrl(url: string, protocol = 'https://'): string {
    const protocolMatch = url.match(/^(https?:\/\/|\/\/)/i);

    if (protocolMatch) {
      return url;
    } else {
      return `${protocol}${url}`;
    }
  }

  /**
   * Determine the effective base URL based on the constructor parameters:
   * 1. If baseUrl is provided, and it is not equal to the DEFAULT_BASE_URL, use it
   * 2. If the api key contains an encoded customer-specific subdomain, use it with DEFAULT_DOMAIN
   * 3. Otherwise, fall back to DEFAULT_BASE_URL
   */
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
   * Determine the effective base URL based on the constructor parameters
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

  /**
   * Creates an endpoint URL with the specified resource path and query parameters
   */
  endpoint(resource: string): string {
    const url = this.joinUrlParts(this._effectiveBaseUrl, resource);

    const queryParams = this.params.queryParams;
    if (!queryParams) {
      return url;
    }

    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => urlSearchParams.append(key, value));

    return `${url}?${urlSearchParams}`;
  }

  ufcEndpoint(): string {
    return this.endpoint(UFC_ENDPOINT);
  }

  banditParametersEndpoint(): string {
    return this.endpoint(BANDIT_ENDPOINT);
  }

  precomputedFlagsEndpoint(): string {
    return this.endpoint(PRECOMPUTED_FLAGS_ENDPOINT);
  }

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
