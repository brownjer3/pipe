# Development Guide

## Getting Started

### Prerequisites

- Node.js 20+ (use nvm: `nvm use 20`)
- Docker and Docker Compose
- Git
- A code editor (VS Code recommended)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/brownjer3/pipe.git
   cd pipe
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file with your configuration**
   ```env
   # Core Configuration
   NODE_ENV=development
   PORT=3000
   WS_PORT=3001
   
   # Database URLs
   DATABASE_URL=postgresql://pipe_user:pipe_password@localhost:5432/pipe_db
   NEO4J_URL=bolt://localhost:7687
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=pipe_password
   REDIS_URL=redis://localhost:6379
   
   # Security Keys (generate secure values)
   JWT_SECRET=your-jwt-secret-here
   REFRESH_SECRET=your-refresh-secret-here
   ENCRYPTION_KEY=64-character-hex-string
   
   # Platform Configuration
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret
   GITHUB_WEBHOOK_SECRET=your-webhook-secret
   
   SLACK_CLIENT_ID=your-slack-client-id
   SLACK_CLIENT_SECRET=your-slack-client-secret
   SLACK_SIGNING_SECRET=your-signing-secret
   ```

5. **Start infrastructure services**
   ```bash
   docker-compose up -d
   ```

6. **Run database migrations**
   ```bash
   npm run db:migrate:dev
   ```

7. **Generate Prisma client**
   ```bash
   npm run db:generate
   ```

8. **Start development server**
   ```bash
   npm run dev
   ```

## Development Workflow

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run test` - Run test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type check without building

### Database Management

- `npm run db:migrate:dev` - Run migrations in development
- `npm run db:migrate:deploy` - Run migrations in production
- `npm run db:push` - Push schema changes without migration
- `npm run db:seed` - Seed database with sample data
- `npm run db:reset` - Reset database (WARNING: deletes all data)

### Docker Commands

- `npm run docker:up` - Start all services
- `npm run docker:down` - Stop all services
- `npm run docker:logs` - View service logs

## Project Structure

```
pipe/
├── src/                    # Source code
│   ├── auth/              # Authentication logic
│   ├── context/           # Context engine
│   ├── jobs/              # Background job processing
│   ├── mcp/               # MCP protocol implementation
│   ├── platforms/         # Platform adapters
│   │   └── adapters/      # Individual platform adapters
│   ├── realtime/          # WebSocket server
│   ├── routes/            # REST API routes
│   ├── sessions/          # Session management
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   ├── app.ts            # Express app setup
│   └── index.ts          # Entry point
├── prisma/                # Database schema and migrations
├── docs/                  # Documentation
├── scripts/               # Utility scripts
├── tests/                 # Test files
├── docker-compose.yml     # Docker services configuration
├── .env.example          # Environment variables template
└── package.json          # Project dependencies
```

## Code Style Guide

### TypeScript

- Use TypeScript strict mode
- Define interfaces for all data structures
- Prefer functional programming patterns
- Avoid `any` type - use `unknown` if necessary

### Naming Conventions

- **Files**: kebab-case (e.g., `platform-manager.ts`)
- **Classes**: PascalCase (e.g., `PlatformManager`)
- **Interfaces**: PascalCase with "I" prefix optional
- **Functions**: camelCase (e.g., `syncPlatform`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)

### Code Organization

- Keep files focused and under 300 lines
- Extract reusable logic to utility functions
- Use dependency injection for testability
- Group related functionality in directories

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test src/auth/auth-service.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('AuthService', () => {
  let authService: AuthService;
  
  beforeEach(() => {
    authService = new AuthService(/* dependencies */);
  });
  
  it('should authenticate valid credentials', async () => {
    const result = await authService.authenticate('user@example.com', 'password');
    expect(result).toBeDefined();
    expect(result.user.email).toBe('user@example.com');
  });
});
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

### Logging

Use the Winston logger for debugging:

```typescript
import { logger } from './utils/logger';

logger.info('Server started', { port: 3000 });
logger.error('Failed to connect', { error: err.message });
logger.debug('Processing request', { userId, platform });
```

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port
   lsof -i :3000
   # Kill process
   kill -9 <PID>
   ```

2. **Database connection fails**
   - Check Docker containers are running
   - Verify DATABASE_URL in .env
   - Check firewall settings

3. **TypeScript errors**
   ```bash
   # Check for errors
   npm run typecheck
   # Regenerate Prisma types
   npm run db:generate
   ```

## Contributing

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. **Run tests and linting**
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

4. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Format

Follow conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Build/tooling changes