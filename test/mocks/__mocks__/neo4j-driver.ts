import { vi } from 'vitest';
import { createMockNeo4jDriver } from '@test/fixtures/db.fixtures';

/**
 * Mock for neo4j-driver module
 * This mock is automatically used when 'neo4j-driver' is imported in tests
 */

const neo4j = {
  driver: vi.fn().mockImplementation((uri, auth, config) => {
    return createMockNeo4jDriver();
  }),

  auth: {
    basic: vi.fn().mockImplementation((username, password) => ({
      scheme: 'basic',
      principal: username,
      credentials: password,
    })),
  },

  types: {
    Node: vi.fn(),
    Relationship: vi.fn(),
    Path: vi.fn(),
    PathSegment: vi.fn(),
    Point: vi.fn(),
    Duration: vi.fn(),
    LocalTime: vi.fn(),
    Time: vi.fn(),
    Date: vi.fn(),
    LocalDateTime: vi.fn(),
    DateTime: vi.fn(),
  },

  session: {
    READ: 'READ',
    WRITE: 'WRITE',
  },
};

export default neo4j;
export const { driver, auth, types, session } = neo4j;
