import * as td from 'testdouble';

import { DEFAULT_POLL_INTERVAL_MS, POLL_JITTER_PCT } from './constants';
import initPoller from './poller';

describe('poller', () => {
  const testIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  const maxRetryDelay = testIntervalMs * POLL_JITTER_PCT;
  const noOpCallback = td.func<() => Promise<void>>();

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    td.reset();
    jest.clearAllTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('initial startup', () => {
    it('skips initial poll if configured to do so', async () => {
      const poller = initPoller(testIntervalMs, noOpCallback, { skipInitialPoll: true });
      await poller.start();
      td.verify(noOpCallback(), { times: 0 });
    });

    it('retries startup poll within same promise', async () => {
      const pollerRetries = 3;
      let callCount = 0;
      const errorThrowingThenSuccessCallback = async () => {
        if (++callCount <= pollerRetries) {
          throw new Error('Intentional Error For Test');
        }
      };

      const poller = initPoller(testIntervalMs, errorThrowingThenSuccessCallback, {
        maxStartRetries: pollerRetries,
        pollAfterSuccessfulStart: true,
      });

      // By not awaiting (yet) only the first call should be fired off before execution below resumes
      const startPromise = poller.start();

      expect(callCount).toBe(1); // By this point, the first call will have failed

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(2); // retry 1 fails

      await jest.advanceTimersByTimeAsync(maxRetryDelay * 2);
      expect(callCount).toBe(4); // retries 2 and 3 fail

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(4); // no more retries

      // Await poller.start() so it can finish its execution before this test proceeds
      await startPromise;
      expect(callCount).toBe(4); // still no more retries

      await jest.advanceTimersByTimeAsync(testIntervalMs);
      expect(callCount).toBe(5); // polling has begun
    });

    it('gives up initial request after exhausting all start retries', async () => {
      const pollerRetries = 1;
      let callCount = 0;
      const errorThrowingCallback = async () => {
        ++callCount;
        throw new Error('Intentional Error For Test');
      };

      const poller = initPoller(testIntervalMs, errorThrowingCallback, {
        maxStartRetries: pollerRetries,
      });

      // By not awaiting (yet) only the first call should be fired off before execution below resumes
      const startPromise = poller.start();
      expect(callCount).toBe(1); // By this point, the first call will have failed

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(2); // retry 1 fails and stops

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(2); // no more retries

      // Await poller.start() so it can finish its execution before this test proceeds
      await startPromise;
      // By this point, both initial failed requests will have happened
      expect(callCount).toBe(2);

      // There should be no more polling (Since pollAfterFailedStart: true was not passed as an option)
      await jest.advanceTimersByTimeAsync(testIntervalMs * 2);
      expect(callCount).toBe(2);
    });

    it('throws an error on failed start (if configured to do so)', async () => {
      // Fake time does not play well with errors bubbled up after setTimeout (event loop,
      // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
      const pollerRetries = 0;
      let callCount = 0;
      const errorThrowingCallback = async () => {
        ++callCount;
        throw new Error('Intentional Error For Test');
      };

      const poller = initPoller(testIntervalMs, errorThrowingCallback, {
        maxStartRetries: pollerRetries,
        errorOnFailedStart: true,
      });

      await expect(poller.start()).rejects.toThrow();
      expect(callCount).toBe(1); // The call failed

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(1); // We set to no retries

      await jest.advanceTimersByTimeAsync(testIntervalMs);
      expect(callCount).toBe(1); // No polling after failure
    });

    it('still polls after initial request fails if configured to do so', async () => {
      const pollerRetries = 1;
      let callCount = 0;
      const errorThrowingCallback = async () => {
        if (++callCount <= 3) {
          throw new Error('Intentional Error For Test');
        }
      };

      const poller = initPoller(testIntervalMs, errorThrowingCallback, {
        maxStartRetries: pollerRetries,
        errorOnFailedStart: false,
        pollAfterSuccessfulStart: true,
        pollAfterFailedStart: true,
      });

      // By not awaiting (yet) only the first call should be fired off before execution below resumes
      const startPromise = poller.start();
      expect(callCount).toBe(1); // By this point, the first call will have failed

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(2); // retry 1 fails and stops

      await jest.advanceTimersByTimeAsync(maxRetryDelay);
      expect(callCount).toBe(2); // no more initialization retries

      // Await poller.start() so it can finish its execution before this test proceeds
      await startPromise;
      // By this point, both initial failed requests will have happened
      expect(callCount).toBe(2);

      // Advance time enough for regular polling to have begun (as configured)
      await jest.advanceTimersByTimeAsync(testIntervalMs);
      // First regular poll fails
      expect(callCount).toBe(3);
      // Advance time for exponential backoff
      await jest.advanceTimersByTimeAsync(testIntervalMs * 2 + maxRetryDelay);
      // Second regular poll succeeds
      expect(callCount).toBe(4);
      // Advance time normal interval
      await jest.advanceTimersByTimeAsync(testIntervalMs);
      // Third regular poll also succeeds
      expect(callCount).toBe(5);
    });
  });

  describe('polling after startup', () => {
    it('starts polling at interval', async () => {
      const poller = initPoller(testIntervalMs, noOpCallback, { pollAfterSuccessfulStart: true });
      await poller.start();
      td.verify(noOpCallback(), { times: 1 });
      await jest.advanceTimersByTimeAsync(testIntervalMs);
      td.verify(noOpCallback(), { times: 2 });
      await jest.advanceTimersByTimeAsync(testIntervalMs * 10);
      td.verify(noOpCallback(), { times: 12 });
    });

    it('stops polling', async () => {
      const poller = initPoller(testIntervalMs, noOpCallback, { pollAfterSuccessfulStart: true });
      await poller.start();
      td.verify(noOpCallback(), { times: 1 });
      poller.stop();
      await jest.advanceTimersByTimeAsync(testIntervalMs * 10);
      td.verify(noOpCallback(), { times: 1 });
    });

    it('retries polling with exponential backoff', async () => {
      const pollerRetries = 3;
      let callCount = 0;
      let failures = 0;
      let successes = 0;
      const mostlyErrorThrowingCallback = async () => {
        // This mock _mostly_ throws errors:
        // - First call succeeds
        // - Then <pollerRetries> calls will fail
        // - Above repeats (✓ ✕ ✕ ✕ ✓ ✕ ✕)
        if ((++callCount - 1) % (pollerRetries + 1) !== 0) {
          failures += 1;
          throw new Error('Intentional Error For Test');
        }
        successes += 1;
      };

      const poller = initPoller(testIntervalMs, mostlyErrorThrowingCallback, {
        pollAfterSuccessfulStart: true,
        maxPollRetries: pollerRetries,
      });
      await poller.start();
      expect(callCount).toBe(1); // initial request call succeeds
      expect(failures).toBe(0);
      expect(successes).toBe(1);

      await jest.advanceTimersByTimeAsync(testIntervalMs);
      expect(callCount).toBe(2); // first poll fails
      expect(failures).toBe(1);
      expect(successes).toBe(1);

      await jest.advanceTimersByTimeAsync(testIntervalMs * 2 + maxRetryDelay); // 2^1 backoff plus jitter
      expect(callCount).toBe(3); // second poll fails
      expect(failures).toBe(2);
      expect(successes).toBe(1);

      await jest.advanceTimersByTimeAsync(testIntervalMs * 4 + maxRetryDelay); // 2^2 backoff plus jitter
      expect(callCount).toBe(4); // third poll fails
      expect(failures).toBe(3);
      expect(successes).toBe(1);

      await jest.advanceTimersByTimeAsync(testIntervalMs * 8 + maxRetryDelay); // 2^3 backoff plus jitter
      expect(callCount).toBe(5); // fourth poll succeeds (backoff reset)
      expect(failures).toBe(3);
      expect(successes).toBe(2);

      await jest.advanceTimersByTimeAsync(testIntervalMs); // normal wait
      expect(callCount).toBe(6); // fifth poll fails
      expect(failures).toBe(4);
      expect(successes).toBe(2);

      await jest.advanceTimersByTimeAsync(testIntervalMs * 2 + maxRetryDelay); // 2^1 backoff plus jitter
      expect(callCount).toBe(7); // sixth poll fails
      expect(failures).toBe(5);
      expect(successes).toBe(2);
    });

    it('aborts after exhausting polling retries', async () => {
      const pollerRetries = 3;
      let callCount = 0;
      const alwaysErrorAfterFirstCallback = async () => {
        if (++callCount > 1) {
          throw new Error('Intentional Error For Test');
        }
      };

      const poller = initPoller(testIntervalMs, alwaysErrorAfterFirstCallback, {
        pollAfterSuccessfulStart: true,
        maxPollRetries: pollerRetries,
      });
      await poller.start();
      expect(callCount).toBe(1); // successful initial request

      await jest.advanceTimersByTimeAsync(testIntervalMs);
      expect(callCount).toBe(2); // first regular poll fails

      await jest.advanceTimersByTimeAsync(testIntervalMs * 2 + maxRetryDelay); // 2^1 backoff plus jitter
      expect(callCount).toBe(3); // second poll fails

      await jest.advanceTimersByTimeAsync(testIntervalMs * 4 + maxRetryDelay); // 2^2 backoff plus jitter
      expect(callCount).toBe(4); // third poll fails

      await jest.advanceTimersByTimeAsync(testIntervalMs * 8 + maxRetryDelay); // 2^3 backoff plus jitter
      expect(callCount).toBe(5); // fourth poll fails and stops

      await jest.advanceTimersByTimeAsync(testIntervalMs * 16 + maxRetryDelay); // 2^4 backoff plus jitter
      expect(callCount).toBe(5); // no new polls
    });
  });
});
