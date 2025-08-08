import { logger } from './application-logger';
import {
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  POLL_JITTER_PCT,
} from './constants';
import { waitForMs } from './util';

export interface IPoller {
  start: () => Promise<void>;
  stop: () => void;
}

// TODO: change this to a class with methods instead of something that returns a function

export default function initPoller(
  intervalMs: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: () => Promise<any>,
  options?: {
    maxPollRetries?: number;
    maxStartRetries?: number;
    // TODO: consider enum for polling behavior (NONE, SUCCESS, ALWAYS)
    pollAfterSuccessfulStart?: boolean;
    errorOnFailedStart?: boolean;
    pollAfterFailedStart?: boolean;
    skipInitialPoll?: boolean;
  },
): IPoller {
  let stopped = false;
  let failedAttempts = 0;
  let nextPollMs = intervalMs;
  let previousPollFailed = false;
  let nextTimer: NodeJS.Timeout | undefined = undefined;

  const start = async () => {
    stopped = false;
    let startRequestSuccess = false;
    let startAttemptsRemaining = options?.skipInitialPoll
      ? 0
      : 1 + (options?.maxStartRetries ?? DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES);

    let startErrorToThrow = null;

    while (!startRequestSuccess && startAttemptsRemaining > 0) {
      try {
        await callback();
        startRequestSuccess = true;
        previousPollFailed = false;
        logger.info('Eppo SDK successfully requested initial configuration');
      } catch (pollingError: any) {
        previousPollFailed = true;
        logger.warn(
          `Eppo SDK encountered an error with initial poll of configurations: ${pollingError.message}`,
        );
        if (--startAttemptsRemaining > 0) {
          const jitterMs = randomJitterMs(intervalMs);
          logger.warn(
            `Eppo SDK will retry the initial poll again in ${jitterMs} ms (${startAttemptsRemaining} attempts remaining)`,
          );
          await waitForMs(jitterMs);
        } else {
          if (options?.pollAfterFailedStart) {
            logger.warn('Eppo SDK initial poll failed; will attempt regular polling');
          } else {
            logger.error('Eppo SDK initial poll failed. Aborting polling');
            stop();
          }

          if (options?.errorOnFailedStart) {
            startErrorToThrow = pollingError;
          }
        }
      }
    }

    const startRegularPolling =
      !stopped &&
      ((startRequestSuccess && options?.pollAfterSuccessfulStart) ||
        (!startRequestSuccess && options?.pollAfterFailedStart));

    if (startRegularPolling) {
      logger.info(`Eppo SDK starting regularly polling every ${intervalMs} ms`);
      nextTimer = setTimeout(poll, intervalMs);
    } else {
      logger.info(`Eppo SDK will not poll for configuration updates`);
    }

    if (startErrorToThrow) {
      logger.info('Eppo SDK rethrowing start error');
      throw startErrorToThrow;
    }
  };

  const stop = () => {
    if (!stopped) {
      stopped = true;
      if (nextTimer) {
        clearTimeout(nextTimer);
        nextTimer = undefined;
      }
      logger.info('Eppo SDK polling stopped');
    }
  };

  async function poll() {
    if (stopped) {
      if (nextTimer) {
        clearTimeout(nextTimer);
        nextTimer = undefined;
      }
      return;
    }

    try {
      await callback();
      // If no error, reset any retrying
      failedAttempts = 0;
      nextPollMs = intervalMs;
      if (previousPollFailed) {
        previousPollFailed = false;
        logger.info('Eppo SDK poll successful; resuming normal polling');
      }
    } catch (error: any) {
      previousPollFailed = true;
      logger.warn(`Eppo SDK encountered an error polling configurations: ${error.message}`);
      const maxTries = 1 + (options?.maxPollRetries ?? DEFAULT_POLL_CONFIG_REQUEST_RETRIES);
      if (++failedAttempts < maxTries) {
        const failureWaitMultiplier = Math.pow(2, failedAttempts);
        const jitterMs = randomJitterMs(intervalMs);
        nextPollMs = failureWaitMultiplier * intervalMs + jitterMs;
        logger.warn(
          `Eppo SDK will try polling again in ${nextPollMs} ms (${
            maxTries - failedAttempts
          } attempts remaining)`,
        );
      } else {
        logger.error(
          `Eppo SDK reached maximum of ${failedAttempts} failed polling attempts. Stopping polling`,
        );
        stop();
        return;
      }
    }

    // Check stopped state again before setting up next timer to handle race condition
    if (!stopped) {
      nextTimer = setTimeout(poll, nextPollMs);
    }
  }

  return {
    start,
    stop,
  };
}

/**
 * Compute a random jitter as a percentage of the polling interval.
 * Will be (5%,10%) of the interval assuming POLL_JITTER_PCT = 0.1
 */
function randomJitterMs(intervalMs: number) {
  const halfPossibleJitter = (intervalMs * POLL_JITTER_PCT) / 2;
  // We want the randomly chosen jitter to be at least 1ms so total jitter is slightly more than half the max possible.
  // This makes things easy for automated tests as two polls cannot execute within the maximum possible time waiting for one.
  const randomOtherHalfJitter = Math.max(
    Math.floor((Math.random() * intervalMs * POLL_JITTER_PCT) / 2),
    1,
  );
  return halfPossibleJitter + randomOtherHalfJitter;
}
