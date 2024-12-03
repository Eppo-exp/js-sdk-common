import { applicationLogger } from '..';
import ApiEndpoints from '../api-endpoints';
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../constants';
import FetchHttpClient from '../http-client';
import { Variation } from '../interfaces';
import { AttributeType } from '../types';

import { EppoClientEdge } from './eppo-client-edge';

type VariationValue = Variation['value'] | object;

export interface IEdgeConfig {
  apiKey: string;
  subjectKey: string;
  subjectAttributes: Record<string, AttributeType>;
  throwOnFailedInitialization?: boolean;
  baseUrl?: string;
}

export async function commonEdgeInit(
  config: IEdgeConfig,
  sdkName: string,
  sdkVersion: string,
): Promise<EppoClientEdge> {
  const { apiKey, baseUrl, throwOnFailedInitialization } = config;
  try {
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams: { apiKey, sdkName, sdkVersion },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, DEFAULT_REQUEST_TIMEOUT_MS);
    const assignments = await httpClient.rawGet<Record<string, VariationValue>>(
      apiEndpoints.endpoint('/flag-config/v1/edge-config'),
    );
    if (!assignments) {
      throw new Error('Unable to get assignments');
    }
    return new EppoClientEdge(assignments);
  } catch (error) {
    applicationLogger.warn(
      'Eppo SDK encountered an error initializing, assignment calls will return the default value',
    );
    if (throwOnFailedInitialization) {
      throw error;
    }
    return new EppoClientEdge({});
  }
}
