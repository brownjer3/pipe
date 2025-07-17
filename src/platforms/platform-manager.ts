import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  PlatformAdapter,
  PlatformType,
  PlatformCredentials,
  SyncOptions,
  SyncResult,
  WebhookEvent,
} from '../types/platform';
import { ContextEngine } from '../context/context-engine';
import { EncryptionService } from '../utils/encryption';
import { logger } from '../utils/logger';

export interface PlatformManagerConfig {
  redis: {
    host: string;
    port: number;
  };
  platforms: Record<string, any>;
}

export class PlatformManager {
  private adapters = new Map<PlatformType, PlatformAdapter>();
  private syncQueue: Queue;
  private webhookQueue: Queue;
  private encryptionService: EncryptionService;

  constructor(
    private prisma: PrismaClient,
    private contextEngine: ContextEngine,
    private config: PlatformManagerConfig
  ) {
    this.encryptionService = new EncryptionService();

    // Initialize queues
    this.syncQueue = new Queue('platform:sync', {
      connection: this.config.redis,
    });

    this.webhookQueue = new Queue('webhook:process', {
      connection: this.config.redis,
    });
  }

  registerAdapter(adapter: PlatformAdapter) {
    this.adapters.set(adapter.name, adapter);
    logger.info(`Platform adapter registered: ${adapter.name}`);
  }

  getAdapter(platform: PlatformType): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  async syncPlatform(
    platform: PlatformType,
    userId: string,
    options: SyncOptions
  ): Promise<SyncResult> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${platform}`);
    }

    // Get user credentials
    const credentials = await this.getCredentials(userId, platform);
    if (!credentials) {
      throw new Error(`No credentials found for platform: ${platform}`);
    }

    // Check if credentials need refresh
    if (credentials.expiresAt && credentials.expiresAt < new Date() && adapter.refreshToken) {
      try {
        const refreshed = await adapter.refreshToken(credentials);
        await this.saveCredentials(userId, platform, refreshed);
        Object.assign(credentials, refreshed);
      } catch (error) {
        logger.error(`Failed to refresh token for ${platform}`, error);
        throw new Error('Authentication expired. Please reconnect.');
      }
    }

    // Get last sync timestamp
    const lastSync = options.full ? null : await this.getLastSync(userId, platform);

    try {
      // Perform sync
      const syncResult = await adapter.sync(credentials, {
        since: lastSync?.toISOString() || null,
        filters: options.filters,
        limit: options.limit,
      });

      // Process sync results
      for (const item of syncResult.items) {
        await this.contextEngine.createContextNode({
          type: this.mapItemTypeToContextType(item.type),
          platform,
          teamId: syncResult.teamId,
          userId,
          data: {
            externalId: item.id,
            title: item.data.title || item.data.name,
            content: item.data.content || item.data.description,
            url: item.data.url || item.data.html_url,
            author: item.data.author,
          },
          metadata: {
            ...item.metadata,
            rawData: item.data,
            syncedAt: new Date().toISOString(),
          },
          relatedTo: item.relatedTo?.map((targetId) => ({
            targetId,
            type: 'relates_to',
          })),
        });
      }

      // Update sync status
      await this.updateSyncStatus(userId, platform, syncResult);

      return syncResult;
    } catch (error) {
      logger.error(`Platform sync failed for ${platform}`, error);
      throw error;
    }
  }

  async handleWebhook(
    platform: PlatformType,
    headers: Record<string, string>,
    body: any
  ): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform adapter not found: ${platform}`);
    }

    // Verify webhook signature
    const verified = await adapter.verifyWebhook(headers, body);
    if (!verified) {
      throw new Error('Invalid webhook signature');
    }

    // Parse webhook events
    const events = await adapter.parseWebhook(body);

    // Queue events for processing
    for (const event of events) {
      await this.webhookQueue.add(
        'process',
        {
          platform,
          event,
          receivedAt: new Date().toISOString(),
        },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );
    }

    logger.info(`Queued ${events.length} webhook events for ${platform}`);
  }

  async processWebhookEvent(platform: PlatformType, event: WebhookEvent): Promise<void> {
    // Find the team associated with this webhook
    // In a real implementation, this would be determined from the webhook payload
    const teamId = await this.findTeamForWebhook(platform, event);
    if (!teamId) {
      logger.warn(`No team found for webhook event`, { platform, event });
      return;
    }

    // Map webhook event to context node
    const contextData = this.mapWebhookEventToContext(platform, event, teamId);

    // Create or update context node
    await this.contextEngine.createContextNode(contextData);
  }

  private async getCredentials(
    userId: string,
    platform: PlatformType
  ): Promise<PlatformCredentials | null> {
    const connection = await this.prisma.platformConnection.findUnique({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
    });

    if (!connection || !connection.isActive) {
      return null;
    }

    // Decrypt tokens
    const decryptedAccessToken = connection.accessToken
      ? this.encryptionService.decrypt(connection.accessToken)
      : '';
    const decryptedRefreshToken = connection.refreshToken
      ? this.encryptionService.decrypt(connection.refreshToken)
      : undefined;

    return {
      teamId: connection.teamId,
      userId: connection.userId,
      accessToken: decryptedAccessToken,
      refreshToken: decryptedRefreshToken,
      expiresAt: connection.expiresAt || undefined,
      scope: connection.scope,
      metadata: connection.metadata as Record<string, any>,
    };
  }

  async saveCredentials(
    userId: string,
    platform: PlatformType,
    credentials: PlatformCredentials
  ): Promise<void> {
    // Encrypt tokens
    const encryptedAccessToken = this.encryptionService.encrypt(credentials.accessToken);
    const encryptedRefreshToken = credentials.refreshToken
      ? this.encryptionService.encrypt(credentials.refreshToken)
      : null;

    await this.prisma.platformConnection.upsert({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: credentials.expiresAt,
        scope: credentials.scope || [],
        metadata: credentials.metadata || {},
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        teamId: credentials.teamId,
        platform,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: credentials.expiresAt,
        scope: credentials.scope || [],
        metadata: credentials.metadata || {},
        isActive: true,
      },
    });
  }

  private async getLastSync(userId: string, platform: PlatformType): Promise<Date | null> {
    const syncStatus = await this.prisma.syncStatus.findUnique({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
    });

    return syncStatus?.lastSyncAt || null;
  }

  private async updateSyncStatus(
    userId: string,
    platform: PlatformType,
    result: SyncResult
  ): Promise<void> {
    const nextSyncAt = new Date();
    nextSyncAt.setHours(nextSyncAt.getHours() + 1); // Default to hourly sync

    await this.prisma.syncStatus.upsert({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
      update: {
        lastSyncAt: new Date(),
        nextSyncAt,
        status: result.errors.length > 0 ? 'partial' : 'completed',
        itemsSynced: result.totalSynced,
        errors: result.errors,
        metadata: result.metadata || {},
        updatedAt: new Date(),
      },
      create: {
        userId,
        teamId: result.teamId,
        platform,
        lastSyncAt: new Date(),
        nextSyncAt,
        status: result.errors.length > 0 ? 'partial' : 'completed',
        itemsSynced: result.totalSynced,
        errors: result.errors,
        metadata: result.metadata || {},
      },
    });
  }

  private mapItemTypeToContextType(itemType: string): any {
    const typeMap: Record<string, string> = {
      repository: 'document',
      issue: 'issue',
      pull_request: 'pull_request',
      commit: 'commit',
      comment: 'comment',
      message: 'message',
      thread: 'thread',
      task: 'task',
      page: 'document',
      database: 'document',
    };

    return typeMap[itemType] || 'document';
  }

  private async findTeamForWebhook(
    platform: PlatformType,
    event: WebhookEvent
  ): Promise<string | null> {
    // In a real implementation, this would extract team information from the webhook
    // For now, we'll find the first team with an active connection to this platform
    const connection = await this.prisma.platformConnection.findFirst({
      where: {
        platform,
        isActive: true,
      },
    });

    return connection?.teamId || null;
  }

  private mapWebhookEventToContext(
    platform: PlatformType,
    event: WebhookEvent,
    teamId: string
  ): any {
    // Map webhook event to context creation params
    // This is a simplified version - each platform adapter would have specific mapping
    return {
      type: this.mapItemTypeToContextType(event.type),
      platform,
      teamId,
      userId: 'system', // Webhook events are system-generated
      data: {
        externalId: event.data.id || `${platform}-${event.type}-${Date.now()}`,
        title: event.data.title || event.data.name || `${event.type} ${event.action}`,
        content: event.data.body || event.data.description || event.data.text,
        url: event.data.html_url || event.data.url,
        author: event.data.user || event.data.sender || event.data.author,
      },
      metadata: {
        webhookEvent: event.type,
        webhookAction: event.action,
        ...event.metadata,
      },
    };
  }

  async getActiveConnections(
    teamId: string
  ): Promise<Array<{ platform: PlatformType; users: number }>> {
    const connections = await this.prisma.platformConnection.groupBy({
      by: ['platform'],
      where: {
        teamId,
        isActive: true,
      },
      _count: {
        userId: true,
      },
    });

    return connections.map((c) => ({
      platform: c.platform as PlatformType,
      users: c._count.userId,
    }));
  }

  async disconnectPlatform(userId: string, platform: PlatformType): Promise<void> {
    await this.prisma.platformConnection.update({
      where: {
        userId_platform: {
          userId,
          platform,
        },
      },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
        updatedAt: new Date(),
      },
    });

    logger.info(`Platform disconnected`, { userId, platform });
  }
}
