import { beforeAll, afterAll } from 'vitest';

/**
 * Setup for integration tests
 * Initializes real services and connections for integration testing
 */

let cleanupFunctions: Array<() => Promise<void>> = [];

beforeAll(async () => {
  console.log('🔧 Setting up integration test environment...');

  // Integration tests may use real databases with test schemas
  // Add any specific integration test setup here

  // For example:
  // - Create test database schema
  // - Start test containers
  // - Initialize test data

  console.log('✅ Integration test environment ready');
});

afterAll(async () => {
  console.log('🧹 Cleaning up integration test environment...');

  // Run all cleanup functions
  for (const cleanup of cleanupFunctions) {
    await cleanup();
  }

  console.log('✅ Integration test cleanup complete');
});

export function registerCleanup(fn: () => Promise<void>) {
  cleanupFunctions.push(fn);
}
