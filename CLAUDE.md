# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pipe MCP Server is a Model Context Protocol (MCP) server that integrates with multiple developer platforms (GitHub, Slack, Jira, Linear, Notion) to create a unified context graph. It uses PostgreSQL for main storage and graph relationships, and Redis for caching/queues.

## Development Commands

### Essential Commands

```bash
# Development
npm run dev              # Start development server with hot reload (tsx watch)
npm run build           # Compile TypeScript to dist/
npm run start           # Run production server

# Code Quality
npm run lint            # Run ESLint checks
npm run format          # Format code with Prettier
npm run typecheck       # Type check without building

# Database
npm run db:generate     # Generate Prisma client after schema changes
npm run db:migrate:dev  # Create and apply migrations
npm run db:push         # Push schema changes without migration (dev only)
npm run db:seed         # Seed database with initial data
npm run db:reset        # Reset database (drops, recreates, seeds)

# Docker Services
npm run docker:up       # Start PostgreSQL, Redis
npm run docker:down     # Stop all Docker services
npm run docker:logs     # View service logs

# Testing
npm run test            # Run tests with Vitest
npm run test:coverage   # Run tests with coverage report
```

### Running a Single Test
```bash
npm run test path/to/test.test.ts
```

## Architecture Overview

### Core Structure

The application follows a modular architecture with clear separation of concerns:

- **MCP Protocol Layer** (`src/mcp/`) - Implements the Model Context Protocol specification
- **Platform Integrations** (`src/platforms/`) - Each platform (GitHub, Slack, etc.) has its own module with client, types, and sync logic
- **Authentication** (`src/auth/`) - JWT-based auth with Passport.js strategies for OAuth
- **Real-time Communication** (`src/realtime/`) - WebSocket server for live updates
- **Background Jobs** (`src/jobs/`) - BullMQ for async processing of webhooks and syncs
- **Context Management** (`src/context/`) - Core logic for building and managing the unified context graph

### Key Design Patterns

1. **Platform Abstraction**: Each platform follows a consistent interface pattern:
   - `client.ts` - API client implementation
   - `types.ts` - TypeScript types specific to the platform
   - `sync.ts` - Logic for syncing platform data to the unified model

2. **Error Handling**: Centralized error classes in `src/utils/errors.ts` with proper error types and logging

3. **Database Access**: 
   - Prisma ORM for PostgreSQL (main data storage and graph operations)
   - Redis for caching and job queues

4. **Request Flow**:
   - Express routes → Authentication middleware → Business logic → Database operations
   - WebSocket connections for real-time updates
   - Background jobs for webhook processing and periodic syncs

### Environment Configuration

The application requires extensive configuration. Copy `.env.example` to `.env` and configure:
- Database connections (PostgreSQL, Redis)
- OAuth credentials for each platform
- Security keys (JWT secret, encryption key)
- Optional monitoring services (Sentry, Datadog)

### Database Schema

The PostgreSQL schema (managed by Prisma) centers around:
- `User` - Core user accounts
- `Team` - Organizations/workspaces
- `PlatformConnection` - OAuth tokens and platform-specific data
- `SyncStatus` - Tracks sync state for each platform connection
- `WebhookEvent` - Queued webhook events for processing
- `ContextNode` - Graph nodes representing entities from platforms
- `ContextRelationship` - Graph edges connecting related entities

PostgreSQL is used to store the context graph with relationships between entities across platforms using recursive CTEs for graph traversal.

### Testing Strategy

Tests use Vitest and should follow the pattern:
- Unit tests for utilities and pure functions
- Integration tests for platform clients (with mocked API responses)
- E2E tests for critical user flows

Currently, the test directory is empty - new features should include tests.

## Development Workflow

1. **Making Changes**:
   - Run `npm run dev` to start the development server
   - The server will auto-reload on file changes
   - Use the TypeScript path alias `@/*` for imports from `src/`

2. **Database Changes**:
   - Modify `prisma/schema.prisma`
   - Run `npm run db:generate` to update the Prisma client
   - Run `npm run db:migrate:dev` to create a migration
   - Commit both the schema changes and migration files

3. **Adding a New Platform**:
   - Create a new directory in `src/platforms/`
   - Implement the platform client, types, and sync logic
   - Add OAuth strategy in `src/auth/strategies/`
   - Update `.env.example` with required credentials

4. **Before Committing**:
   - Run `npm run lint` and fix any issues
   - Run `npm run typecheck` to ensure type safety
   - Run `npm run format` to ensure consistent formatting
   - Add tests for new functionality

## Important Notes

- The project uses Node.js 20+ features - ensure your environment is compatible
- All platform integrations are optional - the server can run with just core features
- The MCP protocol implementation in `src/mcp/` should align with the official MCP specification
- Background jobs are processed by BullMQ workers - ensure Redis is running for development