import { PrismaClient } from '@prisma/client';
import neo4j, { Driver, Session } from 'neo4j-driver';
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
  private neo4jDriver: Driver;
  private cache: Redis;

  constructor(
    private prisma: PrismaClient,
    neo4jUrl: string,
    neo4jAuth: { username: string; password: string },
    cacheClient: Redis
  ) {
    this.neo4jDriver = neo4j.driver(
      neo4jUrl,
      neo4j.auth.basic(neo4jAuth.username, neo4jAuth.password)
    );
    this.cache = cacheClient;
  }

  async initialize() {
    // Verify Neo4j connection
    const session = this.neo4jDriver.session();
    try {
      await session.run('RETURN 1');
      logger.info('Context Engine: Neo4j connection established');

      // Create constraints and indexes
      await this.createConstraintsAndIndexes();
    } finally {
      await session.close();
    }
  }

  private async createConstraintsAndIndexes() {
    const session = this.neo4jDriver.session();
    try {
      // Create unique constraint on Context id
      await session.run(
        'CREATE CONSTRAINT context_id_unique IF NOT EXISTS FOR (c:Context) REQUIRE c.id IS UNIQUE'
      );

      // Create indexes for common queries
      await session.run('CREATE INDEX context_team_id IF NOT EXISTS FOR (c:Context) ON (c.teamId)');
      await session.run(
        'CREATE INDEX context_platform IF NOT EXISTS FOR (c:Context) ON (c.platform)'
      );
      await session.run('CREATE INDEX context_type IF NOT EXISTS FOR (c:Context) ON (c.type)');
      await session.run(
        'CREATE INDEX context_external_id IF NOT EXISTS FOR (c:Context) ON (c.externalId)'
      );

      logger.info('Context Engine: Neo4j constraints and indexes created');
    } finally {
      await session.close();
    }
  }

  async search(params: SearchParams): Promise<SearchResult[]> {
    // Check cache
    const cacheKey = this.getCacheKey('search', params);
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Perform search in Neo4j
    const session = this.neo4jDriver.session();
    try {
      const query = this.buildSearchQuery(params);
      const result = await session.run(query.cypher, query.params);

      const searchResults: SearchResult[] = result.records.map((record) => {
        const node = record.get('n').properties;
        const score = record.get('score') || 1.0;
        const relations = record.get('relations') || [];

        return {
          node: this.neo4jNodeToContextNode(node),
          score,
          relations: relations.map((r: any) => this.neo4jRelationToContextRelation(r)),
        };
      });

      // Cache results
      await this.cache.setex(cacheKey, 300, JSON.stringify(searchResults)); // 5 minute cache

      return searchResults;
    } finally {
      await session.close();
    }
  }

  private buildSearchQuery(params: SearchParams) {
    const conditions: string[] = ['n.teamId = $teamId'];
    const queryParams: any = { teamId: params.teamId };

    if (params.query) {
      conditions.push('(n.title CONTAINS $query OR n.content CONTAINS $query)');
      queryParams.query = params.query;
    }

    if (params.platforms?.length) {
      conditions.push('n.platform IN $platforms');
      queryParams.platforms = params.platforms;
    }

    if (params.types?.length) {
      conditions.push('n.type IN $types');
      queryParams.types = params.types;
    }

    if (params.timeRange?.start) {
      conditions.push('n.updatedAt >= $startTime');
      queryParams.startTime = params.timeRange.start.toISOString();
    }

    if (params.timeRange?.end) {
      conditions.push('n.updatedAt <= $endTime');
      queryParams.endTime = params.timeRange.end.toISOString();
    }

    const cypher = `
      MATCH (n:Context)
      WHERE ${conditions.join(' AND ')}
      OPTIONAL MATCH (n)-[r]-(related:Context)
      WITH n, collect(r) as relations
      RETURN n, relations, 1.0 as score
      ORDER BY n.updatedAt DESC
      SKIP $offset
      LIMIT $limit
    `;

    queryParams.offset = params.offset || 0;
    queryParams.limit = params.limit || 20;

    return { cypher, params: queryParams };
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
    const session = this.neo4jDriver.session();
    try {
      const maxDepth = depth === 'shallow' ? 1 : 3;
      const query = `
        MATCH (n:Context {teamId: $teamId})
        WITH n
        ORDER BY n.updatedAt DESC
        LIMIT 100
        MATCH path = (n)-[r*0..${maxDepth}]-(related:Context)
        WHERE related.teamId = $teamId
        WITH collect(DISTINCT n) + collect(DISTINCT related) as allNodes,
             collect(DISTINCT r) as allRelations
        UNWIND allNodes as node
        WITH collect(DISTINCT node) as nodes, allRelations
        UNWIND allRelations as relations
        UNWIND relations as rel
        WITH nodes, collect(DISTINCT rel) as edges
        RETURN nodes, edges
      `;

      const result = await session.run(query, { teamId });

      if (result.records.length === 0) {
        return { nodes: [], edges: [] };
      }

      const record = result.records[0];
      const nodes = (record.get('nodes') || []).map((n: any) =>
        this.neo4jNodeToContextNode(n.properties)
      );
      const edges = (record.get('edges') || []).map((e: any) =>
        this.neo4jRelationToContextRelation(e)
      );

      return {
        nodes,
        edges,
        stats: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          density: nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0,
        },
      };
    } finally {
      await session.close();
    }
  }

  private async getTeamTimeline(
    teamId: string,
    timeRange?: { start?: Date; end?: Date }
  ): Promise<TimelineEvent[]> {
    // For now, return mock data. In production, this would query audit logs
    return [];
  }

  private async getTeamMetrics(teamId: string): Promise<TeamMetrics> {
    const session = this.neo4jDriver.session();
    try {
      const query = `
        MATCH (n:Context {teamId: $teamId})
        WITH count(n) as totalNodes,
             count(DISTINCT n.platform) as platformCount,
             collect(DISTINCT n.platform) as platforms,
             collect(DISTINCT n.type) as types
        MATCH ()-[r]->()
        WHERE startNode(r).teamId = $teamId AND endNode(r).teamId = $teamId
        WITH totalNodes, platformCount, platforms, types, count(r) as totalEdges
        MATCH (n:Context {teamId: $teamId})
        RETURN totalNodes, totalEdges,
               reduce(map = {}, p IN platforms | map + {[p]: size([x IN collect(n) WHERE x.platform = p])}) as platformBreakdown,
               reduce(map = {}, t IN types | map + {[t]: size([x IN collect(n) WHERE x.type = t])}) as typeBreakdown
      `;

      const result = await session.run(query, { teamId });
      const record = result.records[0];

      return {
        totalNodes: record.get('totalNodes').toNumber(),
        totalEdges: record.get('totalEdges').toNumber(),
        activeUsers: 0, // Will be calculated separately
        platformBreakdown: record.get('platformBreakdown') || {},
        typeBreakdown: record.get('typeBreakdown') || {},
        activityTrend: {
          period: 'day',
          data: [], // Would be calculated from time-series data
        },
      };
    } catch (error) {
      logger.error('Failed to get team metrics', error);
      return this.getEmptyMetrics();
    } finally {
      await session.close();
    }
  }

  private getEmptyMetrics(): TeamMetrics {
    return {
      totalNodes: 0,
      totalEdges: 0,
      activeUsers: 0,
      platformBreakdown: {},
      typeBreakdown: {},
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
    const session = this.neo4jDriver.session();
    const nodeId = uuidv4();

    try {
      // Create node in Neo4j
      const createQuery = `
        CREATE (n:Context {
          id: $id,
          teamId: $teamId,
          userId: $userId,
          type: $type,
          platform: $platform,
          externalId: $externalId,
          title: $title,
          content: $content,
          url: $url,
          authorId: $authorId,
          authorName: $authorName,
          authorEmail: $authorEmail,
          authorAvatarUrl: $authorAvatarUrl,
          createdAt: datetime(),
          updatedAt: datetime(),
          metadata: $metadata
        })
        RETURN n
      `;

      const nodeParams = {
        id: nodeId,
        teamId: params.teamId,
        userId: params.userId,
        type: params.type,
        platform: params.platform,
        externalId: params.data.externalId,
        title: params.data.title || null,
        content: params.data.content || null,
        url: params.data.url || null,
        authorId: params.data.author?.id || null,
        authorName: params.data.author?.name || null,
        authorEmail: params.data.author?.email || null,
        authorAvatarUrl: params.data.author?.avatarUrl || null,
        metadata: JSON.stringify(params.metadata || {}),
      };

      const result = await session.run(createQuery, nodeParams);
      const createdNode = result.records[0].get('n').properties;

      // Create relationships if specified
      if (params.relatedTo?.length) {
        for (const relation of params.relatedTo) {
          await this.createRelation(
            session,
            nodeId,
            relation.targetId,
            relation.type,
            relation.weight
          );
        }
      }

      // Clear relevant caches
      await this.clearTeamCache(params.teamId);

      return this.neo4jNodeToContextNode(createdNode);
    } finally {
      await session.close();
    }
  }

  private async createRelation(
    session: Session,
    sourceId: string,
    targetId: string,
    type: string,
    weight?: number
  ) {
    const query = `
      MATCH (source:Context {id: $sourceId})
      MATCH (target:Context {id: $targetId})
      CREATE (source)-[r:${type} {
        id: $id,
        weight: $weight,
        createdAt: datetime()
      }]->(target)
      RETURN r
    `;

    await session.run(query, {
      sourceId,
      targetId,
      id: uuidv4(),
      weight: weight || 1.0,
    });
  }

  private neo4jNodeToContextNode(node: any): ContextNode {
    return {
      id: node.id,
      teamId: node.teamId,
      userId: node.userId,
      type: node.type as ContextNodeType,
      platform: node.platform as PlatformType,
      externalId: node.externalId,
      title: node.title || undefined,
      content: node.content || undefined,
      url: node.url || undefined,
      author: node.authorId
        ? {
            id: node.authorId,
            name: node.authorName,
            email: node.authorEmail || undefined,
            avatarUrl: node.authorAvatarUrl || undefined,
          }
        : undefined,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
      metadata: typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata || {},
    };
  }

  private neo4jRelationToContextRelation(relation: any): ContextRelation {
    return {
      id: relation.properties.id,
      sourceId: relation.startNodeElementId,
      targetId: relation.endNodeElementId,
      type: relation.type,
      weight: relation.properties.weight || 1.0,
      metadata: relation.properties.metadata ? JSON.parse(relation.properties.metadata) : undefined,
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
    await this.neo4jDriver.close();
  }
}
