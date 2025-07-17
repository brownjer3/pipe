import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { PlatformManager } from '../platforms/platform-manager';
import { PlatformType } from '../types/platform';
import { authenticateToken } from '../auth/middleware';
import { logger } from '../utils/logger';

export function createOAuthRoutes(prisma: PrismaClient, platformManager: PlatformManager): Router {
  const router = Router();

  // Initiate OAuth flow
  router.get(
    '/connect/:platform',
    authenticateToken,
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const platform = req.params.platform as PlatformType;
        const adapter = platformManager.getAdapter(platform);

        if (!adapter) {
          return res.status(400).json({ error: 'Invalid platform' });
        }

        // Generate state token for CSRF protection
        const state = uuidv4();

        // Store state in session or Redis with user info
        // For now, we'll use a simple in-memory store
        // In production, use Redis or session storage
        const stateData = {
          userId: req.user!.userId,
          teamId: req.user!.teamId,
          platform,
          timestamp: Date.now(),
        };

        // TODO: Store state in Redis with 10-minute expiry
        // await redis.setex(`oauth:state:${state}`, 600, JSON.stringify(stateData));

        // Generate redirect URI
        const redirectUri = `${process.env.APP_URL}/api/oauth/callback/${platform}`;

        // Get OAuth URL from adapter
        const authUrl = adapter.getOAuthUrl(state, redirectUri);

        return res.json({ authUrl });
      } catch (error: any) {
        logger.error('OAuth connect error', {
          error: error.message,
          platform: req.params.platform,
        });
        return res.status(500).json({ error: 'Failed to initiate OAuth flow' });
      }
    }
  );

  // OAuth callback handler
  router.get('/callback/:platform', async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as PlatformType;
      const { code, state, error: oauthError } = req.query;

      // Handle OAuth errors
      if (oauthError) {
        logger.error('OAuth callback error', { platform, error: oauthError });
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings/integrations?error=${oauthError}`
        );
      }

      if (!code || !state) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings/integrations?error=missing_params`
        );
      }

      // TODO: Verify state from Redis
      // const stateData = await redis.get(`oauth:state:${state}`);
      // if (!stateData) {
      //   return res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=invalid_state`);
      // }

      // For now, decode from JWT or use a temporary solution
      const adapter = platformManager.getAdapter(platform);
      if (!adapter) {
        return res.redirect(
          `${process.env.FRONTEND_URL}/settings/integrations?error=invalid_platform`
        );
      }

      // Exchange code for token
      const redirectUri = `${process.env.APP_URL}/api/oauth/callback/${platform}`;
      const credentials = await adapter.exchangeCodeForToken(code as string, redirectUri);

      // Save credentials
      await platformManager.saveCredentials(credentials.userId, platform, credentials);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: credentials.userId,
          teamId: credentials.teamId,
          action: 'platform.connected',
          resourceType: 'platform_connection',
          resourceId: platform,
          metadata: {
            platform,
            scope: credentials.scope,
          },
        },
      });

      // Trigger initial sync
      await platformManager.syncPlatform(platform, credentials.userId, { full: false });

      // Redirect to success page
      res.redirect(
        `${process.env.FRONTEND_URL}/settings/integrations?success=true&platform=${platform}`
      );
    } catch (error: any) {
      logger.error('OAuth callback error', {
        error: error.message,
        platform: req.params.platform,
      });
      res.redirect(`${process.env.FRONTEND_URL}/settings/integrations?error=token_exchange_failed`);
    }
  });

  // Disconnect platform
  router.post('/disconnect/:platform', authenticateToken, async (req: Request, res: Response) => {
    try {
      const platform = req.params.platform as PlatformType;
      const userId = req.user!.userId;

      await platformManager.disconnectPlatform(userId, platform);

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId,
          teamId: req.user!.teamId,
          action: 'platform.disconnected',
          resourceType: 'platform_connection',
          resourceId: platform,
          metadata: { platform },
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Platform disconnect error', {
        error: error.message,
        platform: req.params.platform,
      });
      res.status(500).json({ error: 'Failed to disconnect platform' });
    }
  });

  // Get connected platforms
  router.get('/connections', authenticateToken, async (req: Request, res: Response) => {
    try {
      const connections = await prisma.platformConnection.findMany({
        where: {
          userId: req.user!.userId,
          isActive: true,
        },
        select: {
          platform: true,
          createdAt: true,
          lastSyncAt: true,
          metadata: true,
        },
      });

      res.json({ connections });
    } catch (error: any) {
      logger.error('Get connections error', { error: error.message });
      res.status(500).json({ error: 'Failed to get connections' });
    }
  });

  // Trigger manual sync
  router.post(
    '/sync/:platform',
    authenticateToken,
    async (req: Request, res: Response): Promise<Response> => {
      try {
        const platform = req.params.platform as PlatformType;
        const { full = false } = req.body;
        const userId = req.user!.userId;

        // Check if user has connection
        const connection = await prisma.platformConnection.findUnique({
          where: {
            userId_platform: {
              userId,
              platform,
            },
          },
        });

        if (!connection || !connection.isActive) {
          return res.status(404).json({ error: 'Platform not connected' });
        }

        // Queue sync job
        const result = await platformManager.syncPlatform(platform, userId, { full });

        return res.json({
          success: true,
          itemsSynced: result.totalSynced,
          errors: result.errors.length,
        });
      } catch (error: any) {
        logger.error('Manual sync error', {
          error: error.message,
          platform: req.params.platform,
        });
        return res.status(500).json({ error: 'Failed to trigger sync' });
      }
    }
  );

  return router;
}
