import winston from 'winston';

export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  child(meta: any): Logger;
}

class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor(logger: winston.Logger) {
    this.logger = logger;
  }

  info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  child(meta: any): Logger {
    return new WinstonLogger(this.logger.child(meta));
  }
}

export function createLogger(): Logger {
  const winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: {
      service: 'pipe-mcp',
      environment: process.env.NODE_ENV,
      version: process.env.APP_VERSION || '1.0.0',
    },
    transports: [
      // Console transport
      new winston.transports.Console({
        format:
          process.env.NODE_ENV === 'development'
            ? winston.format.combine(winston.format.colorize(), winston.format.simple())
            : winston.format.json(),
      }),
    ],
  });

  // Add file transport in production
  if (process.env.NODE_ENV === 'production') {
    winstonLogger.add(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );

    winstonLogger.add(
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }

  return new WinstonLogger(winstonLogger);
}

export const logger = createLogger();
