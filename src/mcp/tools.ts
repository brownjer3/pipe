import { z } from 'zod';
import { MCPProtocolHandler } from './protocol-handler';
import { ContextEngine } from '../context/context-engine';
import { PlatformManager } from '../platforms/platform-manager';
import { QueueManager } from '../jobs/queue-manager';
import { SearchParamsSchema, SyncPlatformSchema } from '../types/platform';
import { logger } from '../utils/logger';

export function registerMCPTools(
  protocolHandler: MCPProtocolHandler,
  contextEngine: ContextEngine,
  platformManager: PlatformManager,
  queueManager: QueueManager
) {
  // Search Context Tool
  protocolHandler.registerTool({
    name: 'search_context',
    description: 'Search across all connected platforms for relevant context',
    inputSchema: SearchParamsSchema,
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        const searchParams = {
          ...params,
          teamId: session.teamId,
          userId: session.userId,
        };

        const results = await contextEngine.search(searchParams);

        // Stream results if large
        if (results.length > 50) {
          return protocolHandler.streamResults(results, context);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: params.query,
                  totalResults: results.length,
                  results: results.map((r) => ({
                    ...r.node,
                    score: r.score,
                    highlights: r.highlights,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('search_context tool error', { error: error.message });
        throw error;
      }
    },
  });

  // Get Team Context Tool
  protocolHandler.registerTool({
    name: 'get_team_context',
    description: 'Get current team collaboration context and activity',
    inputSchema: z.object({
      depth: z.enum(['shallow', 'deep']).default('shallow'),
      includeGraph: z.boolean().default(false),
      includeMetrics: z.boolean().default(true),
      timeRange: z
        .object({
          start: z.string().datetime().optional(),
          end: z.string().datetime().optional(),
        })
        .optional(),
    }),
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        const teamContext = await contextEngine.getTeamContext({
          teamId: session.teamId,
          depth: params.depth,
          includeGraph: params.includeGraph,
          includeMetrics: params.includeMetrics,
          timeRange: params.timeRange
            ? {
                start: params.timeRange.start ? new Date(params.timeRange.start) : undefined,
                end: params.timeRange.end ? new Date(params.timeRange.end) : undefined,
              }
            : undefined,
        });

        // Broadcast to team members if deep context
        if (params.depth === 'deep') {
          // This would be implemented with the WebSocket broadcast functionality
          logger.info('Broadcasting deep team context update', { teamId: session.teamId });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(teamContext, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('get_team_context tool error', { error: error.message });
        throw error;
      }
    },
  });

  // Synthesize Context Tool
  protocolHandler.registerTool({
    name: 'synthesize_context',
    description: 'AI-powered synthesis of multiple context nodes',
    inputSchema: z.object({
      contextIds: z.array(z.string().uuid()).min(1),
      format: z.enum(['summary', 'timeline', 'insights', 'recommendations']).default('summary'),
      stream: z.boolean().default(false),
    }),
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        // For now, return a placeholder response
        // In production, this would call an AI service to synthesize the context
        const synthesis = {
          format: params.format,
          contextIds: params.contextIds,
          synthesis: `This is a ${params.format} synthesis of ${params.contextIds.length} context nodes.`,
          metadata: {
            synthesizedAt: new Date().toISOString(),
            userId: session.userId,
            teamId: session.teamId,
          },
        };

        if (params.stream) {
          // Streaming synthesis would be implemented here
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ streaming: true, initial: synthesis }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(synthesis, null, 2),
            },
          ],
        };
      } catch (error: any) {
        logger.error('synthesize_context tool error', { error: error.message });
        throw error;
      }
    },
  });

  // Sync Platform Tool
  protocolHandler.registerTool({
    name: 'sync_platform',
    description: 'Trigger synchronization with a connected platform',
    inputSchema: SyncPlatformSchema,
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        // Handle 'all' platform sync
        if (params.platform === 'all') {
          const connections = await platformManager.getActiveConnections(session.teamId);
          const jobs = [];

          for (const conn of connections) {
            const job = await queueManager.enqueueSyncJob(
              conn.platform,
              session.userId,
              session.teamId,
              params.full ? 'full' : 'incremental'
            );
            jobs.push({
              platform: conn.platform,
              jobId: job.id,
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: `Sync jobs started for ${jobs.length} platforms`,
                    jobs,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Single platform sync
        const job = await queueManager.enqueueSyncJob(
          params.platform,
          session.userId,
          session.teamId,
          params.full ? 'full' : 'incremental'
        );

        // Set up real-time progress updates (would be implemented with WebSocket)
        logger.info('Sync job enqueued', {
          jobId: job.id,
          platform: params.platform,
          type: params.full ? 'full' : 'incremental',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: `Sync job started for ${params.platform}`,
                  jobId: job.id,
                  type: params.full ? 'full' : 'incremental',
                  status: 'pending',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('sync_platform tool error', { error: error.message });
        throw error;
      }
    },
  });

  // List Connected Platforms Tool
  protocolHandler.registerTool({
    name: 'list_platforms',
    description: 'List all connected platforms for the current team',
    inputSchema: z.object({}),
    handler: async (_params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        const connections = await platformManager.getActiveConnections(session.teamId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  teamId: session.teamId,
                  platforms: connections,
                  totalUsers: connections.reduce((sum, c) => sum + c.users, 0),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('list_platforms tool error', { error: error.message });
        throw error;
      }
    },
  });

  // Get Sync Status Tool
  protocolHandler.registerTool({
    name: 'get_sync_status',
    description: 'Get synchronization status for platforms',
    inputSchema: z.object({
      platform: z.enum(['github', 'slack', 'jira', 'linear', 'notion', 'all']).optional(),
    }),
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        // Get queue statistics
        const queueStats = await queueManager.getQueueStats('platform:sync');

        // For now, return queue stats
        // In production, this would also query the database for sync history
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  queueStatus: queueStats,
                  platform: params.platform || 'all',
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('get_sync_status tool error', { error: error.message });
        throw error;
      }
    },
  });

  // Create Context Node Tool (for manual context creation)
  protocolHandler.registerTool({
    name: 'create_context',
    description: 'Manually create a context node',
    inputSchema: z.object({
      type: z.enum(['note', 'task', 'document', 'message']),
      title: z.string(),
      content: z.string().optional(),
      url: z.string().url().optional(),
      relatedTo: z.array(z.string().uuid()).optional(),
    }),
    handler: async (params, context) => {
      try {
        const session = context.session;
        if (!session) {
          throw new Error('Session required');
        }

        const node = await contextEngine.createContextNode({
          type: params.type as any,
          platform: 'github', // Default to github for manual entries
          teamId: session.teamId,
          userId: session.userId,
          data: {
            externalId: `manual-${Date.now()}`,
            title: params.title,
            content: params.content,
            url: params.url,
          },
          metadata: {
            source: 'manual',
            createdVia: 'mcp_tool',
          },
          relatedTo: params.relatedTo?.map((id: any) => ({
            targetId: id,
            type: 'relates_to',
          })),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  message: 'Context node created',
                  node,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error('create_context tool error', { error: error.message });
        throw error;
      }
    },
  });

  logger.info('MCP tools registered', {
    tools: [
      'search_context',
      'get_team_context',
      'synthesize_context',
      'sync_platform',
      'list_platforms',
      'get_sync_status',
      'create_context',
    ],
  });
}
