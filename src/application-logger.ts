import pino from 'pino';

export const loggerPrefix = '[Eppo SDK]';

// Create a Pino logger instance
export const logger = pino({
  // Use any specified log level, or warn in production, info otherwise
  level:
    /* eslint-disable no-restricted-globals */
    typeof process !== 'undefined' && process.env.LOG_LEVEL
      ? process.env.LOG_LEVEL
      : typeof process !== 'undefined' && process.env.NODE_ENV === 'production'
        ? 'warn'
        : 'info',
  /* eslint-enable no-restricted-globals */

  browser: { disabled: true }, // See https://getpino.io/#/docs/browser
});
