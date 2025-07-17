# Troubleshooting Guide

## Common Issues

### Installation Issues

#### npm install fails

**Problem**: Dependencies fail to install

**Solutions**:
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Delete node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check Node.js version:
   ```bash
   node --version  # Should be 20.x or higher
   ```

#### Docker containers won't start

**Problem**: Docker Compose fails to start services

**Solutions**:
1. Check if ports are already in use:
   ```bash
   lsof -i :5432  # PostgreSQL
   lsof -i :6379  # Redis
   lsof -i :7687  # Neo4j
   ```

2. Check Docker daemon is running:
   ```bash
   docker info
   ```

3. Reset Docker containers:
   ```bash
   docker-compose down -v
   docker-compose up -d
   ```

### Database Issues

#### Database connection refused

**Problem**: Cannot connect to PostgreSQL/Redis/Neo4j

**Solutions**:
1. Verify services are running:
   ```bash
   docker-compose ps
   ```

2. Check connection strings in `.env`:
   ```env
   DATABASE_URL=postgresql://pipe_user:pipe_password@localhost:5432/pipe_db
   NEO4J_URL=bolt://localhost:7687
   REDIS_URL=redis://localhost:6379
   ```

3. Test connections directly:
   ```bash
   # PostgreSQL
   psql postgresql://pipe_user:pipe_password@localhost:5432/pipe_db
   
   # Redis
   redis-cli ping
   
   # Neo4j
   cypher-shell -u neo4j -p pipe_password
   ```

#### Migration errors

**Problem**: Prisma migrations fail

**Solutions**:
1. Reset database (WARNING: deletes all data):
   ```bash
   npm run db:reset
   ```

2. Check migration status:
   ```bash
   npx prisma migrate status
   ```

3. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

### Authentication Issues

#### JWT token invalid

**Problem**: Authentication fails with "Invalid token"

**Solutions**:
1. Check JWT secrets are set:
   ```bash
   echo $JWT_SECRET
   echo $REFRESH_SECRET
   ```

2. Verify token format:
   ```typescript
   // Should be: Bearer <token>
   Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
   ```

3. Check token expiration

#### OAuth flow fails

**Problem**: Platform OAuth returns error

**Solutions**:
1. Verify redirect URI matches exactly:
   - GitHub: `http://localhost:3000/api/oauth/callback/github`
   - Slack: `http://localhost:3000/api/oauth/callback/slack`

2. Check client credentials in `.env`

3. Verify required scopes are configured

### Platform Integration Issues

#### Webhooks not received

**Problem**: Platform webhooks not triggering

**Solutions**:
1. Check webhook URL is accessible:
   ```bash
   curl -X POST http://your-domain/api/webhooks/github
   ```

2. Verify webhook secrets match

3. Check webhook logs:
   ```bash
   curl http://localhost:3000/api/webhooks/status
   ```

4. Use ngrok for local testing:
   ```bash
   ngrok http 3000
   # Use ngrok URL for webhook configuration
   ```

#### Sync failures

**Problem**: Platform sync returns errors

**Solutions**:
1. Check rate limits:
   - GitHub: 5000 requests/hour (authenticated)
   - Slack: Varies by method

2. Verify access token validity:
   ```bash
   curl http://localhost:3000/api/oauth/connections
   ```

3. Check sync job status:
   ```typescript
   GET /api/oauth/sync/:platform/status
   ```

### Performance Issues

#### Slow response times

**Problem**: API responses are slow

**Solutions**:
1. Check database query performance:
   ```sql
   -- PostgreSQL slow queries
   SELECT query, calls, total_time, mean_time
   FROM pg_stat_statements
   ORDER BY mean_time DESC
   LIMIT 10;
   ```

2. Monitor Redis memory:
   ```bash
   redis-cli info memory
   ```

3. Check Neo4j query performance:
   ```cypher
   CALL dbms.listQueries()
   ```

#### High memory usage

**Problem**: Node.js process uses too much memory

**Solutions**:
1. Check for memory leaks:
   ```bash
   node --inspect src/index.ts
   # Use Chrome DevTools for heap snapshots
   ```

2. Increase Node.js memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```

3. Monitor with PM2:
   ```bash
   pm2 monit
   ```

### WebSocket Issues

#### Connection drops frequently

**Problem**: WebSocket connections unstable

**Solutions**:
1. Check heartbeat configuration:
   ```typescript
   // Increase heartbeat interval
   io.engine.pingInterval = 25000;
   io.engine.pingTimeout = 60000;
   ```

2. Enable WebSocket compression:
   ```typescript
   io.engine.httpCompression = true;
   ```

3. Check proxy configuration for WebSocket support

## Debug Commands

### Useful debugging commands

```bash
# Check all services health
curl http://localhost:3000/health/detailed

# View recent logs
docker-compose logs -f --tail=100

# Check TypeScript errors
npm run typecheck

# Validate environment
node -e "require('dotenv').config(); console.log(process.env)"

# Test MCP connection
wscat -c ws://localhost:3001

# Database queries
npx prisma studio  # Visual database browser
```

### Enable debug logging

```env
# .env file
LOG_LEVEL=debug
DEBUG=pipe:*
```

```typescript
// In code
logger.debug('Detailed debug info', { 
  userId, 
  platform, 
  requestData 
});
```

## Error Codes Reference

### Application Error Codes

- `AUTH001` - Invalid credentials
- `AUTH002` - Token expired
- `AUTH003` - Insufficient permissions
- `PLATFORM001` - OAuth flow failed
- `PLATFORM002` - Platform not connected
- `PLATFORM003` - Sync failed
- `WEBHOOK001` - Invalid signature
- `WEBHOOK002` - Processing failed
- `MCP001` - Invalid JSON-RPC
- `MCP002` - Tool not found

### HTTP Status Codes

- `400` - Bad Request (invalid input)
- `401` - Unauthorized (auth required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error
- `502` - Bad Gateway (upstream error)
- `503` - Service Unavailable

## Getting Help

### Resources

1. **Documentation**: Check `/docs` directory
2. **GitHub Issues**: https://github.com/brownjer3/pipe/issues
3. **Discord Community**: [Join our Discord]
4. **Stack Overflow**: Tag with `pipe-mcp`

### Reporting Issues

When reporting issues, include:

1. **Environment**:
   - Node.js version
   - OS and version
   - Docker version

2. **Error details**:
   - Full error message
   - Stack trace
   - Request/response data

3. **Steps to reproduce**:
   - Minimal reproduction steps
   - Expected vs actual behavior

4. **Logs**:
   ```bash
   # Collect diagnostic info
   npm run diagnostics > diagnostics.log
   ```

### Debug Checklist

- [ ] Check error logs
- [ ] Verify environment variables
- [ ] Test with minimal configuration
- [ ] Check network connectivity
- [ ] Verify service dependencies
- [ ] Review recent changes
- [ ] Test in isolation
- [ ] Check documentation