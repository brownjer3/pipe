# Deployment Guide

## Production Requirements

### System Requirements

- **Server**: 2+ CPU cores, 4GB+ RAM
- **Node.js**: 20.x LTS
- **Databases**: 
  - PostgreSQL 15+
  - Redis 7+
  - Neo4j 5+

### Network Requirements

- HTTPS endpoint for OAuth callbacks
- WebSocket support for real-time features
- Webhook endpoints accessible from platforms

## Environment Configuration

### Production Environment Variables

```env
# Core Configuration
NODE_ENV=production
PORT=3000
WS_PORT=3001
APP_URL=https://your-domain.com
FRONTEND_URL=https://your-app.com

# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/pipe_db?ssl=true
NEO4J_URL=neo4j+s://your-neo4j-host:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=secure-password
REDIS_URL=redis://:password@your-redis-host:6379

# Security (use strong, unique values)
JWT_SECRET=<generate-with-openssl-rand-hex-32>
REFRESH_SECRET=<generate-with-openssl-rand-hex-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>

# Platform Credentials
GITHUB_CLIENT_ID=prod-github-client-id
GITHUB_CLIENT_SECRET=prod-github-client-secret
GITHUB_WEBHOOK_SECRET=prod-webhook-secret

SLACK_CLIENT_ID=prod-slack-client-id
SLACK_CLIENT_SECRET=prod-slack-client-secret
SLACK_SIGNING_SECRET=prod-signing-secret

# Optional: Monitoring
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info
```

### Generating Secure Keys

```bash
# Generate JWT secrets
openssl rand -hex 32

# Generate encryption key (must be 64 hex characters)
openssl rand -hex 32
```

## Deployment Options

### Option 1: Docker Deployment

1. **Build Docker image**
   ```dockerfile
   FROM node:20-alpine
   
   WORKDIR /app
   
   # Copy package files
   COPY package*.json ./
   COPY prisma ./prisma/
   
   # Install dependencies
   RUN npm ci --only=production
   RUN npm run db:generate
   
   # Copy application code
   COPY . .
   
   # Build TypeScript
   RUN npm run build
   
   EXPOSE 3000 3001
   
   CMD ["npm", "start"]
   ```

2. **Docker Compose for production**
   ```yaml
   version: '3.8'
   services:
     app:
       build: .
       ports:
         - "3000:3000"
         - "3001:3001"
       environment:
         - NODE_ENV=production
       env_file:
         - .env.production
       depends_on:
         - postgres
         - redis
         - neo4j
   ```

### Option 2: Cloud Platform Deployment

#### AWS Deployment

1. **EC2 Instance Setup**
   ```bash
   # Install Node.js
   curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
   sudo yum install nodejs
   
   # Install PM2
   npm install -g pm2
   
   # Clone and setup
   git clone https://github.com/brownjer3/pipe.git
   cd pipe
   npm ci --only=production
   npm run build
   ```

2. **PM2 Configuration**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'pipe-mcp-server',
       script: './dist/index.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production'
       }
     }]
   };
   ```

#### Heroku Deployment

1. **Create Heroku app**
   ```bash
   heroku create pipe-mcp-server
   heroku addons:create heroku-postgresql
   heroku addons:create heroku-redis
   ```

2. **Configure buildpacks**
   ```bash
   heroku buildpacks:set heroku/nodejs
   ```

3. **Deploy**
   ```bash
   git push heroku main
   heroku run npm run db:migrate:deploy
   ```

### Option 3: Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pipe-mcp-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pipe-mcp-server
  template:
    metadata:
      labels:
        app: pipe-mcp-server
    spec:
      containers:
      - name: app
        image: pipe-mcp-server:latest
        ports:
        - containerPort: 3000
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        envFrom:
        - secretRef:
            name: pipe-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: pipe-mcp-service
spec:
  selector:
    app: pipe-mcp-server
  ports:
  - name: http
    port: 3000
    targetPort: 3000
  - name: websocket
    port: 3001
    targetPort: 3001
```

## Database Setup

### PostgreSQL

1. **Create production database**
   ```sql
   CREATE DATABASE pipe_db;
   CREATE USER pipe_user WITH ENCRYPTED PASSWORD 'secure-password';
   GRANT ALL PRIVILEGES ON DATABASE pipe_db TO pipe_user;
   ```

2. **Run migrations**
   ```bash
   npm run db:migrate:deploy
   ```

### Neo4j

1. **Configure Neo4j**
   - Enable APOC procedures
   - Configure memory settings
   - Enable backup procedures

2. **Create indexes**
   ```cypher
   CREATE INDEX context_node_id IF NOT EXISTS FOR (n:ContextNode) ON (n.id);
   CREATE INDEX context_node_type IF NOT EXISTS FOR (n:ContextNode) ON (n.type);
   CREATE INDEX context_node_platform IF NOT EXISTS FOR (n:ContextNode) ON (n.platform);
   ```

### Redis

1. **Configure Redis**
   ```conf
   maxmemory 1gb
   maxmemory-policy allkeys-lru
   save 900 1
   save 300 10
   save 60 10000
   ```

## SSL/TLS Configuration

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # API endpoints
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # WebSocket endpoint
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring & Logging

### Health Checks

Configure monitoring to check:
- `/health` - Basic health check
- `/health/detailed` - Detailed service status

### Logging

1. **Production logging configuration**
   ```typescript
   // Configured via LOG_LEVEL env var
   // Logs stored in ./logs/ directory
   ```

2. **Log aggregation with ELK Stack**
   ```yaml
   filebeat.inputs:
   - type: log
     enabled: true
     paths:
       - /var/log/pipe/*.log
     json.keys_under_root: true
   ```

### Metrics

Monitor key metrics:
- Response times
- Error rates
- Queue lengths
- Database connections
- Memory usage

## Backup & Recovery

### Database Backups

1. **PostgreSQL backup**
   ```bash
   pg_dump pipe_db > backup_$(date +%Y%m%d).sql
   ```

2. **Neo4j backup**
   ```bash
   neo4j-admin backup --database=neo4j --backup-dir=/backups/
   ```

3. **Automated backups**
   ```bash
   # Add to crontab
   0 2 * * * /path/to/backup-script.sh
   ```

## Security Hardening

1. **Rate Limiting**
   - Configure rate limits per endpoint
   - Implement IP-based rate limiting

2. **Security Headers**
   ```typescript
   app.use(helmet({
     contentSecurityPolicy: {
       directives: {
         defaultSrc: ["'self'"],
         styleSrc: ["'self'", "'unsafe-inline'"],
         scriptSrc: ["'self'"],
         imgSrc: ["'self'", "data:", "https:"],
       },
     },
   }));
   ```

3. **Firewall Rules**
   - Allow only necessary ports
   - Restrict database access
   - Configure fail2ban

## Troubleshooting

### Common Production Issues

1. **Memory leaks**
   - Monitor with `pm2 monit`
   - Set memory limits
   - Enable heap snapshots

2. **Database connection pooling**
   ```typescript
   // Adjust pool size based on load
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     connection_limit = 100
   }
   ```

3. **WebSocket scaling**
   - Use Redis adapter for Socket.io
   - Configure sticky sessions

### Rollback Procedure

1. Keep previous version tagged
2. Database migration rollback: `npm run db:migrate:rollback`
3. Redeploy previous version
4. Verify service health