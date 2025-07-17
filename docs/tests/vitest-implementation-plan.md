# Vitest Test Suite Implementation Plan for Pipe MCP Server

## Executive Summary

This document outlines a comprehensive testing strategy for the Pipe MCP Server using Vitest. Based on an expert-level analysis of Vitest capabilities and the project's architecture, this plan provides a scalable foundation for both current functionality and future development.

## Key Findings from Vitest Analysis

### Why Vitest is Perfect for This Project

1. **Native TypeScript Support**: Zero-config TypeScript testing aligns with our TypeScript-first codebase
2. **Vite Integration**: Instant HMR and fast test execution for rapid development cycles
3. **Jest Compatibility**: Familiar API reduces learning curve while providing enhanced features
4. **Built-in Mocking**: Powerful `vi` utilities for mocking modules, timers, and WebSocket connections
5. **Concurrent Testing**: Parallel test execution for our multi-service architecture
6. **Snapshot Testing**: Ideal for MCP protocol message validation

### Advanced Vitest Features for Our Use Cases

- **`vi.hoisted()`**: Perfect for setting up mock factories before module imports
- **`expect.poll()`**: Essential for testing eventual consistency in our distributed system
- **`test.extend()`**: Create custom fixtures for database connections and auth contexts
- **Browser Mode**: Future-ready for testing any frontend components
- **Coverage with v8**: Accurate coverage reports without instrumentation overhead

## Implementation Architecture

### 1. Test Configuration Structure

```
pipe-tests/
├── vitest.config.ts              # Main configuration
├── vitest.workspace.ts           # Workspace configuration for different test types
├── test/
│   ├── setup/
│   │   ├── global-setup.ts      # One-time setup (Docker, DBs)
│   │   ├── setup-files.ts       # Per-file setup (mocks, globals)
│   │   ├── teardown.ts          # Cleanup
│   │   └── test-env.ts          # Test environment variables
│   ├── fixtures/
│   │   ├── auth.fixtures.ts     # Auth test utilities
│   │   ├── db.fixtures.ts       # Database test data
│   │   ├── mcp.fixtures.ts      # MCP protocol fixtures
│   │   └── websocket.fixtures.ts # WebSocket test helpers
│   ├── mocks/
│   │   ├── __mocks__/
│   │   │   ├── ioredis.ts       # Redis mock
│   │   │   ├── @prisma/client.ts # Prisma mock
│   │   │   └── neo4j-driver.ts  # Neo4j mock
│   │   └── handlers/
│   │       └── mcp-handlers.ts  # Mock MCP handlers
│   └── utils/
│       ├── test-factory.ts       # Test data factories
│       ├── test-helpers.ts       # Common test utilities
│       └── matchers.ts           # Custom Vitest matchers
├── src/
│   └── **/*.test.ts             # Unit tests (co-located)
├── tests/
│   ├── unit/                    # Isolated unit tests
│   ├── integration/             # Integration tests
│   └── e2e/                     # End-to-end tests
└── coverage/                     # Coverage reports
```

### 2. Core Test Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup/setup-files.ts'],
    globalSetup: './test/setup/global-setup.ts',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.ts', 'src/types/**', 'src/**/__mocks__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    // Pool configuration for optimal performance
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },

    // Timeout configurations
    testTimeout: 10000,
    hookTimeout: 30000,

    // Reporter configuration
    reporters: process.env.CI ? ['default', 'github-actions', 'junit'] : ['default', 'html'],

    // Type checking
    typecheck: {
      enabled: true,
      checker: 'tsc',
      include: ['**/*.test-d.ts'],
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
    },
  },
});
```

### 3. Workspace Configuration for Test Types

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Unit tests - fast, isolated
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
      environment: 'node',
      isolate: true,
    },
  },

  // Integration tests - with real services
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['./test/setup/integration-setup.ts'],
      testTimeout: 30000,
      sequence: {
        concurrent: false, // Run sequentially to avoid conflicts
      },
    },
  },

  // E2E tests - full system tests
  {
    extends: './vitest.config.ts',
    test: {
      name: 'e2e',
      include: ['tests/e2e/**/*.test.ts'],
      setupFiles: ['./test/setup/e2e-setup.ts'],
      testTimeout: 60000,
      maxWorkers: 1, // Single worker for e2e
    },
  },
]);
```

## Testing Strategy by Component

### 1. Authentication & Security Testing

```typescript
// Example: Auth Service Unit Test Structure
describe('AuthService', () => {
  // Use test.extend for shared fixtures
  const authTest = test.extend<{
    authService: AuthService;
    mockPrisma: DeepMockProxy<PrismaClient>;
    mockRedis: Redis;
  }>({
    mockPrisma: async ({}, use) => {
      const mock = mockDeep<PrismaClient>();
      await use(mock);
    },
    mockRedis: async ({}, use) => {
      const mock = new Redis(); // from ioredis-mock
      await use(mock);
      await mock.flushall();
    },
    authService: async ({ mockPrisma, mockRedis }, use) => {
      const service = new AuthService(mockPrisma, mockRedis);
      await use(service);
    },
  });

  describe('User Registration', () => {
    authTest('should create user with hashed password', async ({ authService, mockPrisma }) => {
      // Test implementation
    });

    authTest('should handle duplicate emails', async ({ authService, mockPrisma }) => {
      // Test implementation
    });
  });

  describe('JWT Token Management', () => {
    authTest('should generate valid access and refresh tokens', async ({ authService }) => {
      // Test implementation
    });

    authTest.each([
      { scenario: 'expired token', token: expiredToken },
      { scenario: 'invalid signature', token: invalidToken },
      { scenario: 'malformed token', token: 'not-a-jwt' },
    ])('should reject $scenario', async ({ authService, token }) => {
      // Test implementation
    });
  });
});
```

### 2. MCP Protocol Testing

```typescript
// MCP Protocol Handler Testing Strategy
describe('MCP Protocol Handler', () => {
  // Snapshot testing for protocol messages
  test('should handle initialize request', async () => {
    const handler = new MCPProtocolHandler();
    const response = await handler.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { capabilities: {} },
    });

    expect(response).toMatchSnapshot('initialize-response');
  });

  // Mock streaming for large responses
  test('should stream large tool results', async () => {
    const handler = new MCPProtocolHandler();
    const stream = handler.handleStreamingMessage({
      method: 'tools/call',
      params: { name: 'large-data-tool' },
    });

    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(greaterThan(1));
    expect(chunks[0]).toMatchObject({ partial: true });
  });
});
```

### 3. WebSocket Real-time Testing

```typescript
// WebSocket Testing with vi.useFakeTimers
describe('WebSocket Server', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('should handle heartbeat mechanism', async () => {
    const { server, client } = await createTestWebSocketPair();

    const pongSpy = vi.fn();
    client.on('pong', pongSpy);

    // Advance time to trigger heartbeat
    await vi.advanceTimersByTimeAsync(30000);

    expect(pongSpy).toHaveBeenCalled();
  });

  test('should broadcast to team members', async () => {
    const { server } = await createTestWebSocketServer();
    const clients = await Promise.all([
      connectClient({ teamId: 'team-1', userId: 'user-1' }),
      connectClient({ teamId: 'team-1', userId: 'user-2' }),
      connectClient({ teamId: 'team-2', userId: 'user-3' }),
    ]);

    await server.broadcastToTeam('team-1', { type: 'update', data: {} });

    expect(clients[0].received).toHaveLength(1);
    expect(clients[1].received).toHaveLength(1);
    expect(clients[2].received).toHaveLength(0);
  });
});
```

### 4. Integration Testing Strategy

```typescript
// Integration test with real services
describe('API Integration', () => {
  let app: Express;
  let prisma: PrismaClient;
  let redis: Redis;

  beforeAll(async () => {
    // Use test containers or Docker services
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    redis = new Redis(TEST_REDIS_URL);
    app = await createApp({ prisma, redis });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  test('full authentication flow', async () => {
    // Register
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'secure123' });

    expect(registerRes.status).toBe(201);

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'secure123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');

    // Use token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe('test@example.com');
  });
});
```

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. Set up Vitest configuration files
2. Create test utilities and fixtures
3. Implement custom matchers
4. Set up mock modules
5. Create first unit tests for utilities

### Phase 2: Core Components (Week 2)

1. Auth service unit tests
2. MCP protocol handler tests
3. WebSocket server tests
4. Database model tests
5. Achieve 60% code coverage

### Phase 3: Integration Layer (Week 3)

1. API route integration tests
2. WebSocket integration tests
3. Database integration tests
4. Redis pub/sub tests
5. Achieve 75% code coverage

### Phase 4: End-to-End & Polish (Week 4)

1. E2E workflow tests
2. Performance benchmarks
3. Error scenario testing
4. Documentation
5. Achieve 80%+ code coverage

## Scalability Considerations

### 1. Test Data Management

- Use factories for consistent test data
- Implement database seeding for integration tests
- Create snapshot fixtures for protocol messages

### 2. Parallel Execution

- Isolate database schemas per test worker
- Use unique Redis namespaces
- Implement port allocation for WebSocket tests

### 3. CI/CD Integration

```yaml
# Example GitHub Actions configuration
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
    redis:
      image: redis:7
    neo4j:
      image: neo4j:5
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
    - run: npm ci
    - run: npm run test:coverage
    - uses: codecov/codecov-action@v3
```

### 4. Performance Monitoring

- Track test execution times
- Monitor flaky tests
- Implement test result trending

## Custom Testing Utilities

### 1. Authentication Test Helpers

```typescript
// test/fixtures/auth.fixtures.ts
export const createAuthContext = () => ({
  user: createUser(),
  token: generateTestToken(),
  team: createTeam(),
});

export const authenticatedRequest = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});
```

### 2. MCP Protocol Test Builder

```typescript
// test/fixtures/mcp.fixtures.ts
export class MCPMessageBuilder {
  static request(method: string, params?: any) {
    return {
      jsonrpc: '2.0',
      id: generateId(),
      method,
      params,
    };
  }

  static response(id: number, result: any) {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }
}
```

### 3. WebSocket Test Client

```typescript
// test/fixtures/websocket.fixtures.ts
export class TestWebSocketClient {
  messages: any[] = [];

  constructor(private ws: WebSocket) {
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()));
    });
  }

  async waitForMessage(predicate: (msg: any) => boolean) {
    return vi.waitFor(() => {
      const msg = this.messages.find(predicate);
      if (!msg) throw new Error('Message not found');
      return msg;
    });
  }
}
```

## Best Practices & Guidelines

### 1. Test Organization

- Co-locate unit tests with source files
- Group integration tests by feature
- Name tests descriptively: `should [expected behavior] when [condition]`

### 2. Mocking Strategy

- Mock external dependencies (databases, APIs)
- Use real implementations for internal modules when possible
- Prefer `vi.spyOn` for partial mocking

### 3. Assertion Patterns

- Use specific matchers (`toHaveProperty` vs `toBeDefined`)
- Include descriptive error messages
- Test both success and failure paths

### 4. Performance

- Use `test.concurrent` for independent tests
- Implement proper cleanup in `afterEach`
- Avoid shared state between tests

### 5. Debugging

- Use `test.only` for focused debugging
- Enable `--reporter=verbose` for detailed output
- Utilize `--ui` flag for interactive debugging

## Conclusion

This comprehensive Vitest implementation plan provides a robust foundation for testing the Pipe MCP Server. By leveraging Vitest's advanced features and following the phased approach, the project will achieve high test coverage while maintaining fast execution times and excellent developer experience.

The modular structure ensures easy scaling as new features are added, while the emphasis on different test types (unit, integration, E2E) provides confidence at every level of the application stack.

---

_Document Version: 1.0_  
_Author: Claude Code AI Assistant_
