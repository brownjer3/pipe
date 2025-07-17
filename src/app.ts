import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import passport from 'passport';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { AuthService } from './auth/auth-service';
import { configurePassport } from './auth/passport-config';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';

export function createApp(): Application {
  const app = express();
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  // Initialize services
  const authService = new AuthService(prisma, redis, logger);

  // Configure passport
  configurePassport(authService);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
    });

    next();
  });

  // CORS setup for development
  if (process.env.NODE_ENV === 'development') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }

      next();
    });
  }

  // Routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter(authService));

  // MCP endpoints will be added here
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'Pipe MCP Server',
      version: '1.0.0',
      mcp: {
        endpoint: '/mcp',
        websocket: `ws://localhost:${process.env.WS_PORT || 3001}`,
      },
    });
  });

  // 404 handler
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Request error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
      });
    }

    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message;

    res.status(500).json({
      error: message,
    });
  });

  // Attach services to app for access in other modules
  (app as any).services = {
    prisma,
    redis,
    authService,
  };

  return app;
}

export function createHttpServer(app: Application) {
  return createServer(app);
}
