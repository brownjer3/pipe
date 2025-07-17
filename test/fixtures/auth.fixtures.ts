import { vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { User, Team } from '@prisma/client';
import { createTestUser, createTestTeam, testIds } from '@test/utils/test-factory';

/**
 * Auth-related test fixtures and utilities
 */

export interface AuthContext {
  user: User;
  team: Team;
  accessToken: string;
  refreshToken: string;
}

/**
 * Create a complete auth context for testing
 */
export const createAuthContext = (
  overrides: {
    user?: Partial<User>;
    team?: Partial<Team>;
  } = {}
): AuthContext => {
  const team = createTestTeam(overrides.team);
  const user = createTestUser({
    teamId: team.id,
    ...overrides.user,
  });

  const accessToken = generateTestAccessToken(user);
  const refreshToken = generateTestRefreshToken(user);

  return {
    user,
    team,
    accessToken,
    refreshToken,
  };
};

/**
 * Generate a test access token
 */
export const generateTestAccessToken = (user: Partial<User> = {}) => {
  const payload = {
    sub: user.id || testIds.uuid(),
    email: user.email || 'test@example.com',
    teamId: user.teamId || null,
    type: 'access',
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret', {
    expiresIn: '15m',
  });
};

/**
 * Generate a test refresh token
 */
export const generateTestRefreshToken = (user: Partial<User> = {}) => {
  const payload = {
    sub: user.id || testIds.uuid(),
    type: 'refresh',
  };

  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret', {
    expiresIn: '7d',
  });
};

/**
 * Create an expired token for testing
 */
export const generateExpiredToken = () => {
  const payload = {
    sub: testIds.uuid(),
    type: 'access',
  };

  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret', {
    expiresIn: '-1h', // Expired 1 hour ago
  });
};

/**
 * Create request headers with authentication
 */
export const authenticatedHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/**
 * Mock auth middleware for unit tests
 */
export const mockAuthMiddleware = () => {
  return vi.fn((req, res, next) => {
    // Attach mock user to request
    req.user = createTestUser();
    next();
  });
};

/**
 * Create a mock authenticated request object
 */
export const createAuthenticatedRequest = (overrides: any = {}) => ({
  headers: {
    authorization: `Bearer ${generateTestAccessToken()}`,
    ...overrides.headers,
  },
  user: createTestUser(),
  ...overrides,
});

/**
 * OAuth test data
 */
export const oauthTestData = {
  github: {
    profile: {
      id: 'github-123',
      username: 'testuser',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com', primary: true, verified: true }],
      photos: [{ value: 'https://github.com/avatar.jpg' }],
    },
    accessToken: 'github-access-token',
    refreshToken: 'github-refresh-token',
  },
};
