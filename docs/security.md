# Security Guide

## Overview

Pipe MCP Server implements multiple layers of security to protect user data and maintain system integrity. This guide covers security measures, best practices, and compliance considerations.

## Authentication & Authorization

### JWT Authentication

The system uses JWT tokens for stateless authentication:

- **Access Token**: Short-lived (15 minutes)
- **Refresh Token**: Long-lived (7 days) with rotation
- **Token Storage**: HttpOnly cookies or Authorization header

```typescript
// Token structure
{
  userId: string;
  teamId: string;
  email: string;
  iat: number;
  exp: number;
}
```

### Password Security

- **Hashing**: bcrypt with 10+ rounds
- **Requirements**: Minimum 8 characters
- **Storage**: Only hashed passwords stored

## Data Encryption

### Encryption at Rest

All sensitive data is encrypted using AES-256-GCM:

```typescript
// Encrypted data structure
{
  encrypted: string;  // Base64 encoded
  iv: string;         // Initialization vector
  authTag: string;    // Authentication tag
}
```

### Encrypted Fields

- OAuth access tokens
- OAuth refresh tokens
- Webhook secrets
- API credentials

### Encryption Key Management

- Store `ENCRYPTION_KEY` securely (e.g., AWS KMS, HashiCorp Vault)
- Rotate encryption keys periodically
- Never commit keys to version control

## Platform Security

### OAuth 2.0 Implementation

1. **State Parameter**: CSRF protection
   ```typescript
   const state = crypto.randomUUID();
   // Store state in Redis with expiry
   ```

2. **PKCE Support**: For public clients (planned)

3. **Token Storage**: Encrypted in database

### Webhook Security

Each platform uses different verification methods:

#### GitHub
```typescript
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
const expected = `sha256=${signature}`;
```

#### Slack
```typescript
const signature = crypto
  .createHmac('sha256', signingSecret)
  .update(`v0:${timestamp}:${body}`)
  .digest('hex');
const expected = `v0=${signature}`;
```

## API Security

### Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
const rateLimiter = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
};
```

### CORS Configuration

```typescript
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  optionsSuccessStatus: 200
};
```

### Security Headers

Essential security headers:

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## Database Security

### Connection Security

- Use SSL/TLS for all database connections
- Implement connection pooling with limits
- Use least-privilege database users

### Query Security

- Use parameterized queries (Prisma ORM)
- Validate all user inputs
- Implement query timeouts

```typescript
// Prisma automatically prevents SQL injection
const user = await prisma.user.findUnique({
  where: { email: userInput } // Safe
});
```

## Session Management

### Redis Session Store

```typescript
const sessionConfig = {
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  store: new RedisStore({ client: redisClient }),
  cookie: {
    secure: true, // HTTPS only
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: 'strict'
  }
};
```

### Session Security

- Regenerate session ID on login
- Implement session timeout
- Clear sessions on logout

## Input Validation

### Request Validation with Zod

```typescript
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

// Validate request
const validated = LoginSchema.parse(req.body);
```

### Sanitization

- Strip HTML from user inputs
- Validate file uploads
- Limit request body size

## Logging & Monitoring

### Security Logging

Log security-relevant events:

```typescript
logger.info('auth.login.success', { userId, ip: req.ip });
logger.warn('auth.login.failed', { email, ip: req.ip });
logger.error('auth.token.invalid', { token: tokenId, ip: req.ip });
```

### Audit Trail

Track sensitive operations:

```typescript
await prisma.auditLog.create({
  data: {
    userId,
    action: 'platform.connected',
    resourceType: 'platform_connection',
    resourceId: platform,
    metadata: { ip: req.ip },
    timestamp: new Date()
  }
});
```

## Vulnerability Management

### Dependency Security

```bash
# Regular security audits
npm audit

# Fix vulnerabilities
npm audit fix

# Check for outdated packages
npm outdated
```

### Security Testing

1. **Static Analysis**
   ```bash
   # ESLint security plugin
   npm install --save-dev eslint-plugin-security
   ```

2. **Dynamic Analysis**
   - OWASP ZAP for API testing
   - Burp Suite for security scanning

## Compliance Considerations

### GDPR Compliance

- Right to access data
- Right to deletion
- Data portability
- Privacy by design

### Data Retention

```typescript
// Implement data retention policies
const RETENTION_DAYS = 365;

// Cleanup job
async function cleanupOldData() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoffDate } }
  });
}
```

## Security Checklist

### Development

- [ ] Environment variables properly configured
- [ ] No secrets in code or logs
- [ ] Input validation on all endpoints
- [ ] Error messages don't leak sensitive info

### Deployment

- [ ] HTTPS enabled with valid certificate
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Firewall rules configured
- [ ] Database connections use SSL
- [ ] Logs don't contain sensitive data

### Ongoing

- [ ] Regular dependency updates
- [ ] Security audit schedule
- [ ] Incident response plan
- [ ] Backup encryption verified
- [ ] Access logs reviewed

## Incident Response

### Response Plan

1. **Detection**: Monitor logs and alerts
2. **Containment**: Isolate affected systems
3. **Investigation**: Determine scope and cause
4. **Remediation**: Fix vulnerabilities
5. **Recovery**: Restore normal operations
6. **Lessons Learned**: Update procedures

### Contact Information

- Security Team: security@example.com
- On-call: +1-XXX-XXX-XXXX
- Incident tracking: JIRA/PagerDuty

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://github.com/goldbergyoni/nodebestpractices#6-security-best-practices)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)