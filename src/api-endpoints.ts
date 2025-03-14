import {
  BASE_URL as DEFAULT_BASE_URL,
  UFC_ENDPOINT,
  BANDIT_ENDPOINT,
  PRECOMPUTED_FLAGS_ENDPOINT,
} from './constants';
import { IQueryParams, IQueryParamsWithSubject } from './http-client';

interface IApiEndpointsParams {
  queryParams?: IQueryParams | IQueryParamsWithSubject;
  baseUrl?: string;
}

/** Utility class for constructing an Eppo API endpoint URL given a provided baseUrl and query parameters */
export default class ApiEndpoints {
  constructor(private readonly params: IApiEndpointsParams) {
    this.params.baseUrl = params.baseUrl ?? DEFAULT_BASE_URL;
  }

  endpoint(resource: string): string {
    const endpointUrl = `${this.params.baseUrl}${resource}`;
    const queryParams = this.params.queryParams;
    if (!queryParams) {
      return endpointUrl;
    }
    const urlSearchParams = new URLSearchParams();
    Object.entries(queryParams).forEach(([key, value]) => urlSearchParams.append(key, value));
    return `${endpointUrl}?${urlSearchParams}`;
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
}
