import { vi } from 'vitest';
import { createMockRedisClient } from '@test/fixtures/db.fixtures';

/**
 * Mock for ioredis module
 * This mock is automatically used when 'ioredis' is imported in tests
 */

export const Redis = vi.fn().mockImplementation(() => {
  return createMockRedisClient();
});

export default Redis;
