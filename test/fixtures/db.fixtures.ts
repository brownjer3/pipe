import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestUser, createTestTeam, createTestSession } from '@test/utils/test-factory';

/**
 * Database test fixtures and utilities
 */

/**
 * Create a mock Prisma client with common operations
 */
export const createMockPrismaClient = (): PrismaClient => {
  const mockPrisma = {
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $transaction: vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === 'function') {
        return fn(mockPrisma);
      }
      return Promise.all(fn);
    }),

    user: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(createTestUser(data))),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },

    team: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(createTestTeam(data))),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },

    session: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve(createTestSession(data))),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(0),
    },

    platformConnection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },

    auditLog: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },

    syncStatus: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  } as unknown as PrismaClient;

  return mockPrisma;
};

/**
 * Create a mock Redis client
 */
export const createMockRedisClient = () => {
  const store = new Map<string, any>();

  return {
    get: vi.fn().mockImplementation((key) => Promise.resolve(store.get(key) || null)),
    set: vi.fn().mockImplementation((key, value, ...args) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn().mockImplementation((key) => {
      const deleted = store.delete(key);
      return Promise.resolve(deleted ? 1 : 0);
    }),
    exists: vi.fn().mockImplementation((key) => Promise.resolve(store.has(key) ? 1 : 0)),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),

    // Hash operations
    hget: vi.fn(),
    hset: vi.fn().mockResolvedValue(1),
    hdel: vi.fn().mockResolvedValue(1),
    hgetall: vi.fn().mockResolvedValue({}),

    // Pub/Sub
    publish: vi.fn().mockResolvedValue(0),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),

    // Connection
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn().mockResolvedValue(undefined),

    // Utility
    flushall: vi.fn().mockImplementation(() => {
      store.clear();
      return Promise.resolve('OK');
    }),

    // Internal test utility
    _store: store,
  };
};

/**
 * Create a mock Neo4j driver
 */
export const createMockNeo4jDriver = () => {
  const mockSession = {
    run: vi.fn().mockResolvedValue({
      records: [],
      summary: {
        counters: {
          nodesCreated: 0,
          nodesDeleted: 0,
          relationshipsCreated: 0,
          relationshipsDeleted: 0,
        },
      },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn().mockResolvedValue(undefined),
    verifyConnectivity: vi.fn().mockResolvedValue(undefined),
  };
};

/**
 * Database transaction test helper
 */
export const mockTransaction = async <T>(
  prisma: PrismaClient,
  operations: (tx: PrismaClient) => Promise<T>
): Promise<T> => {
  return operations(prisma);
};

/**
 * Seed test data helper
 */
export const seedTestData = async (prisma: PrismaClient) => {
  const team = await prisma.team.create({
    data: createTestTeam(),
  });

  const users = await Promise.all([
    prisma.user.create({
      data: createTestUser({ teamId: team.id, email: 'owner@example.com' }),
    }),
    prisma.user.create({
      data: createTestUser({ teamId: team.id, email: 'member@example.com' }),
    }),
  ]);

  return { team, users };
};
