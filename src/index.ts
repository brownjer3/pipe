import 'dotenv/config';
import { createApp, createHttpServer } from './app';
import { RealtimeServer } from './realtime/websocket-server';
import { MCPProtocolHandler } from './mcp/protocol-handler';
import { registerMCPTools } from './mcp/tools';
import { logger } from './utils/logger';

async function main() {
  try {
    logger.info('Starting Pipe MCP Server...', {
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
      port: process.env.PORT || 3000,
    });

    // Validate required environment variables
    const requiredEnvVars = ['DATABASE_URL'];
    const optionalButRecommended = ['JWT_SECRET', 'REFRESH_SECRET', 'ENCRYPTION_KEY'];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        logger.error(`Missing required environment variable: ${envVar}`);
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Check optional but recommended vars
    for (const envVar of optionalButRecommended) {
      if (!process.env[envVar]) {
        logger.warn(`Missing recommended environment variable: ${envVar} - using default`);
        // Set defaults for development/testing
        if (envVar === 'JWT_SECRET')
          process.env.JWT_SECRET = 'development-jwt-secret-change-in-production';
        if (envVar === 'REFRESH_SECRET')
          process.env.REFRESH_SECRET = 'development-refresh-secret-change-in-production';
        if (envVar === 'ENCRYPTION_KEY')
          process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
      }
    }

    logger.info('Environment variables validated');

    // Create Express app
    logger.info('Creating Express app...');
    const app = createApp();
    const httpServer = createHttpServer(app);

    // Get services from app
    const services = (app as any).services;
    logger.info('Services initialized');

    // Create MCP protocol handler with services
    const protocolHandler = new MCPProtocolHandler(
      {
        name: 'Pipe',
        version: '1.0.0',
      },
      services.contextEngine,
      services.sessionManager
    );

    // Register MCP tools
    registerMCPTools(
      protocolHandler,
      services.contextEngine,
      services.platformManager,
      services.queueManager
    );

    // Create WebSocket server
    const wsServer = new RealtimeServer(httpServer, services.authService, process.env.REDIS_URL);

    // Connect protocol handler to WebSocket server
    wsServer.setProtocolHandler(protocolHandler);

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    const HOST = '0.0.0.0'; // Important for Railway

    httpServer.listen(Number(PORT), HOST, () => {
      logger.info(`Server started`, {
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV,
        websocket: '/ws',
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      try {
        // Stop accepting new connections
        httpServer.close();

        // Close WebSocket server
        await wsServer.shutdown();

        // Close database connections
        await services.prisma.$disconnect();
        await services.redis.quit();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
