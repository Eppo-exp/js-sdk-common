import pino from 'pino';

export const loggerPrefix = '[Eppo SDK]';

// Create a Pino logger instance
export const logger = pino({
  // eslint-disable-next-line no-restricted-globals
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  // https://getpino.io/#/docs/browser
  browser: { disabled: true },
});
