import { beforeAll, afterAll } from 'vitest';
import type { Express } from 'express';

/**
 * Setup for E2E tests
 * Starts the full application stack for end-to-end testing
 */

let app: Express | null = null;
let server: any = null;

beforeAll(async () => {
  console.log('🚀 Starting E2E test environment...');

  // E2E tests run against the full application
  // Import and start the app here

  // Example:
  // const { createApp } = await import('@/app')
  // app = await createApp()
  // server = app.listen(0) // Random port
  // process.env.TEST_SERVER_URL = `http://localhost:${server.address().port}`

  console.log('✅ E2E test environment ready');
});

afterAll(async () => {
  console.log('🛑 Stopping E2E test environment...');

  // Close server
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  // Clean up any other resources

  console.log('✅ E2E test cleanup complete');
});

export function getTestServerUrl(): string {
  return process.env.TEST_SERVER_URL || 'http://localhost:3001';
}
