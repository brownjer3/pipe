import { z } from 'zod';

// Base platform types
export type PlatformType = 'github' | 'slack' | 'jira' | 'linear' | 'notion' | 'discord';

export interface PlatformCredentials {
  teamId: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string[];
  metadata?: Record<string, any>;
}

export interface SyncOptions {
  full?: boolean;
  since?: Date | null;
  filters?: Record<string, any>;
  limit?: number;
}

export interface SyncItem {
  id: string;
  type: string;
  data: Record<string, any>;
  relatedTo?: string[];
  metadata?: Record<string, any>;
}

export interface SyncResult {
  platform: PlatformType;
  teamId: string;
  items: SyncItem[];
  totalSynced: number;
  errors: SyncError[];
  nextCursor?: string;
  metadata?: Record<string, any>;
}

export interface SyncError {
  itemId?: string;
  error: string;
  timestamp: Date;
  retryable: boolean;
}

export interface WebhookEvent {
  type: string;
  action?: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface AdapterSyncOptions {
  since?: string | null;
  filters?: Record<string, any>;
  limit?: number;
}

// Platform adapter interface
export interface PlatformAdapter {
  name: PlatformType;

  // Authentication
  getOAuthUrl(state: string, redirectUri: string): string;
  exchangeCodeForToken(code: string, redirectUri: string): Promise<PlatformCredentials>;
  refreshToken?(credentials: PlatformCredentials): Promise<PlatformCredentials>;
  validateCredentials(credentials: PlatformCredentials): Promise<boolean>;

  // Sync operations
  sync(credentials: PlatformCredentials, options: AdapterSyncOptions): Promise<SyncResult>;

  // Webhook handling
  verifyWebhook(headers: Record<string, string>, body: any): Promise<boolean>;
  parseWebhook(body: any): Promise<WebhookEvent[]>;

  // Resource-specific operations (optional)
  searchContent?(credentials: PlatformCredentials, query: string): Promise<SyncItem[]>;
  getItem?(credentials: PlatformCredentials, itemId: string): Promise<SyncItem | null>;
}

// Context node types
export interface ContextNode {
  id: string;
  teamId: string;
  userId: string;
  type: ContextNodeType;
  platform: PlatformType;
  externalId: string;
  title?: string;
  content?: string;
  url?: string;
  author?: {
    id: string;
    name: string;
    email?: string;
    avatarUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export type ContextNodeType =
  | 'issue'
  | 'pull_request'
  | 'commit'
  | 'comment'
  | 'message'
  | 'document'
  | 'task'
  | 'thread'
  | 'file';

export interface ContextRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  weight?: number;
  metadata?: Record<string, any>;
}

export type RelationType =
  | 'references'
  | 'replies_to'
  | 'mentions'
  | 'blocks'
  | 'relates_to'
  | 'child_of'
  | 'duplicates';

// Context search types
export interface SearchParams {
  teamId: string;
  userId?: string;
  query: string;
  platforms?: PlatformType[];
  types?: ContextNodeType[];
  timeRange?: {
    start?: Date;
    end?: Date;
  };
  limit?: number;
  offset?: number;
  semantic?: boolean;
}

export interface SearchResult {
  node: ContextNode;
  score: number;
  highlights?: string[];
  relations?: ContextRelation[];
}

// Team context types
export interface TeamContext {
  teamId: string;
  graph: ContextGraph;
  timeline: TimelineEvent[];
  metrics: TeamMetrics;
  activeUsers: ActiveUser[];
  timestamp: string;
}

export interface ContextGraph {
  nodes: ContextNode[];
  edges: ContextRelation[];
  stats?: {
    nodeCount: number;
    edgeCount: number;
    density: number;
  };
}

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  actor: {
    id: string;
    name: string;
  };
  action: string;
  target?: {
    id: string;
    type: string;
    title: string;
  };
  platform: PlatformType;
}

export interface TeamMetrics {
  totalNodes: number;
  totalEdges: number;
  activeUsers: number;
  platformBreakdown: Record<PlatformType, number>;
  typeBreakdown: Record<ContextNodeType, number>;
  activityTrend: {
    period: string;
    data: { date: string; count: number }[];
  };
}

export interface ActiveUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  lastActive: Date;
  platforms: PlatformType[];
  contributionCount: number;
}

// Platform-specific configuration
export interface PlatformConfig {
  clientId?: string;
  clientSecret?: string;
  webhookSecret?: string;
  apiUrl?: string;
  scopes?: string[];
  rateLimit?: {
    requests: number;
    window: number; // in seconds
  };
}

// Job types for background processing
export interface SyncJob {
  id: string;
  platform: PlatformType;
  userId: string;
  teamId: string;
  type: 'full' | 'incremental';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: SyncResult;
}

export interface WebhookJob {
  id: string;
  platform: PlatformType;
  event: WebhookEvent;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  error?: string;
  processedAt?: Date;
}

// Validation schemas
export const SearchParamsSchema = z.object({
  query: z.string().min(1),
  platforms: z.array(z.enum(['github', 'slack', 'jira', 'linear', 'notion'])).optional(),
  timeRange: z
    .object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    })
    .optional(),
  limit: z.number().int().min(1).max(100).default(20),
  semantic: z.boolean().default(false),
});

export const SyncPlatformSchema = z.object({
  platform: z.enum(['github', 'slack', 'jira', 'linear', 'notion', 'all']),
  full: z.boolean().default(false),
});
