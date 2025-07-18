import { Router, Request, Response } from 'express';

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

  // Context Graph check (PostgreSQL-based)
  try {
    const start = Date.now();
    // Test graph query capability
    await services.prisma.$queryRaw`
      SELECT COUNT(*) FROM context_nodes WHERE "teamId" IS NOT NULL LIMIT 1
    `;
    checks.push({
      name: 'context-graph',
      status: 'healthy',
      latency: Date.now() - start,
    });
  } catch (error: any) {
    checks.push({
      name: 'context-graph',
      status: 'unhealthy',
      error: error.message,
    });
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
