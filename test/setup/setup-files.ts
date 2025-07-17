import { vi, beforeEach, afterEach } from 'vitest';
import '@test/utils/matchers';

/**
 * Setup file that runs before each test file
 * Used for common test configuration and mocks
 */

// Mock console methods in tests to avoid noise
if (!process.env.ENABLE_TEST_LOGS) {
  global.console = {
    ...console,
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

// Configure vi globals
vi.stubGlobal('Date', {
  ...Date,
  now: vi.fn(() => new Date('2025-01-17T00:00:00Z').getTime()),
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Extend expect with custom matchers
declare global {
  namespace Vi {
    interface Assertion<T> {
      toBeValidJWT(): void;
      toBeValidUUID(): void;
      toMatchMCPMessage(expected: any): void;
      toBeWithinRange(min: number, max: number): void;
    }
  }
}

// Mock modules that are commonly used
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    team: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  })),
}));

// Helper to access mocked Prisma
export const getMockedPrisma = async () => {
  const { PrismaClient } = vi.mocked(await import('@prisma/client'));
  return new PrismaClient();
};
