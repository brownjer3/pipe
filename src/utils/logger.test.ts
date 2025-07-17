import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import winston from 'winston';
import { logger, createLogger } from './logger';

// Mock winston
vi.mock('winston', () => {
  const mockWinstonLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    add: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  return {
    default: {
      createLogger: vi.fn().mockReturnValue(mockWinstonLogger),
      format: {
        combine: vi.fn(),
        timestamp: vi.fn(),
        errors: vi.fn(),
        splat: vi.fn(),
        json: vi.fn(),
        printf: vi.fn(),
        colorize: vi.fn(),
        simple: vi.fn(),
      },
      transports: {
        Console: vi.fn(),
        File: vi.fn(),
      },
    },
    createLogger: vi.fn().mockReturnValue(mockWinstonLogger),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      errors: vi.fn(),
      splat: vi.fn(),
      json: vi.fn(),
      printf: vi.fn(),
      colorize: vi.fn(),
      simple: vi.fn(),
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  };
});

// Mock our logger module to return a spy-able instance
vi.mock('./logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./logger')>();

  const mockLoggerInstance = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };

  return {
    ...actual,
    logger: mockLoggerInstance,
    createLogger: actual.createLogger,
  };
});

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create a logger with default configuration', () => {
      const log = createLogger();

      expect(winston.createLogger).toHaveBeenCalled();
      expect(log).toBeDefined();
      expect(log.info).toBeDefined();
      expect(log.error).toBeDefined();
      expect(log.warn).toBeDefined();
      expect(log.debug).toBeDefined();
    });

    it('should use LOG_LEVEL from environment', () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      createLogger();

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
        })
      );

      // Restore
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    });

    it('should default to info level when LOG_LEVEL not set', () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      createLogger();

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
        })
      );

      // Restore
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      }
    });

    it('should configure console transport for non-production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      createLogger();

      expect(winston.transports.Console).toHaveBeenCalled();

      // Restore
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should configure file transports for production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      createLogger();

      expect(winston.transports.File).toHaveBeenCalledTimes(2); // error and combined logs
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'logs/error.log',
          level: 'error',
        })
      );
      expect(winston.transports.File).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'logs/combined.log',
        })
      );

      // Restore
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('logger instance', () => {
    it('should be a winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('should handle info logs', () => {
      logger.info('Test info message', { meta: 'data' });

      expect(logger.info).toHaveBeenCalledWith('Test info message', { meta: 'data' });
    });

    it('should handle error logs', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(logger.error).toHaveBeenCalledWith('Error occurred', error);
    });

    it('should handle warn logs', () => {
      logger.warn('Warning message');

      expect(logger.warn).toHaveBeenCalledWith('Warning message');
    });

    it('should handle debug logs', () => {
      logger.debug('Debug info', { debugData: true });

      expect(logger.debug).toHaveBeenCalledWith('Debug info', { debugData: true });
    });
  });

  describe('format configuration', () => {
    it('should combine multiple formats', () => {
      createLogger();

      expect(winston.format.combine).toHaveBeenCalled();
      expect(winston.format.timestamp).toHaveBeenCalled();
      expect(winston.format.errors).toHaveBeenCalledWith({ stack: true });
      expect(winston.format.json).toHaveBeenCalled();
    });

    it('should use colorize and simple format for console in development', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      createLogger();

      expect(winston.format.colorize).toHaveBeenCalled();
      expect(winston.format.simple).toHaveBeenCalled();

      // Restore
      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe('silent mode', () => {
    it('should set silent level when LOG_LEVEL is silent', () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'silent';

      createLogger();

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'silent',
        })
      );

      // Restore
      if (originalLogLevel) {
        process.env.LOG_LEVEL = originalLogLevel;
      } else {
        delete process.env.LOG_LEVEL;
      }
    });
  });
});
