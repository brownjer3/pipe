# API Reference

Base URL: `https://pipe-production.up.railway.app`

## REST API Endpoints

### Authentication

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

#### POST /auth/login
Authenticate and receive tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh-token"
}
```

### OAuth Platform Connections

#### GET /api/oauth/connect/:platform
Initiate OAuth flow for a platform.

**Parameters:**
- `platform`: `github` | `slack` | `jira` | `linear` | `notion`

**Response:**
```json
{
  "authUrl": "https://platform.com/oauth/authorize?..."
}
```

#### GET /api/oauth/callback/:platform
OAuth callback endpoint (handled by platform).

#### POST /api/oauth/disconnect/:platform
Disconnect a platform integration.

#### GET /api/oauth/connections
List active platform connections.

**Response:**
```json
{
  "connections": [
    {
      "platform": "github",
      "createdAt": "2024-01-01T00:00:00Z",
      "lastSyncAt": "2024-01-01T01:00:00Z",
      "metadata": {}
    }
  ]
}
```

#### POST /api/oauth/sync/:platform
Trigger manual sync for a platform.

**Request Body:**
```json
{
  "full": false
}
```

### Webhooks

All webhook endpoints follow the pattern:
- **POST /api/webhooks/:platform**

Supported platforms:
- `/api/webhooks/github`
- `/api/webhooks/slack`
- `/api/webhooks/jira`
- `/api/webhooks/linear`
- `/api/webhooks/notion`

#### GET /api/webhooks/status
Get webhook processing status.

**Response:**
```json
{
  "recent": [...],
  "stats": [
    {
      "platform": "github",
      "status": "processed",
      "count": 42
    }
  ]
}
```

### Health & Status

#### GET /health
Basic health check.

#### GET /health/detailed
Detailed health status of all services.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "neo4j": "healthy"
  }
}
```

## MCP Tools

The MCP server exposes the following tools via the Model Context Protocol:

### search_context
Search across all connected platforms.

**Input Schema:**
```json
{
  "query": "string",
  "platforms": ["github", "slack"],
  "types": ["issue", "message"],
  "limit": 20,
  "since": "2024-01-01T00:00:00Z"
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "github:issue:123",
      "type": "issue",
      "title": "Bug: Login fails",
      "platform": "github",
      "url": "https://github.com/...",
      "snippet": "...",
      "score": 0.95
    }
  ],
  "total": 42
}
```

### get_team_context
Retrieve aggregated team collaboration context.

**Input Schema:**
```json
{
  "teamId": "team-uuid",
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  }
}
```

**Response:**
```json
{
  "summary": {
    "totalItems": 150,
    "platforms": {
      "github": 100,
      "slack": 50
    },
    "types": {
      "issue": 40,
      "pull_request": 60,
      "message": 50
    }
  },
  "topContributors": [...],
  "recentActivity": [...]
}
```

### synthesize_context
AI-powered context synthesis (placeholder for Phase 3).

**Input Schema:**
```json
{
  "nodeIds": ["node1", "node2"],
  "prompt": "Summarize the discussion about authentication"
}
```

### sync_platform
Trigger platform synchronization.

**Input Schema:**
```json
{
  "platform": "github",
  "full": false
}
```

### list_platforms
List available platform integrations.

**Response:**
```json
{
  "platforms": [
    {
      "name": "github",
      "connected": true,
      "lastSync": "2024-01-01T00:00:00Z"
    },
    {
      "name": "slack",
      "connected": false
    }
  ]
}
```

### get_sync_status
Check synchronization job status.

**Input Schema:**
```json
{
  "jobId": "job-uuid"
}
```

### create_context
Manually create a context node.

**Input Schema:**
```json
{
  "type": "note",
  "title": "Architecture Decision",
  "content": "We decided to use Neo4j for...",
  "metadata": {
    "tags": ["architecture", "database"]
  }
}
```

## WebSocket Events

Connect to WebSocket endpoint: `wss://pipe-production.up.railway.app/ws`

### Client Events

#### authenticate
```json
{
  "type": "authenticate",
  "token": "jwt-token"
}
```

#### subscribe
```json
{
  "type": "subscribe",
  "channels": ["team:123", "platform:github"]
}
```

### Server Events

#### connected
```json
{
  "type": "connected",
  "sessionId": "session-uuid"
}
```

#### context_update
```json
{
  "type": "context_update",
  "platform": "github",
  "action": "created",
  "data": {...}
}
```

#### sync_progress
```json
{
  "type": "sync_progress",
  "platform": "github",
  "progress": 0.75,
  "status": "syncing"
}
```

## Error Responses

All endpoints use consistent error formatting:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common HTTP status codes:
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error