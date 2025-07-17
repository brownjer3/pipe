import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { MCPConnection } from '../types/websocket';
import { logger } from '../utils/logger';

export interface Session {
  id: string;
  userId: string;
  teamId: string;
  connectionId: string;
  state: Record<string, any>;
  lastActivity: Date;
  expiresAt?: Date;
}

export interface SessionData {
  userId: string;
  teamId: string;
  metadata?: Record<string, any>;
}

export class SessionManager {
  private redis: Redis;
  private sessionTTL = 24 * 60 * 60; // 24 hours in seconds

  constructor(
    private prisma: PrismaClient,
    redisClient: Redis
  ) {
    this.redis = redisClient;
  }

  async getOrCreate(connection: MCPConnection): Promise<Session> {
    // Check if session exists for this connection
    let session = await this.getByConnectionId(connection.id);

    if (!session) {
      // Create new session
      session = await this.create(
        {
          userId: connection.userId,
          teamId: connection.teamId,
          metadata: connection.metadata,
        },
        connection.id
      );
    } else {
      // Update last activity
      await this.touch(session.id);
    }

    return session;
  }

  async create(data: SessionData, connectionId: string): Promise<Session> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTTL * 1000);

    // Store in PostgreSQL
    const dbSession = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: data.userId,
        teamId: data.teamId,
        connectionId,
        metadata: data.metadata || {},
        lastActivity: now,
        expiresAt,
      },
    });

    // Store in Redis for fast access
    const session: Session = {
      id: sessionId,
      userId: data.userId,
      teamId: data.teamId,
      connectionId,
      state: {},
      lastActivity: now,
      expiresAt,
    };

    await this.saveToRedis(session);

    logger.info('Session created', {
      sessionId,
      userId: data.userId,
      teamId: data.teamId,
      connectionId,
    });

    return session;
  }

  async get(sessionId: string): Promise<Session | null> {
    // Try Redis first
    const redisKey = `session:${sessionId}`;
    const cached = await this.redis.get(redisKey);

    if (cached) {
      const session = JSON.parse(cached);
      // Parse dates
      session.lastActivity = new Date(session.lastActivity);
      if (session.expiresAt) {
        session.expiresAt = new Date(session.expiresAt);
      }
      return session;
    }

    // Fallback to database
    const dbSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) {
      return null;
    }

    const session: Session = {
      id: dbSession.id,
      userId: dbSession.userId,
      teamId: dbSession.teamId,
      connectionId: dbSession.connectionId!,
      state: {},
      lastActivity: dbSession.lastActivity,
      expiresAt: dbSession.expiresAt || undefined,
    };

    // Cache in Redis
    await this.saveToRedis(session);

    return session;
  }

  async getByConnectionId(connectionId: string): Promise<Session | null> {
    // Check Redis mapping
    const sessionId = await this.redis.get(`connection:${connectionId}`);
    if (sessionId) {
      return this.get(sessionId);
    }

    // Fallback to database
    const dbSession = await this.prisma.session.findUnique({
      where: { connectionId },
    });

    if (!dbSession) {
      return null;
    }

    const session: Session = {
      id: dbSession.id,
      userId: dbSession.userId,
      teamId: dbSession.teamId,
      connectionId: dbSession.connectionId!,
      state: {},
      lastActivity: dbSession.lastActivity,
      expiresAt: dbSession.expiresAt || undefined,
    };

    // Cache in Redis
    await this.saveToRedis(session);
    await this.redis.setex(`connection:${connectionId}`, this.sessionTTL, session.id);

    return session;
  }

  async updateState(sessionId: string, state: Record<string, any>): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Merge state
    session.state = { ...session.state, ...state };

    // Update in Redis
    await this.saveToRedis(session);

    // Update database metadata
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: session.state,
        lastActivity: new Date(),
      },
    });
  }

  async touch(sessionId: string): Promise<void> {
    const now = new Date();

    // Update Redis
    const session = await this.get(sessionId);
    if (session) {
      session.lastActivity = now;
      await this.saveToRedis(session);
    }

    // Update database
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastActivity: now },
    });
  }

  async destroy(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) {
      return;
    }

    // Remove from Redis
    await this.redis.del(`session:${sessionId}`);
    await this.redis.del(`connection:${session.connectionId}`);

    // Remove from database
    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    logger.info('Session destroyed', { sessionId });
  }

  async destroyByConnectionId(connectionId: string): Promise<void> {
    const session = await this.getByConnectionId(connectionId);
    if (session) {
      await this.destroy(session.id);
    }
  }

  async getActiveSessions(teamId: string): Promise<Session[]> {
    const dbSessions = await this.prisma.session.findMany({
      where: {
        teamId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastActivity: 'desc',
      },
    });

    return dbSessions.map((dbSession) => ({
      id: dbSession.id,
      userId: dbSession.userId,
      teamId: dbSession.teamId,
      connectionId: dbSession.connectionId!,
      state: dbSession.metadata as Record<string, any>,
      lastActivity: dbSession.lastActivity,
      expiresAt: dbSession.expiresAt || undefined,
    }));
  }

  async cleanup(): Promise<void> {
    // Clean up expired sessions
    const deleted = await this.prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (deleted.count > 0) {
      logger.info('Cleaned up expired sessions', { count: deleted.count });
    }

    // Also clean up Redis
    const pattern = 'session:*';
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const session = await this.redis.get(key);
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
          await this.redis.del(key);
        }
      }
    }
  }

  private async saveToRedis(session: Session): Promise<void> {
    const redisKey = `session:${session.id}`;
    const ttl = session.expiresAt
      ? Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      : this.sessionTTL;

    await this.redis.setex(redisKey, ttl, JSON.stringify(session));

    // Also store connection mapping
    if (session.connectionId) {
      await this.redis.setex(`connection:${session.connectionId}`, ttl, session.id);
    }
  }

  // Schedule periodic cleanup
  startCleanupSchedule(): void {
    setInterval(
      () => {
        this.cleanup().catch((error) => {
          logger.error('Session cleanup error', error);
        });
      },
      60 * 60 * 1000
    ); // Run every hour
  }
}
