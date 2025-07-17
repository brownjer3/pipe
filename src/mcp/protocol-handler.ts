import { EventEmitter } from 'events';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  MCPServerConfig,
  MethodHandler,
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
  RequestContext,
  InitializeParams,
  InitializeResult,
  ToolResult,
} from '../types/mcp';
import { MCPConnection } from '../types/websocket';
import { MCPError } from '../utils/errors';
import { logger } from '../utils/logger';

export class MCPProtocolHandler extends EventEmitter {
  private handlers = new Map<string, MethodHandler>();
  private tools = new Map<string, ToolDefinition>();
  private resources = new Map<string, ResourceDefinition>();
  private prompts = new Map<string, PromptDefinition>();
  private initialized = new Set<string>(); // Track initialized connections

  constructor(
    private config: MCPServerConfig,
    private contextEngine?: any, // Will be injected when available
    private sessionManager?: any // Will be injected when available
  ) {
    super();
    this.registerCoreHandlers();
  }

  async handleMessage(message: string, connection: MCPConnection): Promise<void> {
    try {
      const request = this.parseRequest(message);

      // Create request context
      const context: RequestContext = {
        request,
        session: null, // Will be populated by session manager
        connection,
        startTime: Date.now(),
      };

      // Get or create session if session manager is available
      if (this.sessionManager) {
        context.session = await this.sessionManager.getOrCreate(connection);
      }

      // Check if connection is initialized for protected methods
      if (!this.isPublicMethod(request.method) && !this.initialized.has(connection.id)) {
        throw new MCPError('Client must call initialize first', -32002);
      }

      // Route to appropriate handler
      const handler = this.handlers.get(request.method);
      if (!handler) {
        throw new MCPError(`Method not found: ${request.method}`, -32601);
      }

      const result = await handler(context);

      // Send response if request has an ID
      if (request.id !== undefined) {
        const response: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: request.id,
          result,
        };

        connection.send(JSON.stringify(response));
      }

      // Emit metrics
      this.emit('request:complete', {
        method: request.method,
        duration: Date.now() - context.startTime,
        connectionId: connection.id,
      });
    } catch (error) {
      this.handleError(error, connection, message);
    }
  }

  private parseRequest(message: string): JSONRPCRequest {
    try {
      const parsed = JSON.parse(message);

      // Validate JSON-RPC structure
      if (parsed.jsonrpc !== '2.0') {
        throw new MCPError('Invalid JSON-RPC version', -32600);
      }

      if (!parsed.method || typeof parsed.method !== 'string') {
        throw new MCPError('Invalid method', -32600);
      }

      return parsed as JSONRPCRequest;
    } catch (error) {
      if (error instanceof MCPError) throw error;
      throw new MCPError('Parse error', -32700);
    }
  }

  private handleError(error: any, connection: MCPConnection, originalMessage?: string) {
    logger.error('MCP Protocol error', {
      error: error.message,
      stack: error.stack,
      connectionId: connection.id,
    });

    let request: JSONRPCRequest | undefined;
    try {
      if (originalMessage) {
        request = JSON.parse(originalMessage);
      }
    } catch {}

    const errorResponse: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: request?.id,
      error: {
        code: error instanceof MCPError ? error.code : -32603,
        message: error.message || 'Internal error',
        data: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
    };

    connection.send(JSON.stringify(errorResponse));
  }

  private isPublicMethod(method: string): boolean {
    return ['initialize', 'initialized'].includes(method);
  }

  private registerCoreHandlers() {
    // Initialize handler
    this.handlers.set('initialize', async (context: RequestContext) => {
      const params = context.request.params as InitializeParams;

      // Validate params
      if (!params.protocolVersion) {
        throw new MCPError('Missing protocol version', -32602);
      }

      // Mark connection as initialized
      this.initialized.add(context.connection.id);

      const result: InitializeResult = {
        protocolVersion: '1.0',
        serverInfo: {
          name: this.config.name,
          version: this.config.version,
        },
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
          streaming: true,
          realtime: true,
        },
      };

      return result;
    });

    // Initialized notification handler
    this.handlers.set('initialized', async (context: RequestContext) => {
      // Client confirms initialization complete
      logger.info('Client initialized', {
        connectionId: context.connection.id,
      });
      return null; // No response for notifications
    });

    // Tools handlers
    this.handlers.set('tools/list', async (context: RequestContext) => {
      const tools = Array.from(this.tools.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: this.zodToJsonSchema(tool.inputSchema),
      }));

      return { tools };
    });

    this.handlers.set('tools/call', async (context: RequestContext) => {
      const { name, arguments: args } = context.request.params;

      const tool = this.tools.get(name);
      if (!tool) {
        throw new MCPError(`Tool not found: ${name}`, -32602);
      }

      // Validate arguments
      try {
        const validatedArgs = tool.inputSchema.parse(args);
        const result = await tool.handler(validatedArgs, context);
        return result;
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new MCPError(`Invalid arguments: ${error.message}`, -32602);
        }
        throw error;
      }
    });

    // Resources handlers
    this.handlers.set('resources/list', async (context: RequestContext) => {
      const resources = Array.from(this.resources.values());
      return { resources };
    });

    this.handlers.set('resources/read', async (context: RequestContext) => {
      const { uri } = context.request.params;

      // In a real implementation, this would fetch the resource content
      // For now, return a placeholder
      return {
        uri,
        mimeType: 'text/plain',
        text: `Content of resource: ${uri}`,
      };
    });

    // Prompts handlers
    this.handlers.set('prompts/list', async (context: RequestContext) => {
      const prompts = Array.from(this.prompts.values());
      return { prompts };
    });

    this.handlers.set('prompts/get', async (context: RequestContext) => {
      const { name } = context.request.params;

      const prompt = this.prompts.get(name);
      if (!prompt) {
        throw new MCPError(`Prompt not found: ${name}`, -32602);
      }

      // In a real implementation, this would generate the prompt content
      return {
        messages: [
          {
            role: 'system',
            content: `This is the ${name} prompt`,
          },
        ],
      };
    });

    // Custom Pipe extensions
    this.handlers.set('pipe/subscribe', async (context: RequestContext) => {
      const { channels } = context.request.params;

      // Subscribe to specified channels
      // Implementation would integrate with pub/sub system

      return { subscribed: channels };
    });

    this.handlers.set('pipe/stream', async (context: RequestContext) => {
      const { streamId, action } = context.request.params;

      // Handle stream control
      if (action === 'start') {
        // Start streaming
      } else if (action === 'stop') {
        // Stop streaming
      }

      return { status: 'ok' };
    });
  }

  // Register a tool
  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
    logger.info('Tool registered', { name: tool.name });
  }

  // Register a resource
  registerResource(resource: ResourceDefinition) {
    this.resources.set(resource.uri, resource);
    logger.info('Resource registered', { uri: resource.uri });
  }

  // Register a prompt
  registerPrompt(prompt: PromptDefinition) {
    this.prompts.set(prompt.name, prompt);
    logger.info('Prompt registered', { name: prompt.name });
  }

  // Stream results for large responses
  async streamResults(results: any[], context: RequestContext): Promise<any> {
    const streamId = uuidv4();
    const connection = context.connection;

    // Send initial response with stream ID
    const initialResponse = {
      stream: true,
      streamId,
      totalItems: results.length,
    };

    // If this is a request with ID, we already sent the response
    // For streaming, we'll send additional messages

    // Stream chunks
    const chunkSize = 10;
    for (let i = 0; i < results.length; i += chunkSize) {
      const chunk = results.slice(i, i + chunkSize);

      connection.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'stream:chunk',
          params: {
            streamId,
            items: chunk,
            progress: (i + chunk.length) / results.length,
          },
        })
      );

      // Allow other operations
      await new Promise((resolve) => setImmediate(resolve));
    }

    // Send completion
    connection.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'stream:complete',
        params: { streamId },
      })
    );

    return initialResponse;
  }

  // Convert Zod schema to JSON Schema (simplified)
  private zodToJsonSchema(schema: z.ZodType<any>): any {
    // This is a simplified version. In production, use a proper converter
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: any = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodType<any>);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    }

    if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    }

    if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }

    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodToJsonSchema(schema.element),
      };
    }

    // Default fallback
    return { type: 'any' };
  }

  // Cleanup on connection close
  onConnectionClose(connectionId: string) {
    this.initialized.delete(connectionId);
  }
}
