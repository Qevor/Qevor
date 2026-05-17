import pino from 'pino';

export function createLogger(service: 'api' | 'executor') {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV !== 'production' && {
      transport: { target: 'pino-pretty' },
    }),
  }).child({ service });
}
