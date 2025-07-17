import { vi } from 'vitest';
import { createMockPrismaClient } from '@test/fixtures/db.fixtures';

/**
 * Mock for @prisma/client module
 * This mock is automatically used when '@prisma/client' is imported in tests
 */

export const PrismaClient = vi.fn().mockImplementation(() => {
  return createMockPrismaClient();
});

// Export common Prisma types/enums that might be used in tests
export const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    constructor(
      message: string,
      public code: string,
      public meta?: any
    ) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
    }
  },
  PrismaClientUnknownRequestError: class PrismaClientUnknownRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PrismaClientUnknownRequestError';
    }
  },
  PrismaClientValidationError: class PrismaClientValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PrismaClientValidationError';
    }
  },
};

export default { PrismaClient, Prisma };
