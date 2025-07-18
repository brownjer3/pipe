import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import {
  PlatformAdapter,
  PlatformCredentials,
  AdapterSyncOptions,
  SyncResult,
  SyncItem,
  WebhookEvent,
  SyncError,
} from '../../types/platform';
import { logger } from '../../utils/logger';

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  scopes?: string[];
}

export class SlackAdapter implements PlatformAdapter {
  name = 'slack' as const;
  private config: SlackConfig;
  private client?: WebClient;

  constructor(config: SlackConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || [
        'channels:history',
        'channels:read',
        'chat:write',
        'groups:history',
        'groups:read',
        'im:history',
        'im:read',
        'mpim:history',
        'mpim:read',
        'users:read',
        'users:read.email',
        'team:read',
        'emoji:read',
        'files:read',
      ],
    };
  }

  // OAuth implementation
  getOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes!.join(','),
      redirect_uri: redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials> {
    try {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: redirectUri,
      });

      const response = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        access_token?: string;
        scope?: string;
        team: { id: string; name: string };
        authed_user: { id: string; scope: string; access_token: string };
        bot_user_id?: string;
        app_id?: string;
      };

      if (!data.ok || !data.access_token) {
        throw new Error(`Slack OAuth error: ${data.error || 'No access token received'}`);
      }

      // Get team info
      const client = new WebClient(data.access_token);
      const teamInfo = await client.team.info();

      return {
        userId: data.authed_user.id,
        teamId: data.team.id,
        accessToken: data.access_token,
        scope: data.scope?.split(',') || [],
        metadata: {
          teamName: data.team.name,
          teamDomain: teamInfo.team?.domain,
          botUserId: data.bot_user_id,
          appId: data.app_id,
          authedUser: {
            id: data.authed_user.id,
            scope: data.authed_user.scope,
            accessToken: data.authed_user.access_token,
          },
        },
      };
    } catch (error) {
      logger.error('Slack OAuth token exchange failed', error);
      throw error;
    }
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const client = new WebClient(credentials.accessToken);
      const result = await client.auth.test();
      return result.ok === true;
    } catch (error) {
      return false;
    }
  }

  // Sync implementation
  async sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult> {
    this.client = new WebClient(credentials.accessToken);
    const items: SyncItem[] = [];
    const errors: SyncError[] = [];

    try {
      // Sync channels
      const channels = await this.syncChannels(options);
      items.push(...channels);

      // Sync messages from channels
      for (const channel of channels.slice(0, 10)) {
        // Limit to first 10 channels
        try {
          const messages = await this.syncMessages(channel.data.id, options);
          items.push(...messages);
        } catch (error: any) {
          errors.push({
            itemId: channel.id,
            error: error.message,
            timestamp: new Date(),
            retryable: true,
          });
        }
      }

      // Sync users
      const users = await this.syncUsers();
      items.push(...users);
    } catch (error: any) {
      logger.error('Slack sync failed', error);
      errors.push({
        error: error.message,
        timestamp: new Date(),
        retryable: false,
      });
    }

    return {
      platform: 'slack',
      teamId: credentials.teamId,
      items,
      totalSynced: items.length,
      errors,
      metadata: {
        syncedAt: new Date().toISOString(),
      },
    };
  }

  private async syncChannels(options: AdapterSyncOptions): Promise<SyncItem[]> {
    const channels: SyncItem[] = [];

    try {
      const result = await this.client!.conversations.list({
        exclude_archived: true,
        types: 'public_channel,private_channel',
        limit: options.limit || 100,
      });

      if (result.channels) {
        for (const channel of result.channels) {
          channels.push({
            id: `slack:channel:${channel.id}`,
            type: 'channel',
            data: {
              id: channel.id!,
              name: channel.name!,
              topic: channel.topic?.value,
              purpose: channel.purpose?.value,
              created: channel.created,
              creator: channel.creator,
              is_private: channel.is_private,
              is_archived: channel.is_archived,
              member_count: channel.num_members,
            },
            metadata: {
              is_channel: channel.is_channel,
              is_group: channel.is_group,
              is_im: channel.is_im,
              is_mpim: channel.is_mpim,
            },
          });
        }
      }
    } catch (error) {
      logger.error('Failed to sync Slack channels', error);
    }

    return channels;
  }

  private async syncMessages(channelId: string, options: AdapterSyncOptions): Promise<SyncItem[]> {
    const messages: SyncItem[] = [];
    const oldest = options.since ? new Date(options.since).getTime() / 1000 : undefined;

    try {
      const result = await this.client!.conversations.history({
        channel: channelId,
        oldest: oldest?.toString(),
        limit: options.limit || 50,
      });

      if (result.messages) {
        for (const message of result.messages) {
          // Skip bot messages and thread broadcasts
          if (
            (message as any).subtype &&
            ['bot_message', 'thread_broadcast'].includes((message as any).subtype)
          ) {
            continue;
          }

          messages.push({
            id: `slack:message:${channelId}:${message.ts}`,
            type: 'message',
            data: {
              ts: message.ts!,
              text: message.text || '',
              user: message.user,
              channel: channelId,
              thread_ts: message.thread_ts,
              reply_count: message.reply_count,
              reply_users_count: message.reply_users_count?.toString(),
              reactions: message.reactions?.map((r) => ({
                name: r.name,
                count: r.count,
                users: r.users,
              })),
              files: message.files?.map((f) => ({
                id: f.id,
                name: f.name,
                title: f.title,
                mimetype: f.mimetype,
                size: f.size,
                url_private: f.url_private,
              })),
            },
            metadata: {
              subtype: (message as any).subtype,
              edited: message.edited,
              attachments: message.attachments?.length || 0,
            },
            relatedTo:
              message.thread_ts && message.thread_ts !== message.ts
                ? [`slack:message:${channelId}:${message.thread_ts}`]
                : [],
          });

          // Sync thread replies if this is a parent message
          if (message.reply_count && message.reply_count > 0) {
            try {
              const replies = await this.syncThreadReplies(channelId, message.ts!);
              messages.push(...replies);
            } catch (error) {
              logger.error(`Failed to sync thread replies for ${message.ts}`, error);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to sync messages for channel ${channelId}`, error);
    }

    return messages;
  }

  private async syncThreadReplies(channelId: string, threadTs: string): Promise<SyncItem[]> {
    const replies: SyncItem[] = [];

    try {
      const result = await this.client!.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 100,
      });

      if (result.messages) {
        // Skip the parent message (first one)
        for (const message of result.messages.slice(1)) {
          replies.push({
            id: `slack:message:${channelId}:${message.ts}`,
            type: 'message',
            data: {
              ts: message.ts!,
              text: message.text || '',
              user: message.user,
              channel: channelId,
              thread_ts: threadTs,
            },
            metadata: {
              is_thread_reply: true,
              subtype: (message as any).subtype,
            },
            relatedTo: [`slack:message:${channelId}:${threadTs}`],
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to sync thread replies`, error);
    }

    return replies;
  }

  private async syncUsers(): Promise<SyncItem[]> {
    const users: SyncItem[] = [];

    try {
      const result = await this.client!.users.list({
        limit: 100,
      });

      if (result.members) {
        for (const user of result.members) {
          // Skip bots and deleted users
          if (user.is_bot || user.deleted) continue;

          users.push({
            id: `slack:user:${user.id}`,
            type: 'user',
            data: {
              id: user.id!,
              name: user.name!,
              real_name: user.real_name,
              display_name: user.profile?.display_name,
              email: user.profile?.email,
              title: user.profile?.title,
              status_text: user.profile?.status_text,
              status_emoji: user.profile?.status_emoji,
              image_192: user.profile?.image_192,
              is_admin: user.is_admin,
              is_owner: user.is_owner,
              tz: user.tz,
            },
            metadata: {
              is_restricted: user.is_restricted,
              is_ultra_restricted: user.is_ultra_restricted,
              has_2fa: user.has_2fa,
            },
          });
        }
      }
    } catch (error) {
      logger.error('Failed to sync Slack users', error);
    }

    return users;
  }

  // Webhook/Event handling
  async verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean> {
    const timestamp = headers['x-slack-request-timestamp'];
    const signature = headers['x-slack-signature'];

    if (!timestamp || !signature) return false;

    // Check timestamp to prevent replay attacks (must be within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 60 * 5) {
      return false;
    }

    // Verify signature
    const sigBasestring = `v0:${timestamp}:${typeof body === 'string' ? body : JSON.stringify(body)}`;
    const mySignature =
      'v0=' +
      crypto.createHmac('sha256', this.config.signingSecret).update(sigBasestring).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  }

  async parseWebhook(body: any): Promise<WebhookEvent[]> {
    const events: WebhookEvent[] = [];

    // Handle URL verification challenge
    if (body.type === 'url_verification') {
      return [];
    }

    // Handle event callbacks
    if (body.type === 'event_callback' && body.event) {
      const event = body.event;

      switch (event.type) {
        case 'message':
          if (!event.subtype || event.subtype === 'message_changed') {
            events.push({
              type: 'message',
              action: event.subtype || 'created',
              data: {
                ts: event.ts || event.message?.ts,
                text: event.text || event.message?.text,
                user: event.user || event.message?.user,
                channel: event.channel,
                thread_ts: event.thread_ts,
                team: body.team_id,
              },
              metadata: {
                channel_type: event.channel_type,
              },
            });
          }
          break;

        case 'reaction_added':
        case 'reaction_removed':
          events.push({
            type: 'reaction',
            action: event.type.replace('reaction_', ''),
            data: {
              user: event.user,
              reaction: event.reaction,
              item: event.item,
              item_user: event.item_user,
              team: body.team_id,
            },
          });
          break;

        case 'file_shared':
          events.push({
            type: 'file',
            action: 'shared',
            data: {
              file_id: event.file_id,
              user_id: event.user_id,
              channel_id: event.channel_id,
              team: body.team_id,
            },
          });
          break;

        case 'channel_created':
        case 'channel_deleted':
        case 'channel_archive':
        case 'channel_unarchive':
          events.push({
            type: 'channel',
            action: event.type.replace('channel_', ''),
            data: {
              channel: event.channel,
              team: body.team_id,
            },
          });
          break;
      }
    }

    return events;
  }

  // Optional search implementation
  async searchContent(credentials: PlatformCredentials, query: string): Promise<SyncItem[]> {
    this.client = new WebClient(credentials.accessToken);
    const items: SyncItem[] = [];

    try {
      const result = await this.client.search.messages({
        query,
        count: 20,
      });

      if (result.messages?.matches) {
        for (const match of result.messages.matches) {
          items.push({
            id: `slack:message:${match.channel?.id}:${match.ts}`,
            type: 'message',
            data: {
              ts: match.ts,
              text: match.text || '',
              user: match.username || match.user,
              channel: match.channel?.id,
              permalink: match.permalink,
            },
          });
        }
      }
    } catch (error) {
      logger.error('Slack search failed', error);
    }

    return items;
  }
}
