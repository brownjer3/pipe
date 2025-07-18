# Railway Deployment Guide for Pipe MCP Server

This guide provides a step-by-step process to deploy the Pipe MCP server on Railway, including database setup, environment configuration, and production best practices.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (15 minutes)](#quick-start-15-minutes)
3. [Detailed Setup Steps](#detailed-setup-steps)
4. [Database Configuration](#database-configuration)
5. [Environment Variables](#environment-variables)
6. [Domain and SSL Setup](#domain-and-ssl-setup)
7. [Monitoring and Logs](#monitoring-and-logs)
8. [Cost Optimization](#cost-optimization)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

## Prerequisites

Before starting, ensure you have:

- [ ] GitHub account with your Pipe repository
- [ ] Railway account (sign up at [railway.app](https://railway.app))
- [ ] Node.js 20+ installed locally for development
- [ ] Railway CLI installed (optional but recommended)

### Install Railway CLI (Optional)

```bash
# macOS/Linux
brew install railway

# Windows
scoop install railway

# npm (cross-platform)
npm i -g @railway/cli
```

## Quick Start (15 minutes)

### 1. Fork or Clone the Repository

```bash
# Clone the repository
git clone https://github.com/brownjer3/pipe.git
cd pipe

# Or fork it to your GitHub account first
```

### 2. Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Search for and select your `pipe` repository
5. Click **"Add variables"** (we'll configure these next)

### 3. Quick Database Setup

In your Railway project:

1. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Click **"New"** → **"Database"** → **"Add Redis"**

### 4. Essential Environment Variables

Add these variables in the Railway dashboard:

```bash
# Required secrets (generate secure values)
JWT_SECRET=your-secure-jwt-secret-here
REFRESH_SECRET=your-secure-refresh-secret-here
ENCRYPTION_KEY=your-32-character-encryption-key

# Database URLs (auto-filled by Railway)
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Neo4j (external service - sign up at neo4j.com/aura)
NEO4J_URL=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password

# OAuth (optional for now, add your own later)
GITHUB_CLIENT_ID=your-github-oauth-app-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# Basic configuration
NODE_ENV=production
PORT=3000
```

### 5. Deploy

Click **"Deploy"** in Railway dashboard. Your app will be live in ~3-5 minutes!

## Detailed Setup Steps

### Step 1: Project Structure Preparation

Before deploying, ensure your project has the necessary files:

```bash
# Create a Dockerfile if you don't have one
cat > Dockerfile << 'EOF'
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

USER nodejs

EXPOSE 3000

CMD ["npm", "start"]
EOF
```

### Step 2: Configure Railway Project

#### Using Railway CLI

```bash
# Login to Railway
railway login

# Initialize new project (or link existing)
railway init

# Link to your GitHub repository
railway link

# Create production environment
railway environment production
```

#### Using Railway Dashboard

1. Navigate to project settings
2. Configure deployment triggers:
   - **Auto Deploy**: Enable for `main` branch
   - **Check Suites**: Wait for CI to pass
   - **Deployment Protection**: Require approval for production

### Step 3: Configure Build Settings

Add a `railway.json` file to your repository:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

Or use Nixpacks (Railway's default builder):

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm ci && npm run build && npx prisma generate"
  },
  "deploy": {
    "startCommand": "npm run db:migrate:deploy && npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

## Database Configuration

### PostgreSQL Setup

Railway automatically provisions PostgreSQL with these features:
- Version 15+
- Automatic backups
- SSL enabled
- Connection pooling

**Connection Variables (auto-provided):**
```bash
PGHOST=${{Postgres.PGHOST}}
PGPORT=${{Postgres.PGPORT}}
PGDATABASE=${{Postgres.PGDATABASE}}
PGUSER=${{Postgres.PGUSER}}
PGPASSWORD=${{Postgres.PGPASSWORD}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

### Redis Setup

Railway Redis includes:
- Version 7+
- Persistence enabled
- Automatic failover
- SSL/TLS encryption

**Connection Variables (auto-provided):**
```bash
REDIS_URL=${{Redis.REDIS_URL}}
REDISHOST=${{Redis.REDISHOST}}
REDISPORT=${{Redis.REDISPORT}}
REDISUSER=${{Redis.REDISUSER}}
REDISPASSWORD=${{Redis.REDISPASSWORD}}
```

### Neo4j Setup (External)

Since Railway doesn't provide Neo4j, use Neo4j Aura:

1. Sign up at [neo4j.com/aura](https://neo4j.com/aura)
2. Create a free instance
3. Copy connection details:
   ```bash
   NEO4J_URL=neo4j+s://your-instance.databases.neo4j.io
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your-generated-password
   ```

### Database Migrations

Configure automatic migrations on deploy:

```json
// railway.json
{
  "deploy": {
    "startCommand": "npm run db:migrate:deploy && npm start"
  }
}
```

Or run manually via CLI:

```bash
railway run npm run db:migrate:deploy
```

## Environment Variables

### Required Variables

```bash
# Security (generate secure values)
JWT_SECRET=$(openssl rand -hex 32)
REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)

# Database connections
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Neo4j (external)
NEO4J_URL=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-neo4j-password

# Application
NODE_ENV=production
PORT=3000
```

### OAuth Configuration (GitHub)

1. Create GitHub OAuth App:
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Click "New OAuth App"
   - Application name: `Pipe MCP Server`
   - Homepage URL: `https://pipe-production.up.railway.app`
   - Callback URL: `https://pipe-production.up.railway.app/auth/github/callback`

2. Add to Railway:
   ```bash
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
   ```

### OAuth Configuration (Slack)

1. Create Slack App at [api.slack.com/apps](https://api.slack.com/apps)
2. Add OAuth redirect URL: `https://pipe-production.up.railway.app/auth/slack/callback`
3. Add to Railway:
   ```bash
   SLACK_CLIENT_ID=your-client-id
   SLACK_CLIENT_SECRET=your-client-secret
   SLACK_SIGNING_SECRET=your-signing-secret
   ```

### Optional Configuration

```bash
# Monitoring (optional)
SENTRY_DSN=your-sentry-dsn
DATADOG_API_KEY=your-datadog-key

# Features
ENABLE_RATE_LIMITING=true
MAX_REQUESTS_PER_MINUTE=100
SESSION_TIMEOUT_HOURS=24

# WebSocket
WS_PORT=3001
WEBSOCKET_PING_INTERVAL=30000
```

## Domain and SSL Setup

### Generate Railway Domain

1. In your service settings, click **"Generate Domain"**
2. Railway provides: `your-app-name.up.railway.app`
3. SSL certificate automatically provisioned

### Custom Domain Setup

1. Add custom domain in service settings
2. Add CNAME record to your DNS:
   ```
   Type: CNAME
   Name: pipe (or @ for root domain)
   Value: your-app-name.up.railway.app
   ```
3. SSL certificate auto-provisioned via Let's Encrypt

### Update OAuth Callbacks

After domain setup, update your OAuth providers:
- GitHub: `https://pipe-production.up.railway.app/auth/github/callback` (or your custom domain)
- Slack: `https://pipe-production.up.railway.app/auth/slack/callback` (or your custom domain)

## Monitoring and Logs

### View Logs

**Via Dashboard:**
1. Click on your service
2. Go to "Logs" tab
3. Use filters for specific timeframes

**Via CLI:**
```bash
# Stream logs
railway logs --follow

# Last 100 lines
railway logs --lines 100

# Filter by text
railway logs --filter "ERROR"
```

### Health Checks

Implement health endpoint in your app:

```typescript
// src/routes/health.ts
app.get('/health', async (req, res) => {
  try {
    // Check database connections
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        postgres: 'connected',
        redis: 'connected',
        neo4j: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});
```

### Metrics and Monitoring

Railway provides basic metrics:
- CPU usage
- Memory usage
- Network I/O
- Request count

For advanced monitoring, integrate:
```bash
# Add to environment variables
SENTRY_DSN=your-sentry-dsn
NEW_RELIC_LICENSE_KEY=your-license-key
```

## Cost Optimization

### Resource Usage

Monitor and optimize:
1. **Database connections**: Use connection pooling
2. **Memory leaks**: Monitor heap usage
3. **Build optimization**: Cache dependencies

### Sleep Configuration

For development/staging environments:

```json
// railway.json
{
  "deploy": {
    "sleepAfterSeconds": 1800  // Sleep after 30 minutes of inactivity
  }
}
```

### Usage Alerts

Set up billing alerts:
1. Go to Project Settings → Usage
2. Set monthly spending limit
3. Configure alert thresholds

### Estimated Costs

```
PostgreSQL:     ~$5-15/month
Redis:          ~$5-10/month
Application:    ~$5-20/month (based on usage)
Neo4j (Aura):   ~$0-65/month (free tier available)
-----------------------------------
Total:          ~$15-110/month
```

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Check build logs
railway logs --filter "build"

# Common fixes:
# 1. Ensure Node.js version matches
# 2. Check package-lock.json is committed
# 3. Verify all dependencies are listed
```

#### Database Connection Issues

```bash
# Test database connection
railway run npm run db:migrate:deploy

# Common fixes:
# 1. Check DATABASE_URL format
# 2. Ensure SSL is enabled for production
# 3. Verify connection pool settings
```

#### WebSocket Connection Failures

```javascript
// Ensure proper WebSocket configuration
const ws = new WebSocket.Server({
  port: process.env.WS_PORT || 3001,
  host: '0.0.0.0'  // Important for Railway
});
```

### Debug Commands

```bash
# Check environment variables
railway run printenv

# Test database connection
railway run npx prisma db push

# Run migrations
railway run npm run db:migrate:deploy

# Access shell
railway shell
```

## Next Steps

### 1. Configure CI/CD

Add `.github/workflows/railway.yml`:

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Railway
        run: npm i -g @railway/cli
        
      - name: Deploy
        run: railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### 2. Set Up Staging Environment

```bash
# Create staging environment
railway environment staging

# Deploy to staging
railway up --environment staging
```

### 3. Configure Monitoring

1. Set up error tracking (Sentry)
2. Configure uptime monitoring (UptimeRobot, Pingdom)
3. Set up log aggregation (Logtail, Datadog)

### 4. Optimize Performance

1. Enable caching strategies
2. Configure CDN for static assets
3. Implement rate limiting
4. Set up horizontal scaling

### 5. Security Hardening

1. Enable CORS properly
2. Set up rate limiting
3. Configure security headers
4. Regular dependency updates

## Support Resources

- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Pipe MCP Issues](https://github.com/brownjer3/pipe/issues)
- [Railway Status](https://status.railway.app)

---

**Congratulations!** 🎉 Your Pipe MCP server should now be running on Railway. The platform will handle scaling, monitoring, and infrastructure management while you focus on building features.

Remember to:
- Monitor your usage and costs
- Keep dependencies updated
- Follow security best practices
- Join the Railway Discord for community support