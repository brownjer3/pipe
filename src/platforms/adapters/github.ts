import { Octokit } from '@octokit/rest';
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

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  scopes?: string[];
}

export class GitHubAdapter implements PlatformAdapter {
  name = 'github' as const;
  private config: GitHubConfig;
  private octokit?: Octokit;

  constructor(config: GitHubConfig) {
    this.config = {
      ...config,
      scopes: config.scopes || ['repo', 'read:org', 'read:user', 'user:email', 'read:discussion'],
    };
  }

  // OAuth implementation
  getOAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: this.config.scopes!.join(' '),
      state,
      allow_signup: 'true',
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials> {
    try {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const data = (await response.json()) as {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (data.error) {
        throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
      }

      if (!data.access_token) {
        throw new Error('No access token received from GitHub');
      }

      // Get user info
      const octokit = new Octokit({ auth: data.access_token });
      const { data: user } = await octokit.users.getAuthenticated();

      // Get user's primary email
      const { data: emails } = await octokit.users.listEmailsForAuthenticatedUser();
      const primaryEmail = emails.find((e) => e.primary)?.email || user.email;

      // Get user's organizations to determine team
      const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();
      const teamId = orgs.length > 0 ? `github-org-${orgs[0].id}` : `github-user-${user.id}`;

      return {
        userId: user.id.toString(),
        teamId,
        accessToken: data.access_token,
        scope: data.scope?.split(',') || this.config.scopes,
        metadata: {
          login: user.login,
          name: user.name,
          email: primaryEmail,
          avatarUrl: user.avatar_url,
          organizations: orgs.map((org) => ({
            id: org.id,
            login: org.login,
          })),
        },
      };
    } catch (error) {
      logger.error('GitHub OAuth token exchange failed', error);
      throw error;
    }
  }

  async validateCredentials(credentials: PlatformCredentials): Promise<boolean> {
    try {
      const octokit = new Octokit({ auth: credentials.accessToken });
      await octokit.users.getAuthenticated();
      return true;
    } catch (error) {
      return false;
    }
  }

  // Sync implementation
  async sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult> {
    this.octokit = new Octokit({ auth: credentials.accessToken });
    const items: SyncItem[] = [];
    const errors: SyncError[] = [];

    try {
      // Sync repositories
      const repos = await this.syncRepositories(options);
      items.push(...repos);

      // Sync issues and pull requests for each repo
      for (const repo of repos.slice(0, 10)) {
        // Limit to first 10 repos for performance
        try {
          const [issues, prs] = await Promise.all([
            this.syncIssues(repo.data.full_name, options),
            this.syncPullRequests(repo.data.full_name, options),
          ]);
          items.push(...issues, ...prs);
        } catch (error: any) {
          errors.push({
            itemId: repo.id,
            error: error.message,
            timestamp: new Date(),
            retryable: true,
          });
        }
      }

      // Sync recent commits
      const commits = await this.syncCommits(options);
      items.push(...commits);
    } catch (error: any) {
      logger.error('GitHub sync failed', error);
      errors.push({
        error: error.message,
        timestamp: new Date(),
        retryable: false,
      });
    }

    return {
      platform: 'github',
      teamId: credentials.teamId,
      items,
      totalSynced: items.length,
      errors,
      metadata: {
        syncedAt: new Date().toISOString(),
      },
    };
  }

  private async syncRepositories(options: AdapterSyncOptions): Promise<SyncItem[]> {
    const repos: SyncItem[] = [];
    const since = options.since ? new Date(options.since) : undefined;

    try {
      const { data } = await this.octokit!.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: 'updated',
        since: since?.toISOString(),
      });

      for (const repo of data) {
        repos.push({
          id: `github:repo:${repo.id}`,
          type: 'repository',
          data: {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            language: repo.language,
            topics: repo.topics,
            stargazers_count: repo.stargazers_count,
            forks_count: repo.forks_count,
            open_issues_count: repo.open_issues_count,
            created_at: repo.created_at,
            updated_at: repo.updated_at,
            owner: {
              id: repo.owner.id.toString(),
              name: repo.owner.login,
              avatarUrl: repo.owner.avatar_url,
            },
          },
          metadata: {
            private: repo.private,
            fork: repo.fork,
            archived: repo.archived,
          },
        });
      }
    } catch (error) {
      logger.error('Failed to sync repositories', error);
    }

    return repos;
  }

  private async syncIssues(repoFullName: string, options: AdapterSyncOptions): Promise<SyncItem[]> {
    const issues: SyncItem[] = [];
    const [owner, repo] = repoFullName.split('/');
    const since = options.since ? new Date(options.since) : undefined;

    try {
      const { data } = await this.octokit!.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        since: since?.toISOString(),
        per_page: options.limit || 30,
        sort: 'updated',
      });

      for (const issue of data) {
        // Skip pull requests (they come through as issues too)
        if (issue.pull_request) continue;

        issues.push({
          id: `github:issue:${issue.id}`,
          type: 'issue',
          data: {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            body: issue.body,
            url: issue.html_url,
            state: issue.state,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            closed_at: issue.closed_at,
            author: issue.user
              ? {
                  id: issue.user.id.toString(),
                  name: issue.user.login,
                  avatarUrl: issue.user.avatar_url,
                }
              : undefined,
            labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
            assignees: issue.assignees?.map((a) => ({
              id: a.id.toString(),
              name: a.login,
              avatarUrl: a.avatar_url,
            })),
          },
          metadata: {
            repository: repoFullName,
            milestone: issue.milestone?.title,
          },
          relatedTo: issue.pull_request ? [`github:pr:${issue.number}`] : [],
        });
      }
    } catch (error) {
      logger.error(`Failed to sync issues for ${repoFullName}`, error);
    }

    return issues;
  }

  private async syncPullRequests(
    repoFullName: string,
    options: AdapterSyncOptions
  ): Promise<SyncItem[]> {
    const prs: SyncItem[] = [];
    const [owner, repo] = repoFullName.split('/');
    const since = options.since ? new Date(options.since) : undefined;

    try {
      const { data } = await this.octokit!.pulls.list({
        owner,
        repo,
        state: 'all',
        per_page: options.limit || 30,
        sort: 'updated',
      });

      for (const pr of data) {
        // Filter by date if needed
        if (since && new Date(pr.updated_at) < since) continue;

        prs.push({
          id: `github:pr:${pr.id}`,
          type: 'pull_request',
          data: {
            id: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body,
            url: pr.html_url,
            state: pr.state,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            closed_at: pr.closed_at,
            merged_at: pr.merged_at,
            author: pr.user
              ? {
                  id: pr.user.id.toString(),
                  name: pr.user.login,
                  avatarUrl: pr.user.avatar_url,
                }
              : undefined,
            head_ref: pr.head.ref,
            base_ref: pr.base.ref,
            labels: pr.labels.map((l) => l.name),
            assignees: pr.assignees?.map((a) => ({
              id: a.id.toString(),
              name: a.login,
              avatarUrl: a.avatar_url,
            })),
          },
          metadata: {
            repository: repoFullName,
            draft: pr.draft,
          },
        });
      }
    } catch (error) {
      logger.error(`Failed to sync pull requests for ${repoFullName}`, error);
    }

    return prs;
  }

  private async syncCommits(_options: AdapterSyncOptions): Promise<SyncItem[]> {
    const commits: SyncItem[] = [];
    // For now, we'll skip commit sync as it can be very large
    // In a production system, this would sync recent commits across repos
    return commits;
  }

  // Webhook handling
  async verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean> {
    const signature = headers['x-hub-signature-256'];
    if (!signature) return false;

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret);
    hmac.update(payload);
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  async parseWebhook(body: any): Promise<WebhookEvent[]> {
    const events: WebhookEvent[] = [];
    const event = body;

    // Handle different webhook event types
    switch (event.action) {
      case 'opened':
      case 'closed':
      case 'reopened':
        if (event.issue) {
          events.push({
            type: 'issue',
            action: event.action,
            data: {
              id: event.issue.id,
              number: event.issue.number,
              title: event.issue.title,
              body: event.issue.body,
              html_url: event.issue.html_url,
              user: event.issue.user,
              repository: event.repository,
            },
          });
        } else if (event.pull_request) {
          events.push({
            type: 'pull_request',
            action: event.action,
            data: {
              id: event.pull_request.id,
              number: event.pull_request.number,
              title: event.pull_request.title,
              body: event.pull_request.body,
              html_url: event.pull_request.html_url,
              user: event.pull_request.user,
              repository: event.repository,
            },
          });
        }
        break;

      case 'created':
        if (event.comment) {
          events.push({
            type: 'comment',
            action: 'created',
            data: {
              id: event.comment.id,
              body: event.comment.body,
              html_url: event.comment.html_url,
              user: event.comment.user,
              parent: event.issue || event.pull_request,
              repository: event.repository,
            },
          });
        }
        break;

      case 'push':
        if (event.commits) {
          for (const commit of event.commits) {
            events.push({
              type: 'commit',
              action: 'pushed',
              data: {
                id: commit.id,
                message: commit.message,
                url: commit.url,
                author: commit.author,
                repository: event.repository,
              },
            });
          }
        }
        break;
    }

    return events;
  }

  // Optional search implementation
  async searchContent(credentials: PlatformCredentials, query: string): Promise<SyncItem[]> {
    this.octokit = new Octokit({ auth: credentials.accessToken });
    const items: SyncItem[] = [];

    try {
      // Search issues and PRs
      const { data } = await this.octokit.search.issuesAndPullRequests({
        q: query,
        per_page: 30,
      });

      for (const item of data.items) {
        const type = item.pull_request ? 'pull_request' : 'issue';
        items.push({
          id: `github:${type}:${item.id}`,
          type,
          data: {
            id: item.id,
            number: item.number,
            title: item.title,
            body: item.body,
            url: item.html_url,
            state: item.state,
            created_at: item.created_at,
            updated_at: item.updated_at,
            author: item.user
              ? {
                  id: item.user.id.toString(),
                  name: item.user.login,
                  avatarUrl: item.user.avatar_url,
                }
              : undefined,
          },
        });
      }
    } catch (error) {
      logger.error('GitHub search failed', error);
    }

    return items;
  }
}
