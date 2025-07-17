import { vi } from 'vitest';
import { createMCPRequest, createMCPResponse, createMCPError } from '@test/utils/test-factory';

/**
 * MCP Protocol test fixtures and utilities
 */

/**
 * Common MCP test messages
 */
export const mcpMessages = {
  // Initialize
  initializeRequest: createMCPRequest('initialize', {
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
    },
  }),

  initializeResponse: createMCPResponse({
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
      streaming: true,
    },
    serverInfo: {
      name: 'pipe-mcp-server',
      version: '1.0.0',
    },
  }),

  // Tools
  toolsListRequest: createMCPRequest('tools/list'),

  toolsListResponse: createMCPResponse({
    tools: [
      {
        name: 'search-context',
        description: 'Search across all connected platforms',
        schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            platforms: { type: 'array', items: { type: 'string' } },
          },
          required: ['query'],
        },
      },
    ],
  }),

  // Resources
  resourcesListRequest: createMCPRequest('resources/list'),

  resourcesListResponse: createMCPResponse({
    resources: [
      {
        uri: 'context://issues',
        name: 'Issues',
        description: 'All issues from connected platforms',
      },
    ],
  }),

  // Errors
  methodNotFoundError: createMCPError(-32601, 'Method not found'),
  invalidParamsError: createMCPError(-32602, 'Invalid params'),
  internalError: createMCPError(-32603, 'Internal error'),
};

/**
 * Create a mock MCP protocol handler
 */
export const createMockMCPHandler = () => {
  return {
    handleMessage: vi.fn().mockImplementation((message) => {
      switch (message.method) {
        case 'initialize':
          return mcpMessages.initializeResponse;
        case 'tools/list':
          return mcpMessages.toolsListResponse;
        case 'resources/list':
          return mcpMessages.resourcesListResponse;
        default:
          return mcpMessages.methodNotFoundError;
      }
    }),

    handleStreamingMessage: vi.fn().mockImplementation(async function* (message) {
      yield { partial: true, data: 'chunk1' };
      yield { partial: true, data: 'chunk2' };
      yield { partial: false, data: 'final' };
    }),

    registerTool: vi.fn(),
    registerResource: vi.fn(),
    registerPrompt: vi.fn(),
  };
};

/**
 * MCP message builder for complex scenarios
 */
export class MCPTestMessageBuilder {
  private message: any = {
    jsonrpc: '2.0',
    id: 1,
  };

  static request() {
    return new MCPTestMessageBuilder();
  }

  static response() {
    return new MCPTestMessageBuilder();
  }

  withId(id: number | string) {
    this.message.id = id;
    return this;
  }

  withMethod(method: string) {
    this.message.method = method;
    return this;
  }

  withParams(params: any) {
    this.message.params = params;
    return this;
  }

  withResult(result: any) {
    this.message.result = result;
    return this;
  }

  withError(code: number, message: string, data?: any) {
    this.message.error = { code, message, data };
    return this;
  }

  build() {
    return this.message;
  }
}

/**
 * Mock WebSocket for MCP testing
 */
export const createMockMCPWebSocket = () => {
  const sentMessages: any[] = [];
  const messageHandlers: ((data: any) => void)[] = [];

  return {
    send: vi.fn().mockImplementation((data) => {
      const message = typeof data === 'string' ? JSON.parse(data) : data;
      sentMessages.push(message);
    }),

    on: vi.fn().mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      }
    }),

    close: vi.fn(),

    // Test utilities
    receiveMessage: (message: any) => {
      const data = typeof message === 'object' ? JSON.stringify(message) : message;
      messageHandlers.forEach((handler) => handler(data));
    },

    getSentMessages: () => sentMessages,
    clearSentMessages: () => (sentMessages.length = 0),
  };
};

/**
 * Test helper for validating MCP schema conversion
 */
export const validateMCPSchema = (schema: any): boolean => {
  // Check if it's a valid JSON Schema
  return (
    typeof schema === 'object' &&
    (schema.type || schema.$ref || schema.oneOf || schema.anyOf || schema.allOf)
  );
};
