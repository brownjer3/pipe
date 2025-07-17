import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PlatformManager } from '../platforms/platform-manager';
import { PlatformType } from '../types/platform';
import { logger } from '../utils/logger';

export function createWebhookRoutes(
  prisma: PrismaClient,
  platformManager: PlatformManager
): Router {
  const router = Router();

  // GitHub webhook endpoint
  router.post('/github', async (req: Request, res: Response): Promise<Response> => {
    try {
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      // GitHub sends the event type in the X-GitHub-Event header
      const eventType = headers['x-github-event'];
      logger.info('GitHub webhook received', { eventType });

      // Process webhook
      await platformManager.handleWebhook('github', headers, body);

      // GitHub expects a 200 response
      return res.status(200).send('OK');
    } catch (error: any) {
      logger.error('GitHub webhook error', { error: error.message });

      if (error.message === 'Invalid webhook signature') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Slack webhook/events endpoint
  router.post('/slack', async (req: Request, res: Response): Promise<Response> => {
    try {
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      // Handle Slack URL verification challenge
      if (body.type === 'url_verification') {
        logger.info('Slack URL verification challenge received');
        return res.json({ challenge: body.challenge });
      }

      logger.info('Slack event received', {
        type: body.type,
        event: body.event?.type,
      });

      // Process webhook
      await platformManager.handleWebhook('slack', headers, body);

      // Slack expects a 200 response quickly
      return res.status(200).send('OK');
    } catch (error: any) {
      logger.error('Slack webhook error', { error: error.message });

      if (error.message === 'Invalid webhook signature') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Jira webhook endpoint
  router.post('/jira', async (req: Request, res: Response): Promise<Response> => {
    try {
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      logger.info('Jira webhook received', {
        webhookEvent: body.webhookEvent,
        issueEventTypeName: body.issue_event_type_name,
      });

      // Process webhook
      await platformManager.handleWebhook('jira', headers, body);

      return res.status(200).send('OK');
    } catch (error: any) {
      logger.error('Jira webhook error', { error: error.message });

      if (error.message === 'Invalid webhook signature') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Linear webhook endpoint
  router.post('/linear', async (req: Request, res: Response): Promise<Response> => {
    try {
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      logger.info('Linear webhook received', {
        action: body.action,
        type: body.type,
      });

      // Process webhook
      await platformManager.handleWebhook('linear', headers, body);

      return res.status(200).send('OK');
    } catch (error: any) {
      logger.error('Linear webhook error', { error: error.message });

      if (error.message === 'Invalid webhook signature') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Notion webhook endpoint
  router.post('/notion', async (req: Request, res: Response): Promise<Response> => {
    try {
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      logger.info('Notion webhook received');

      // Process webhook
      await platformManager.handleWebhook('notion', headers, body);

      return res.status(200).send('OK');
    } catch (error: any) {
      logger.error('Notion webhook error', { error: error.message });

      if (error.message === 'Invalid webhook signature') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Generic webhook endpoint for testing
  router.post('/test/:platform', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as PlatformType;
      const headers = req.headers as Record<string, string>;
      const body = req.body;

      logger.info(`Test webhook received for ${platform}`, { body });

      // Store in database for inspection
      await prisma.webhookEvent.create({
        data: {
          platform,
          eventType: 'test',
          payload: body,
          status: 'pending',
        },
      });

      return res.status(200).json({
        received: true,
        platform,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Test webhook error', {
        error: error.message,
        platform: req.params.platform,
      });
      return res.status(500).json({ error: 'Failed to process test webhook' });
    }
  });

  // Webhook status endpoint
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const recentWebhooks = await prisma.webhookEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          platform: true,
          eventType: true,
          status: true,
          createdAt: true,
          processedAt: true,
          error: true,
        },
      });

      const stats = await prisma.webhookEvent.groupBy({
        by: ['platform', 'status'],
        _count: {
          id: true,
        },
      });

      return res.json({
        recent: recentWebhooks,
        stats: stats.map((s) => ({
          platform: s.platform,
          status: s.status,
          count: s._count.id,
        })),
      });
    } catch (error: any) {
      logger.error('Webhook status error', { error: error.message });
      return res.status(500).json({ error: 'Failed to get webhook status' });
    }
  });

  return router;
}
