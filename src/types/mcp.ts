import { z } from 'zod';

// JSON-RPC types
export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: any;
}

// MCP specific types
export interface MCPServerConfig {
  name: string;
  version: string;
}

export interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  streaming?: boolean;
  realtime?: boolean;
}

export interface InitializeParams {
  protocolVersion: string;
  clientInfo: {
    name: string;
    version?: string;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: MCPCapabilities;
}

// Tool types
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  handler: ToolHandler;
}

export type ToolHandler = (params: any, context: RequestContext) => Promise<ToolResult>;

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: any;
    uri?: string;
  }>;
  isError?: boolean;
}

// Resource types
export interface ResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // base64
}

// Prompt types
export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PromptContent {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

// Context types
export interface RequestContext {
  request: JSONRPCRequest;
  session: any; // Session type from session manager
  connection: any; // MCPConnection from websocket
  startTime: number;
}

// Method handler type
export type MethodHandler = (context: RequestContext) => Promise<any>;
