import express, { Application, Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import passport from 'passport';
import { PrismaClient } from './generated/prisma';
import Redis from 'ioredis';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { AuthService } from './auth/auth-service';
import { configurePassport } from './auth/passport-config';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';
import { ContextEngine } from './context/context-engine';
import { PlatformManager } from './platforms/platform-manager';
import { QueueManager } from './jobs/queue-manager';
import { SessionManager } from './sessions/session-manager';
import { GitHubAdapter } from './platforms/adapters/github';
import { SlackAdapter } from './platforms/adapters/slack';
import { createOAuthRoutes } from './routes/oauth';
import { createWebhookRoutes } from './routes/webhooks';

export function createApp(): Application {
  const app = express();

  logger.info('Initializing database connections...');

  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  // Initialize core services
  const authService = new AuthService(prisma, redis, logger);
  const sessionManager = new SessionManager(prisma, redis);

  // Initialize Context Engine (optional if Neo4j is not configured)
  let contextEngine: ContextEngine | null = null;
  if (process.env.NEO4J_URL) {
    contextEngine = new ContextEngine(
      prisma,
      process.env.NEO4J_URL,
      {
        username: process.env.NEO4J_USER || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'pipe_password',
      },
      redis
    );
  } else {
    logger.warn('Neo4j not configured - context engine features will be disabled');
  }

  // Initialize Platform Manager
  const platformManager = new PlatformManager(prisma, contextEngine as any, {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    platforms: {},
  });

  // Register platform adapters
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    platformManager.registerAdapter(
      new GitHubAdapter({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET || 'development-secret',
      })
    );
  }

  if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
    platformManager.registerAdapter(
      new SlackAdapter({
        clientId: process.env.SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET,
        signingSecret: process.env.SLACK_SIGNING_SECRET || 'development-secret',
      })
    );
  }

  // Initialize Queue Manager
  const queueManager = new QueueManager(
    {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    },
    {
      platformManager,
      contextEngine: contextEngine as any,
    }
  );

  // Start session cleanup schedule
  sessionManager.startCleanupSchedule();

  // Configure passport
  configurePassport(authService);

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://cdn.tailwindcss.com',
            'https://www.googletagmanager.com',
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://cdn.tailwindcss.com',
          ],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
        },
      },
    })
  );

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use(limiter);

  // View engine setup
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Static files
  app.use(express.static(path.join(__dirname, '../public')));

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
    app.use((req: Request, res: Response, next: NextFunction): void => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });
  }

  // Routes
  app.use('/health', healthRouter);
  app.use('/auth', authRouter(authService));
  app.use('/api/oauth', createOAuthRoutes(prisma, platformManager));
  app.use('/api/webhooks', createWebhookRoutes(prisma, platformManager));

  // Landing page route
  app.get('/', async (req: Request, res: Response) => {
    try {
      // Get real-time metrics (placeholder for now)
      const metrics = {
        activeUsers: 127,
        searchesPerDay: 1234,
        timeSaved: '2,567 hours',
      };

      res.render('landing', {
        title: 'Pipe - Stop Losing Context',
        user: req.user || null,
        metrics,
      });
    } catch (error) {
      logger.error('Landing page error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Analytics tracking endpoint
  app.post('/api/track', (req: Request, res: Response) => {
    const { event, properties } = req.body;

    // Log analytics event
    logger.info('Analytics event', {
      event,
      properties,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true });
  });

  // API info route
  app.get('/api/mcp', (_req: Request, res: Response) => {
    return res.json({
      name: 'Pipe MCP Server',
      version: '1.0.0',
      mcp: {
        endpoint: '/mcp',
        websocket: `ws://localhost:${process.env.WS_PORT || 3001}`,
      },
    });
  });

  // 404 handler
  app.use((req: Request, res: Response, _next: NextFunction) => {
    return res.status(404).json({
      error: 'Not Found',
      path: req.path,
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction): Response => {
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

    return res.status(500).json({
      error: message,
    });
  });

  // Attach services to app for access in other modules
  (app as any).services = {
    prisma,
    redis,
    authService,
    sessionManager,
    contextEngine,
    platformManager,
    queueManager,
  };

  // Initialize services
  if (contextEngine) {
    contextEngine.initialize().catch((error) => {
      logger.error('Failed to initialize Context Engine', error);
    });
  }

  return app;
}

export function createHttpServer(app: Application) {
  return createServer(app);
}
