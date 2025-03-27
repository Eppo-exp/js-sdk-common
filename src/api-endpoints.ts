import { BANDIT_ENDPOINT, BASE_URL, PRECOMPUTED_FLAGS_ENDPOINT, UFC_ENDPOINT } from './constants';
import EnhancedSdkToken from './enhanced-sdk-token';
import { IQueryParams, IQueryParamsWithSubject } from './http-client';

interface IApiEndpointsParams {
  queryParams?: IQueryParams | IQueryParamsWithSubject;
  baseUrl?: string;
  defaultUrl: string;
  sdkToken?: EnhancedSdkToken;
}

/** Utility class for constructing an Eppo API endpoint URL given a provided baseUrl and query parameters */
export default class ApiEndpoints {
  private readonly sdkToken: EnhancedSdkToken | null;
  private readonly _effectiveBaseUrl: string;
  private readonly params: IApiEndpointsParams;

  constructor(params: Partial<IApiEndpointsParams>) {
    this.params = Object.assign({}, { defaultUrl: BASE_URL }, params);
    this.sdkToken = params.sdkToken ?? null;

    // this.params.baseUrl =
    //   params.baseUrl && params.baseUrl !== DEFAULT_BASE_URL ? params.baseUrl : DEFAULT_URL;

    // Set the effective base URL.
    this._effectiveBaseUrl = this.determineBaseUrl();
  }

  /**
   * Determine the effective base URL based on the constructor parameters:
   * 1. If baseUrl is provided, and it is not equal to the DEFAULT_BASE_URL, use it
   * 2. If the api key contains an encoded customer-specific subdomain, use it with DEFAULT_DOMAIN
   * 3. Otherwise, fall back to DEFAULT_BASE_URL
   */
  private determineBaseUrl(): string {
    // If baseUrl is explicitly provided and different from default, use it
    if (this.params.baseUrl && this.params.baseUrl !== this.params.defaultUrl) {
      return this.params.baseUrl;
    }

    // If there's an enhanced SDK token with a subdomain, it will be prepended in the buildUrl method.
    const subdomain = this.sdkToken?.getSubdomain();
    return this.buildUrl(this.params.defaultUrl, subdomain);
  }

  private buildUrl(domain: string, subdomain?: string | null) {
    const protocol = ApiEndpoints.URL_PROTOCOLS.find((v) => domain.startsWith(v)) ?? 'https://';

    const base = this.stripProtocol(domain);
    return subdomain ? `${protocol}${subdomain}.${base}` : `${protocol}${base}`;
  }

  /**
   * Returns the base URL being used for the UFC and bandit endpoints
   */
  getEffectiveBaseUrl(): string {
    return this._effectiveBaseUrl;
  }

  /**
   * Creates an endpoint URL with the specified resource path and query parameters
   */
  endpoint(resource: string): string {
    const baseUrl = this._effectiveBaseUrl;

    // Ensure baseUrl and resource join correctly with only one slash
    const base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    const path = resource.startsWith('/') ? resource.substring(1) : resource;
    const endpointUrl = `${base}/${path}`;

    const queryParams = this.params.queryParams;
    if (!queryParams) {
      return endpointUrl;
    }

    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => urlSearchParams.append(key, value));

    return `${endpointUrl}?${urlSearchParams}`;
  }

  /**
   * Returns the URL for the UFC endpoint
   */
  ufcEndpoint(): string {
    return this.endpoint(UFC_ENDPOINT);
  }

  /**
   * Returns the URL for the bandit parameters endpoint
   */
  banditParametersEndpoint(): string {
    return this.endpoint(BANDIT_ENDPOINT);
  }

  /**
   * Returns the URL for the precomputed flags endpoint
   */
  precomputedFlagsEndpoint(): string {
    return this.endpoint(PRECOMPUTED_FLAGS_ENDPOINT);
  }

  private stripProtocol(url: string) {
    return ApiEndpoints.URL_PROTOCOLS.reduce((prev, cur) => {
      return prev.replace(cur, '');
    }, url);
  }
  public static readonly URL_PROTOCOLS = ['http://', 'https://', '//'];
}
