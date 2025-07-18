import { Router, Request, Response } from 'express';
import neo4j from 'neo4j-driver';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  error?: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: HealthCheck[];
}

export const healthRouter = Router();

// Basic health check
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Detailed health check
healthRouter.get('/detailed', async (req: Request, res: Response) => {
  const app = req.app as any;
  const services = app.services;

  const checks: HealthCheck[] = [];

  // PostgreSQL check
  try {
    const start = Date.now();
    await services.prisma.$queryRaw`SELECT 1`;
    checks.push({
      name: 'postgres',
      status: 'healthy',
      latency: Date.now() - start,
    });
  } catch (error: any) {
    checks.push({
      name: 'postgres',
      status: 'unhealthy',
      error: error.message,
    });
  }

  // Redis check
  try {
    const start = Date.now();
    await services.redis.ping();
    checks.push({
      name: 'redis',
      status: 'healthy',
      latency: Date.now() - start,
    });
  } catch (error: any) {
    checks.push({
      name: 'redis',
      status: 'unhealthy',
      error: error.message,
    });
  }

  // Neo4j check (if configured)
  if (process.env.NEO4J_URL) {
    const driver = neo4j.driver(
      process.env.NEO4J_URL,
      neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password')
    );

    try {
      const start = Date.now();
      const session = driver.session();
      await session.run('RETURN 1');
      await session.close();
      checks.push({
        name: 'neo4j',
        status: 'healthy',
        latency: Date.now() - start,
      });
    } catch (error: any) {
      checks.push({
        name: 'neo4j',
        status: 'unhealthy',
        error: error.message,
      });
    } finally {
      await driver.close();
    }
  }

  const allHealthy = checks.every((c) => c.status === 'healthy');
  const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');

  const status: HealthStatus = {
    status: hasUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  };

  const statusCode = status.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(status);
});

// Liveness probe for Kubernetes
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json({ alive: true });
});

// Readiness probe for Kubernetes
healthRouter.get('/ready', async (req: Request, res: Response) => {
  const app = req.app as any;
  const services = app.services;

  try {
    // Check if critical services are ready
    await services.prisma.$queryRaw`SELECT 1`;
    await services.redis.ping();

    res.json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});
