import { WebSocket } from 'ws';

export interface MCPConnection {
  id: string;
  ws: WebSocket;
  userId: string;
  teamId: string;
  metadata: {
    ip?: string;
    userAgent?: string;
    connectedAt: Date;
  };
  send: (data: string) => void;
  isAlive: boolean;
}

export interface ConnectionMetadata {
  userId: string;
  teamId: string;
  connectionId: string;
  lastActivity: Date;
}
