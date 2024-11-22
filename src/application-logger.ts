import pino from 'pino';

export const loggerPrefix = '[Eppo SDK]';

// Create a Pino logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'warn' : 'info'),
  // https://getpino.io/#/docs/browser
  browser: { disabled: true },
});
