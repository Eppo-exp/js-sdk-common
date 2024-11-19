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

  endpoint(resource: string): URL {
    const url = new URL(this.params.baseUrl + resource);
    Object.entries(this.params.queryParams ?? {}).forEach(([key, value]) =>
      url.searchParams.append(key, value),
    );
    return url;
  }

  ufcEndpoint(): URL {
    return this.endpoint(UFC_ENDPOINT);
  }

  banditParametersEndpoint(): URL {
    return this.endpoint(BANDIT_ENDPOINT);
  }

  precomputedFlagsEndpoint(): URL {
    return this.endpoint(PRECOMPUTED_FLAGS_ENDPOINT);
  }
}
