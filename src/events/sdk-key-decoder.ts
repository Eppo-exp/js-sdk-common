import ApiEndpoints from '../api-endpoints';
import { DEFAULT_EVENT_DOMAIN } from '../constants';
import EnhancedSdkToken from '../enhanced-sdk-token';

const PATH = 'v0/i';

export function buildIngestionUrl(sdkKey: string): string | null {
  const sdkToken = new EnhancedSdkToken(sdkKey);
  if (!sdkToken.isValid()) return null;

  const encodedPayload = sdkKey.split('.')[1];
  if (!encodedPayload) return null;

  const hostname = sdkToken.getEventIngestionHostname();
  const subdomain = sdkToken.getSubdomain();

  const effectiveHost = subdomain ? `https://${subdomain}.${DEFAULT_EVENT_DOMAIN}` : hostname;
  if (!effectiveHost) return null;

  const hostAndPath = effectiveHost.endsWith('/')
    ? `${effectiveHost}${PATH}`
    : `${effectiveHost}/${PATH}`;
  if (!ApiEndpoints.URL_PROTOCOLS.find((p) => hostAndPath.startsWith(p))) {
    // prefix hostname with https scheme if none present
    return `https://${hostAndPath}`;
  } else {
    return hostAndPath;
  }
}
