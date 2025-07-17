# Architecture Overview

## System Architecture

Pipe MCP Server is built as a modular, scalable system that bridges multiple developer platforms into a unified context graph.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   MCP Clients   │     │  Web Clients    │     │   Webhooks      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Express Server                           │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ MCP Handler │  │ REST Routes  │  │ WebSocket Server   │    │
│  └─────────────┘  └──────────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Service Layer                             │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │  Platform  │  │   Context    │  │     Session        │     │
│  │  Manager   │  │   Engine     │  │     Manager        │     │
│  └────────────┘  └──────────────┘  └────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
         │                       │                         │
         ▼                       ▼                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   PostgreSQL    │     │     Neo4j       │     │     Redis       │
│   (Core Data)   │     │ (Context Graph) │     │   (Sessions)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Core Components

### 1. MCP Protocol Handler
- **Location**: `src/mcp/protocol-handler.ts`
- **Purpose**: Implements the Model Context Protocol specification
- **Features**:
  - JSON-RPC message processing
  - Tool registration and execution
  - Session management
  - Error handling

### 2. Platform Manager
- **Location**: `src/platforms/platform-manager.ts`
- **Purpose**: Orchestrates all platform integrations
- **Features**:
  - Dynamic adapter registration
  - OAuth credential management
  - Sync orchestration
  - Webhook routing

### 3. Context Engine
- **Location**: `src/context/context-engine.ts`
- **Purpose**: Manages the collaborative context graph
- **Features**:
  - Neo4j graph operations
  - Context search and retrieval
  - Team context aggregation
  - Caching layer

### 4. Session Manager
- **Location**: `src/sessions/session-manager.ts`
- **Purpose**: Handles MCP session lifecycle
- **Features**:
  - Session creation and persistence
  - Redis-backed storage
  - Connection tracking
  - Automatic cleanup

### 5. Queue Manager
- **Location**: `src/jobs/queue-manager.ts`
- **Purpose**: Background job processing
- **Features**:
  - BullMQ integration
  - Platform sync jobs
  - Webhook processing
  - Progress tracking

## Platform Adapters

Platform adapters implement a common interface for consistent integration:

```typescript
interface PlatformAdapter {
  name: PlatformType;
  getOAuthUrl(state: string, redirectUri: string): string;
  exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials>;
  sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult>;
  verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean>;
  parseWebhook(body: any): Promise<WebhookEvent[]>;
}
```

### Implemented Adapters

1. **GitHub** (`src/platforms/adapters/github.ts`)
   - Repositories, Issues, Pull Requests, Comments
   - Webhook events for real-time updates

2. **Slack** (`src/platforms/adapters/slack.ts`)
   - Channels, Messages, Threads, Users
   - Event API for real-time messaging

### Planned Adapters

- Jira - Issue tracking and project management
- Linear - Issue tracking with team collaboration
- Notion - Documentation and knowledge base

## Data Models

### PostgreSQL (Primary Database)
- Users and Teams
- Platform Connections
- Sessions
- Audit Logs
- Webhook Events

### Neo4j (Graph Database)
- Context Nodes (issues, PRs, messages, etc.)
- Relationships between nodes
- Team collaboration patterns

### Redis (Cache & Sessions)
- MCP session data
- Search result caching
- OAuth state management
- Job queue metadata

## Security Architecture

1. **Authentication**
   - JWT tokens for API access
   - Refresh token rotation
   - Passport.js strategies

2. **Encryption**
   - AES-256-GCM for credentials
   - Environment-based keys
   - Secure token storage

3. **Platform Security**
   - OAuth 2.0 flows
   - Webhook signature verification
   - Rate limiting

## Scalability Considerations

1. **Horizontal Scaling**
   - Stateless API servers
   - Redis for shared state
   - Queue-based job processing

2. **Performance Optimization**
   - Connection pooling
   - Result caching
   - Batch operations
   - Stream processing

3. **Monitoring**
   - Structured logging with Winston
   - Health check endpoints
   - Queue metrics