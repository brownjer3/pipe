# Platform Integration Guide

## Overview

Pipe MCP Server integrates with multiple developer platforms to create a unified context graph. Each platform integration follows a consistent pattern using adapters.

## OAuth Configuration

### GitHub Integration

1. **Create GitHub OAuth App**
   - Go to GitHub Settings > Developer settings > OAuth Apps
   - Click "New OAuth App"
   - Set Authorization callback URL: `http://localhost:3000/api/oauth/callback/github`
   - Note the Client ID and Client Secret

2. **Configure Environment Variables**
   ```bash
   GITHUB_CLIENT_ID=your-client-id
   GITHUB_CLIENT_SECRET=your-client-secret
   GITHUB_WEBHOOK_SECRET=your-webhook-secret
   ```

3. **Required Scopes**
   - `repo` - Full repository access
   - `user` - User profile access
   - `read:org` - Organization access

### Slack Integration

1. **Create Slack App**
   - Go to https://api.slack.com/apps
   - Click "Create New App" > "From scratch"
   - Add OAuth Redirect URL: `http://localhost:3000/api/oauth/callback/slack`

2. **Configure Bot Token Scopes**
   - `channels:history` - View messages in public channels
   - `channels:read` - View basic channel info
   - `chat:write` - Send messages
   - `users:read` - View user info
   - `team:read` - View team info

3. **Configure Environment Variables**
   ```bash
   SLACK_CLIENT_ID=your-client-id
   SLACK_CLIENT_SECRET=your-client-secret
   SLACK_SIGNING_SECRET=your-signing-secret
   ```

### Webhook Configuration

#### GitHub Webhooks

1. **Repository Webhooks**
   - Go to Repository Settings > Webhooks
   - Add webhook URL: `http://your-domain/api/webhooks/github`
   - Content type: `application/json`
   - Secret: Use the same as `GITHUB_WEBHOOK_SECRET`

2. **Events to Subscribe**
   - Issues
   - Pull requests
   - Issue comments
   - Pull request reviews
   - Push events

#### Slack Events

1. **Enable Events API**
   - In your Slack app settings, go to "Event Subscriptions"
   - Enable events and add Request URL: `http://your-domain/api/webhooks/slack`

2. **Subscribe to Bot Events**
   - `message.channels` - Messages in public channels
   - `message.groups` - Messages in private channels
   - `message.im` - Direct messages
   - `message.mpim` - Group direct messages

## Platform Adapters

### Adapter Interface

All platform adapters implement this interface:

```typescript
interface PlatformAdapter {
  // OAuth flow
  getOAuthUrl(state: string, redirectUri: string): string;
  exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials>;
  
  // Synchronization
  sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult>;
  
  // Webhooks
  verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean>;
  parseWebhook(body: any): Promise<WebhookEvent[]>;
}
```

### Creating a New Adapter

1. **Create adapter file**: `src/platforms/adapters/myplatform.ts`

```typescript
import { PlatformAdapter, PlatformCredentials, SyncResult } from '../../types/platform';

export class MyPlatformAdapter implements PlatformAdapter {
  name = 'myplatform' as const;
  
  constructor(private config: MyPlatformConfig) {}
  
  getOAuthUrl(state: string, redirectUri: string): string {
    // Implement OAuth URL generation
  }
  
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials> {
    // Exchange OAuth code for access token
  }
  
  async sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult> {
    // Implement data synchronization
  }
  
  async verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean> {
    // Verify webhook signature
  }
  
  async parseWebhook(body: any): Promise<WebhookEvent[]> {
    // Parse webhook payload into events
  }
}
```

2. **Register adapter** in `src/app.ts`:

```typescript
const myPlatformAdapter = new MyPlatformAdapter({
  clientId: process.env.MYPLATFORM_CLIENT_ID!,
  clientSecret: process.env.MYPLATFORM_CLIENT_SECRET!,
});

platformManager.registerAdapter(myPlatformAdapter);
```

## Sync Strategies

### Full Sync
- Retrieves all available data from the platform
- Used for initial connection or data recovery
- Can be resource-intensive

### Incremental Sync
- Only retrieves data changed since last sync
- Uses timestamps or cursors for efficiency
- Default sync method

### Real-time Sync
- Uses webhooks/events for immediate updates
- Minimal delay between platform changes and context updates
- Requires webhook configuration

## Data Mapping

### Context Node Types

Platform data is mapped to these context node types:

- `issue` - Bug reports, feature requests
- `pull_request` - Code changes and reviews
- `commit` - Code commits
- `comment` - Discussions and feedback
- `message` - Chat messages
- `channel` - Communication channels
- `document` - Wiki pages, docs
- `task` - Project tasks
- `user` - Team members
- `repository` - Code repositories

### Relationship Types

- `created_by` - User created item
- `assigned_to` - User assigned to item
- `mentioned_in` - User/item mentioned
- `replies_to` - Response relationship
- `relates_to` - General relationship
- `part_of` - Hierarchical relationship

## Best Practices

1. **Rate Limiting**
   - Respect platform rate limits
   - Implement exponential backoff
   - Use webhooks to reduce API calls

2. **Error Handling**
   - Handle token expiration gracefully
   - Retry transient failures
   - Log errors for debugging

3. **Data Privacy**
   - Only sync permitted data
   - Respect user privacy settings
   - Encrypt sensitive information

4. **Performance**
   - Batch API requests when possible
   - Use pagination for large datasets
   - Cache frequently accessed data

## Troubleshooting

### Common Issues

1. **OAuth Flow Fails**
   - Check redirect URI matches exactly
   - Verify client ID and secret
   - Ensure required scopes are requested

2. **Webhooks Not Received**
   - Verify webhook URL is accessible
   - Check signature verification
   - Review webhook event subscriptions

3. **Sync Errors**
   - Check API rate limits
   - Verify access token validity
   - Review platform API changes

### Debug Tools

- Use `/api/oauth/connections` to check connection status
- Monitor `/api/webhooks/status` for webhook health
- Check logs for detailed error messages
- Use platform API explorers for testing