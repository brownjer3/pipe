import 'dotenv/config';
import { createApp, createHttpServer } from './app';
import { RealtimeServer } from './realtime/websocket-server';
import { MCPProtocolHandler } from './mcp/protocol-handler';
import { logger } from './utils/logger';

async function main() {
  try {
    // Validate required environment variables
    const requiredEnvVars = ['JWT_SECRET', 'REFRESH_SECRET', 'DATABASE_URL'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }

    // Create Express app
    const app = createApp();
    const httpServer = createHttpServer(app);

    // Get services from app
    const services = (app as any).services;

    // Create MCP protocol handler
    const protocolHandler = new MCPProtocolHandler({
      name: 'Pipe',
      version: '1.0.0',
    });

    // Create WebSocket server
    const wsServer = new RealtimeServer(httpServer, services.authService, process.env.REDIS_URL);

    // Connect protocol handler to WebSocket server
    wsServer.setProtocolHandler(protocolHandler);

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
      logger.info(`Server started`, {
        port: PORT,
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
