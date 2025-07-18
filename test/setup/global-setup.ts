import { beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

/**
 * Global setup that runs once before all test suites
 * Used for one-time initialization of test environment
 */
export async function setup() {
  console.log('🚀 Setting up test environment...');

  // Load test environment variables
  dotenv.config({ path: resolve(__dirname, '../test-env/.env.test') });

  // Set test-specific environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key';
  // 32 bytes = 64 hex characters
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  // Database URLs for test containers (if using)
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5433/pipe_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6380';

  // Disable logging in tests unless explicitly enabled
  if (!process.env.ENABLE_TEST_LOGS) {
    process.env.LOG_LEVEL = 'silent';
  }

  console.log('✅ Test environment setup complete');
}

/**
 * Global teardown that runs once after all test suites
 */
export async function teardown() {
  console.log('🧹 Cleaning up test environment...');

  // Add any global cleanup here
  // For example: close database connections, clean up test files, etc.

  console.log('✅ Test environment cleanup complete');
}
