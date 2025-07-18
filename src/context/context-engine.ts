import {
  PrismaClient,
  ContextNode as PrismaContextNode,
  ContextRelationship as PrismaContextRelationship,
} from '../generated/prisma';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  ContextNode,
  ContextRelation,
  SearchParams,
  SearchResult,
  TeamContext,
  ContextGraph,
  PlatformType,
  ContextNodeType,
  TeamMetrics,
  TimelineEvent,
  ActiveUser,
} from '../types/platform';
import { logger } from '../utils/logger';

export interface CreateContextParams {
  type: ContextNodeType;
  platform: PlatformType;
  teamId: string;
  userId: string;
  data: {
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
  };
  metadata?: Record<string, any>;
  relatedTo?: Array<{
    targetId: string;
    type: string;
    weight?: number;
  }>;
}

export interface TeamContextParams {
  teamId: string;
  depth: 'shallow' | 'deep';
  includeGraph?: boolean;
  includeMetrics?: boolean;
  timeRange?: {
    start?: Date;
    end?: Date;
  };
}

export class ContextEngine {
  private cache: Redis;

  constructor(
    private prisma: PrismaClient,
    cacheClient: Redis
  ) {
    this.cache = cacheClient;
  }

  async initialize() {
    logger.info('Context Engine: PostgreSQL-based engine initialized');
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    // Check cache
    const cacheKey = this.getCacheKey('search', params);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Build where clause
    const where: any = {
      teamId: params.teamId,
    };

    if (params.query) {
      where.OR = [
        { content: { path: ['title'], string_contains: params.query } },
        { content: { path: ['content'], string_contains: params.query } },
      ];
    }

    if (params.platforms?.length) {
      where.platform = { in: params.platforms };
    }

    if (params.types?.length) {
      where.type = { in: params.types };
    }

    if (params.timeRange?.start) {
      where.updatedAt = { ...where.updatedAt, gte: params.timeRange.start };
    }

    if (params.timeRange?.end) {
      where.updatedAt = { ...where.updatedAt, lte: params.timeRange.end };
    }

    // Perform search
    const nodes = await this.prisma.contextNode.findMany({
      where,
      include: {
        outgoingRelationships: {
          include: {
            target: true,
          },
        },
        incomingRelationships: {
          include: {
            source: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: params.offset || 0,
      take: params.limit || 20,
    });

    const searchResults: SearchResult[] = nodes.map((node) => ({
      node: this.prismaNodeToContextNode(node),
      score: 1.0, // Simple scoring for now
      relations: [
        ...node.outgoingRelationships.map((r) => this.prismaRelationToContextRelation(r)),
        ...node.incomingRelationships.map((r) => this.prismaRelationToContextRelation(r)),
      ],
    }));

    // Cache results
    await this.cache.setex(cacheKey, 300, JSON.stringify(searchResults)); // 5 minute cache

    return searchResults;
  }

  async getTeamContext(params: TeamContextParams): Promise<TeamContext> {
    const cacheKey = this.getCacheKey('team-context', params);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const [graph, timeline, metrics, activeUsers] = await Promise.all([
      params.includeGraph !== false ? this.getTeamGraph(params.teamId, params.depth) : null,
      this.getTeamTimeline(params.teamId, params.timeRange),
      params.includeMetrics !== false ? this.getTeamMetrics(params.teamId) : null,
      this.getActiveUsers(params.teamId),
    ]);

    const teamContext: TeamContext = {
      teamId: params.teamId,
      graph: graph || { nodes: [], edges: [] },
      timeline,
      metrics: metrics || this.getEmptyMetrics(),
      activeUsers,
      timestamp: new Date().toISOString(),
    };

    // Cache for 1 minute
    await this.cache.setex(cacheKey, 60, JSON.stringify(teamContext));

    return teamContext;
  }

  private async getTeamGraph(teamId: string, depth: 'shallow' | 'deep'): Promise<ContextGraph> {
    const maxDepth = depth === 'shallow' ? 1 : 2;

    // Use recursive CTE for graph traversal
    const result = await this.prisma.$queryRaw<any[]>`
      WITH RECURSIVE context_graph AS (
        -- Base case: get initial nodes
        SELECT 
          n.*,
          0 as depth,
          ARRAY[n.id]::uuid[] as path
        FROM context_nodes n
        WHERE n."teamId" = ${teamId}::uuid
        ORDER BY n."updatedAt" DESC
        LIMIT 100
        
        UNION ALL
        
        -- Recursive case: follow relationships
        SELECT 
          n.*,
          cg.depth + 1,
          cg.path || n.id
        FROM context_nodes n
        JOIN context_relationships r ON (n.id = r."targetId" OR n.id = r."sourceId")
        JOIN context_graph cg ON (
          (r."sourceId" = cg.id AND r."targetId" = n.id) OR
          (r."targetId" = cg.id AND r."sourceId" = n.id)
        )
        WHERE cg.depth < ${maxDepth}
          AND n."teamId" = ${teamId}::uuid
          AND NOT n.id = ANY(cg.path) -- Prevent cycles
      )
      SELECT DISTINCT * FROM context_graph;
    `;

    // Get all relationships between the nodes
    const nodeIds = result.map((r) => r.id);
    const relationships = await this.prisma.contextRelationship.findMany({
      where: {
        AND: [{ sourceId: { in: nodeIds } }, { targetId: { in: nodeIds } }],
      },
    });

    const nodes = result.map((r) => this.prismaNodeToContextNode(r));
    const edges = relationships.map((r) => this.prismaRelationToContextRelation(r));

    return {
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        density: nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0,
      },
    };
  }

  private async getTeamTimeline(
    _teamId: string,
    _timeRange?: { start?: Date; end?: Date }
  ): Promise<TimelineEvent[]> {
    // For now, return empty array. In production, this would query audit logs
    return [];
  }

  private async getTeamMetrics(teamId: string): Promise<TeamMetrics> {
    // Get node counts by platform and type
    const [platformCounts, typeCounts, totalStats] = await Promise.all([
      this.prisma.contextNode.groupBy({
        by: ['platform'],
        where: { teamId },
        _count: true,
      }),
      this.prisma.contextNode.groupBy({
        by: ['type'],
        where: { teamId },
        _count: true,
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(DISTINCT n.id) as "totalNodes",
          COUNT(DISTINCT r.id) as "totalEdges"
        FROM context_nodes n
        LEFT JOIN context_relationships r ON (n.id = r."sourceId" OR n.id = r."targetId")
        WHERE n."teamId" = ${teamId}::uuid
      `,
    ]);

    const platformBreakdown = platformCounts.reduce(
      (acc, item) => {
        acc[item.platform as PlatformType] = item._count;
        return acc;
      },
      {} as Record<PlatformType, number>
    );

    const typeBreakdown = typeCounts.reduce(
      (acc, item) => {
        acc[item.type as ContextNodeType] = item._count;
        return acc;
      },
      {} as Record<ContextNodeType, number>
    );

    return {
      totalNodes: Number(totalStats[0]?.totalNodes || 0),
      totalEdges: Number(totalStats[0]?.totalEdges || 0),
      activeUsers: 0, // Will be calculated separately
      platformBreakdown,
      typeBreakdown,
      activityTrend: {
        period: 'day',
        data: [], // Would be calculated from time-series data
      },
    };
  }

  private getEmptyMetrics(): TeamMetrics {
    return {
      totalNodes: 0,
      totalEdges: 0,
      activeUsers: 0,
      platformBreakdown: {
        github: 0,
        slack: 0,
        jira: 0,
        linear: 0,
        notion: 0,
        discord: 0,
      } as Record<PlatformType, number>,
      typeBreakdown: {
        issue: 0,
        pull_request: 0,
        commit: 0,
        comment: 0,
        document: 0,
        message: 0,
        file: 0,
        thread: 0,
        task: 0,
      } as Record<ContextNodeType, number>,
      activityTrend: { period: 'day', data: [] },
    };
  }

  private async getActiveUsers(teamId: string): Promise<ActiveUser[]> {
    // Query from PostgreSQL for user data
    const users = await this.prisma.user.findMany({
      where: {
        memberships: {
          some: {
            teamId,
          },
        },
      },
      include: {
        connections: {
          where: {
            teamId,
            isActive: true,
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name || user.email,
      email: user.email,
      avatarUrl: user.avatarUrl || undefined,
      lastActive: new Date(), // Would be calculated from activity
      platforms: user.connections.map((c) => c.platform as PlatformType),
      contributionCount: 0, // Would be calculated from context nodes
    }));
  }

  async createContextNode(params: CreateContextParams): Promise<ContextNode> {
    const nodeId = uuidv4();

    // Create node in PostgreSQL
    const node = await this.prisma.contextNode.create({
      data: {
        id: nodeId,
        teamId: params.teamId,
        type: params.type,
        platform: params.platform,
        externalId: params.data.externalId,
        content: {
          title: params.data.title || null,
          content: params.data.content || null,
          url: params.data.url || null,
          author: params.data.author || null,
          userId: params.userId,
          ...params.metadata,
        },
      },
    });

    // Create relationships if specified
    if (params.relatedTo?.length) {
      await Promise.all(
        params.relatedTo.map((relation) =>
          this.prisma.contextRelationship.create({
            data: {
              sourceId: nodeId,
              targetId: relation.targetId,
              relationshipType: relation.type,
              weight: relation.weight || 1.0,
            },
          })
        )
      );
    }

    // Clear relevant caches
    await this.clearTeamCache(params.teamId);

    return this.prismaNodeToContextNode(node);
  }

  private prismaNodeToContextNode(node: PrismaContextNode | any): ContextNode {
    const content = typeof node.content === 'object' ? node.content : {};

    return {
      id: node.id,
      teamId: node.teamId,
      userId: content.userId || '',
      type: node.type as ContextNodeType,
      platform: node.platform as PlatformType,
      externalId: node.externalId,
      title: content.title || undefined,
      content: content.content || undefined,
      url: content.url || undefined,
      author: content.author || undefined,
      createdAt: node.createdAt instanceof Date ? node.createdAt : new Date(node.createdAt),
      updatedAt: node.updatedAt instanceof Date ? node.updatedAt : new Date(node.updatedAt),
      metadata: content,
    };
  }

  private prismaRelationToContextRelation(
    relation: PrismaContextRelationship | any
  ): ContextRelation {
    return {
      id: relation.id,
      sourceId: relation.sourceId,
      targetId: relation.targetId,
      type: relation.relationshipType,
      weight: relation.weight || 1.0,
      metadata: relation.metadata || undefined,
    };
  }

  private getCacheKey(type: string, params: any): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {} as any);
    return `context:${type}:${JSON.stringify(sortedParams)}`;
  }

  private async clearTeamCache(teamId: string) {
    const pattern = `context:*${teamId}*`;
    const keys = await this.cache.keys(pattern);
    if (keys.length > 0) {
      await this.cache.del(...keys);
    }
  }

  async shutdown() {
    // No special shutdown needed for PostgreSQL
    logger.info('Context Engine: Shutdown complete');
  }
}
