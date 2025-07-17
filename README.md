# Pipe MCP Server

Developer Collaboration Context Bridge - An MCP server that unifies developer context across platforms.

## Overview

Pipe is a Model Context Protocol (MCP) server that bridges context from multiple developer platforms (GitHub, Slack, Jira, Linear, Notion) into a unified graph, enabling AI assistants to access comprehensive team collaboration context.

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express + Socket.io
- **Databases**: PostgreSQL, Redis, Neo4j
- **Queue**: BullMQ
- **Authentication**: Passport.js with JWT

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- PostgreSQL, Redis, and Neo4j (or use Docker)

### Installation

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
- `npm run test` - Run tests
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

## License

MIT