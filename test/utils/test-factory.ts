import { v4 as uuidv4 } from 'uuid';
import type { User, Team, Session, PlatformConnection } from '@prisma/client';

/**
 * Test data factories for generating consistent test data
 */

let idCounter = 0;

export const testIds = {
  nextId: () => ++idCounter,
  uuid: () => uuidv4(),
  reset: () => {
    idCounter = 0;
  },
};

export const createTestUser = (overrides: Partial<User> = {}): User => ({
  id: testIds.uuid(),
  email: `test${testIds.nextId()}@example.com`,
  password: '$2b$10$hashed.password.here', // bcrypt hash
  name: `Test User ${idCounter}`,
  avatar: null,
  teamId: null,
  createdAt: new Date('2025-01-17T00:00:00Z'),
  updatedAt: new Date('2025-01-17T00:00:00Z'),
  ...overrides,
});

export const createTestTeam = (overrides: Partial<Team> = {}): Team => ({
  id: testIds.uuid(),
  name: `Test Team ${testIds.nextId()}`,
  description: 'A test team for unit testing',
  ownerId: testIds.uuid(),
  createdAt: new Date('2025-01-17T00:00:00Z'),
  updatedAt: new Date('2025-01-17T00:00:00Z'),
  ...overrides,
});

export const createTestSession = (overrides: Partial<Session> = {}): Session => ({
  id: testIds.uuid(),
  userId: testIds.uuid(),
  token: `test-refresh-token-${testIds.nextId()}`,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  createdAt: new Date('2025-01-17T00:00:00Z'),
  updatedAt: new Date('2025-01-17T00:00:00Z'),
  ...overrides,
});

export const createTestPlatformConnection = (
  overrides: Partial<PlatformConnection> = {}
): PlatformConnection => ({
  id: testIds.uuid(),
  userId: testIds.uuid(),
  platform: 'github',
  platformUserId: `github-user-${testIds.nextId()}`,
  accessToken: 'encrypted-access-token',
  refreshToken: 'encrypted-refresh-token',
  tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  metadata: {},
  createdAt: new Date('2025-01-17T00:00:00Z'),
  updatedAt: new Date('2025-01-17T00:00:00Z'),
  ...overrides,
});

export const createTestJWT = (payload: any = {}, secret = 'test-secret') => {
  // Mock JWT for testing - not using real jwt.sign to avoid dependencies in tests
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(
    JSON.stringify({
      sub: testIds.uuid(),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    })
  ).toString('base64');
  const signature = 'test-signature';

  return `${header}.${body}.${signature}`;
};

export const createMCPRequest = (method: string, params: any = {}, id: number | string = 1) => ({
  jsonrpc: '2.0',
  id,
  method,
  params,
});

export const createMCPResponse = (result: any, id: number | string = 1) => ({
  jsonrpc: '2.0',
  id,
  result,
});

export const createMCPError = (code: number, message: string, id: number | string = 1) => ({
  jsonrpc: '2.0',
  id,
  error: {
    code,
    message,
  },
});

// Reset all factories
export const resetFactories = () => {
  testIds.reset();
};
