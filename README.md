# Pipe MCP Server

Developer Collaboration Context Bridge - An MCP server that unifies developer context across platforms.

🚀 **[Live Demo](https://pipe-production.up.railway.app/)** | [Documentation](./docs) | [API Reference](./docs/api-reference.md)

## Overview

Pipe is a Model Context Protocol (MCP) server that bridges context from multiple developer platforms (GitHub, Slack, Jira, Linear, Notion) into a unified graph, enabling AI assistants to access comprehensive team collaboration context.

### 🌟 Features

- **Unified Context Graph**: Connects data from GitHub, Slack, Jira, Linear, and Notion
- **Real-time Sync**: WebSocket support for live updates
- **MCP Protocol**: Compatible with AI assistants supporting Model Context Protocol
- **OAuth Integration**: Secure authentication with major platforms
- **Production Ready**: Deployed on Railway with PostgreSQL and Redis

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express + Socket.io
- **Databases**: PostgreSQL (with graph capabilities), Redis
- **Queue**: BullMQ
- **Authentication**: Passport.js with JWT

## 🚀 Deployment

Pipe is deployed on Railway and available at: **https://pipe-production.up.railway.app/**

### Production Infrastructure
- **Platform**: Railway
- **Databases**: PostgreSQL & Redis (Railway managed)
- **Graph Storage**: PostgreSQL with recursive CTEs
- **Monitoring**: Built-in health checks and logging

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL and Redis (or use Docker)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/brownjer3/pipe.git
cd pipe
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Start infrastructure services:
```bash
docker-compose up -d
```

5. Run database migrations:
```bash
npm run db:migrate
```

6. Start development server:
```bash
npm run dev
```

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run test` - Run comprehensive Vitest test suite
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:ui` - Open interactive test UI
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Type check without building

## Architecture

The server implements the MCP protocol with WebSocket support for real-time collaboration. Key components:

- **MCP Protocol Handler**: Processes JSON-RPC messages
- **WebSocket Server**: Real-time connections and broadcasts
- **Context Engine**: Manages context graph and search
- **Platform Manager**: Handles platform integrations
- **Job Processor**: Background synchronization tasks

## API Endpoints

### Health Checks
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed service status
- `GET /health/ready` - Kubernetes readiness probe

### Authentication
- `GET /auth/github` - GitHub OAuth flow
- `GET /auth/slack` - Slack OAuth flow
- `POST /auth/login` - Email/password login
- `POST /auth/register` - User registration
- `POST /auth/refresh` - Refresh JWT token

### MCP Protocol
- WebSocket `/ws` - MCP protocol over WebSocket

## Deployment Guide

For detailed deployment instructions, see [Railway Deployment Guide](./docs/railway-deployment-guide.md).

### Quick Deploy to Railway

1. Fork this repository
2. Connect to Railway
3. Add PostgreSQL and Redis
4. Set environment variables:
   ```bash
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   JWT_SECRET=<generate with: openssl rand -hex 32>
   REFRESH_SECRET=<generate with: openssl rand -hex 32>
   ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
   ```
5. Deploy!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT