import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Common test helper utilities
 */

/**
 * Create a mock Express request object
 */
export const createMockRequest = (overrides: Partial<Request> = {}): Request => {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    cookies: {},
    method: 'GET',
    url: '/',
    path: '/',
    get: vi.fn().mockImplementation((header) => overrides.headers?.[header.toLowerCase()]),
    header: vi.fn().mockImplementation((header) => overrides.headers?.[header.toLowerCase()]),
    ...overrides,
  } as unknown as Request;
};

/**
 * Create a mock Express response object
 */
export const createMockResponse = (): Response => {
  const res: any = {
    statusCode: 200,
    headers: {},
  };

  res.status = vi.fn().mockImplementation((code) => {
    res.statusCode = code;
    return res;
  });

  res.json = vi.fn().mockImplementation((data) => {
    res.body = data;
    return res;
  });

  res.send = vi.fn().mockImplementation((data) => {
    res.body = data;
    return res;
  });

  res.set = vi.fn().mockImplementation((header, value) => {
    res.headers[header] = value;
    return res;
  });

  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);

  return res as Response;
};

/**
 * Create a mock Express next function
 */
export const createMockNext = (): NextFunction => {
  return vi.fn() as unknown as NextFunction;
};

/**
 * Wait for async operations to complete
 */
export const waitForAsync = (ms = 0): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Create a deferred promise for testing async flows
 */
export const createDeferred = <T = any>() => {
  let resolve: (value: T) => void;
  let reject: (error: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
};

/**
 * Mock environment variables for a test
 */
export const withEnv = (env: Record<string, string>, fn: () => void | Promise<void>) => {
  const original = { ...process.env };

  try {
    Object.assign(process.env, env);
    return fn();
  } finally {
    process.env = original;
  }
};

/**
 * Create a test timeout helper
 */
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]);
};

/**
 * Test error matcher
 */
export const expectError = async (
  fn: () => Promise<any>,
  errorType?: new (...args: any[]) => Error,
  message?: string | RegExp
) => {
  let error: Error | null = null;

  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }

  expect(error).toBeTruthy();

  if (errorType) {
    expect(error).toBeInstanceOf(errorType);
  }

  if (message) {
    if (typeof message === 'string') {
      expect(error?.message).toBe(message);
    } else {
      expect(error?.message).toMatch(message);
    }
  }

  return error;
};

/**
 * Mock console for a test
 */
export const mockConsole = () => {
  const original = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
  };

  const mocks = {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };

  Object.assign(console, mocks);

  return {
    mocks,
    restore: () => Object.assign(console, original),
  };
};

/**
 * Create a test context for cleanup tracking
 */
export const createTestContext = () => {
  const cleanups: (() => void | Promise<void>)[] = [];

  return {
    addCleanup: (fn: () => void | Promise<void>) => {
      cleanups.push(fn);
    },

    cleanup: async () => {
      for (const fn of cleanups.reverse()) {
        await fn();
      }
      cleanups.length = 0;
    },
  };
};
