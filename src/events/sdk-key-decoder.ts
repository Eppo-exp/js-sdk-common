import { Base64 } from 'js-base64';

const EVENT_INGESTION_HOSTNAME_KEY = 'eh';
const CONFIGURATION_HOSTNAME_KEY = 'ch';

const EVENT_INGESTION_PATH = 'v0/i';
const ASSIGNMENT_CONFIG_PATH = 'assignment';
const EDGE_CONFIG_PATH = 'edge';

export default class SdkKeyDecoder {
  /**
   * Decodes and returns the event ingestion hostname from the provided Eppo SDK key string.
   * If the SDK key doesn't contain the event ingestion hostname, or it's invalid, it returns null.
   */
  decodeEventIngestionUrl(sdkKey: string): string | null {
    return this.decodeHostnames(sdkKey, EVENT_INGESTION_PATH).eventIngestionHostname;
  }

  /**
   * Decodes and returns the configuration hostname from the provided Eppo SDK key string.
   * If the SDK key doesn't contain the configuration hostname, or it's invalid, it returns null.
   */
  decodeAssignmentConfigurationUrl(sdkKey: string): string | null {
    return this.decodeHostnames(sdkKey, ASSIGNMENT_CONFIG_PATH).configurationHostname;
  }

  /**
   * Decodes and returns the edge configuration hostname from the provided Eppo SDK key string.
   * If the SDK key doesn't contain the edge configuration hostname, or it's invalid, it returns null.
   */
  decodeEdgeConfigurationUrl(sdkKey: string): string | null {
    return this.decodeHostnames(sdkKey, EDGE_CONFIG_PATH).configurationHostname;
  }

  private decodeHostnames(
    sdkKey: string,
    path: string,
  ): {
    eventIngestionHostname: string | null;
    configurationHostname: string | null;
  } {
    const encodedPayload = sdkKey.split('.')[1];
    if (!encodedPayload) return { eventIngestionHostname: null, configurationHostname: null };

    const decodedPayload = Base64.decode(encodedPayload);
    const params = new URLSearchParams(decodedPayload);
    const eventIngestionHostname = params.get(EVENT_INGESTION_HOSTNAME_KEY);
    const configurationHostname = params.get(CONFIGURATION_HOSTNAME_KEY);

    return {
      eventIngestionHostname: eventIngestionHostname
        ? this.ensureHttps(this.ensurePath(eventIngestionHostname, path))
        : null,
      configurationHostname: configurationHostname
        ? this.ensureHttps(this.ensurePath(configurationHostname, path))
        : null,
    };
  }

  private ensureHttps(hostname: string): string {
    if (!hostname.startsWith('http://') && !hostname.startsWith('https://')) {
      return `https://${hostname}`;
    }
    return hostname;
  }

  private ensurePath(hostname: string, path: string): string {
    return hostname.endsWith('/') ? `${hostname}${path}` : `${hostname}/${path}`;
  }
}
