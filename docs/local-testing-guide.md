# Pipe MCP Server - Local Testing Guide

This guide will help you test the Phase 1 implementation to ensure all core components are working correctly.

## Prerequisites

Before testing, ensure you have:

- Node.js 20+ installed
- Docker and Docker Compose installed
- npm or pnpm package manager
- A terminal/command line interface

## 1. Initial Setup

### 1.1 Install Dependencies

```bash
npm install
```

### 1.2 Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your preferred values:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pipe_dev"

# Redis
REDIS_URL="redis://localhost:6379"

# Neo4j
NEO4J_URI="bolt://localhost:7687"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="password"

# Security
JWT_SECRET="your-secret-key-here"
JWT_REFRESH_SECRET="your-refresh-secret-here"
ENCRYPTION_KEY="your-32-character-encryption-key"

# Server
PORT=3000
NODE_ENV=development
```

### 1.3 Start Docker Services

```bash
npm run docker:up
```

This starts PostgreSQL, Redis, and Neo4j. Verify they're running:

```bash
docker ps
```

You should see three containers running.

## 2. Database Setup

### 2.1 Generate Prisma Client

```bash
npm run db:generate
```

### 2.2 Run Database Migrations

```bash
npm run db:migrate:dev
```

### 2.3 Seed Test Data (Optional)

```bash
npm run db:seed
```

## 3. Testing Core Components

### 3.1 Start the Development Server

```bash
npm run dev
```

You should see output like:

```
🚀 Pipe MCP Server listening on port 3000
📡 WebSocket server initialized
🔐 Auth strategies registered
💾 Database connections established
```

### 3.2 Test Health Endpoints

#### Basic Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-17T12:00:00.000Z"
}
```

#### Detailed Health Check

```bash
curl http://localhost:3000/health/detailed
```

Expected response should show all services as healthy:

```json
{
  "status": "ok",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "neo4j": "healthy"
  },
  "timestamp": "2025-01-17T12:00:00.000Z"
}
```

### 3.3 Test Authentication

#### Register a New User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "name": "Test User"
  }'
```

Expected response:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "name": "Test User"
  }
}
```

#### Login with Credentials

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

#### Test Protected Endpoint

Use the access token from registration/login:

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3.4 Test WebSocket Connection

Create a test WebSocket client file:

```bash
cat > test-websocket.js << 'EOF'
const WebSocket = require('ws');

const token = process.argv[2];
if (!token) {
  console.error('Usage: node test-websocket.js <access_token>');
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:3000?token=${token}`);

ws.on('open', () => {
  console.log('✅ WebSocket connected');

  // Send MCP initialize request
  const initRequest = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '1.0',
      capabilities: {}
    },
    id: 1
  };

  console.log('📤 Sending initialize request');
  ws.send(JSON.stringify(initRequest));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📥 Received:', JSON.stringify(message, null, 2));

  // If we received initialize response, list tools
  if (message.id === 1 && message.result) {
    const listToolsRequest = {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 2
    };

    console.log('📤 Sending tools/list request');
    ws.send(JSON.stringify(listToolsRequest));
  }
});

ws.on('close', (code, reason) => {
  console.log(`❌ WebSocket closed: ${code} - ${reason}`);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

// Send heartbeat every 30 seconds
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
}, 30000);
EOF
```

Run the WebSocket test:

```bash
node test-websocket.js YOUR_ACCESS_TOKEN
```

Expected output:

```
✅ WebSocket connected
📤 Sending initialize request
📥 Received: {
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "1.0",
    "capabilities": {},
    "serverInfo": {
      "name": "pipe-mcp-server",
      "version": "1.0.0"
    }
  },
  "id": 1
}
📤 Sending tools/list request
📥 Received: {
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "search_context",
        "description": "Search across all connected platform data"
      },
      {
        "name": "get_team_context",
        "description": "Get comprehensive team context"
      }
    ]
  },
  "id": 2
}
```

### 3.5 Test Database Operations

Connect to PostgreSQL to verify schema:

```bash
docker exec -it pipe_postgres psql -U postgres -d pipe_dev
```

Check tables:

```sql
\dt
```

You should see:

- User
- Team
- TeamMember
- Session
- RefreshToken
- PlatformConnection
- SyncStatus
- WebhookEvent
- AuditLog

Exit psql:

```sql
\q
```

### 3.6 Test Redis Connection

```bash
docker exec -it pipe_redis redis-cli
```

Test basic operations:

```
PING
# Should return: PONG

INFO server
# Should show Redis server info
```

Exit Redis CLI:

```
exit
```

### 3.7 Test Neo4j Connection

Open Neo4j Browser at http://localhost:7474

Login with:

- Username: neo4j
- Password: password

Run a test query:

```cypher
CREATE (n:TestNode {name: 'Test'}) RETURN n
```

## 4. Automated Test Suite

### 4.1 Run Linting

```bash
npm run lint
```

All files should pass without errors.

### 4.2 Run Type Checking

```bash
npm run typecheck
```

Should complete without type errors.

### 4.3 Run Tests (when implemented)

```bash
npm test
```

## 5. Common Issues and Troubleshooting

### Issue: Docker services not starting

```bash
# Stop all services
npm run docker:down

# Remove volumes and restart
docker-compose down -v
npm run docker:up
```

### Issue: Database connection errors

1. Check DATABASE_URL in .env
2. Ensure PostgreSQL container is running
3. Try connecting directly:

```bash
docker exec -it pipe_postgres psql -U postgres
```

### Issue: WebSocket connection fails

1. Check that the server is running
2. Verify the access token is valid
3. Check browser console for CORS issues

### Issue: Port already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

## 6. Verification Checklist

- [ ] All Docker services start successfully
- [ ] Database migrations run without errors
- [ ] Health endpoints return positive status
- [ ] User registration and login work
- [ ] Access tokens properly authenticate requests
- [ ] WebSocket connections establish with valid tokens
- [ ] MCP protocol initialization succeeds
- [ ] Database contains expected tables
- [ ] Redis is accessible and responsive
- [ ] Neo4j is accessible via browser
- [ ] No TypeScript or linting errors

## 7. Next Steps

Once all Phase 1 components are verified:

1. Review application logs for any warnings
2. Test edge cases (invalid tokens, malformed requests)
3. Monitor resource usage (CPU, memory)
4. Prepare for Phase 2 platform integrations

## Support

If you encounter issues not covered in this guide:

1. Check application logs: `npm run dev`
2. Review Docker logs: `npm run docker:logs`
3. Verify all environment variables are set correctly
4. Ensure all dependencies are installed: `npm install`

---

_Last updated: July 2025_
