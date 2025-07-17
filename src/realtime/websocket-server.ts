import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { IncomingMessage } from 'http';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { AuthService } from '../auth/auth-service';
import { MCPConnection } from '../types/websocket';

export class RealtimeServer {
  private wss: WebSocketServer;
  private connections = new Map<string, Set<MCPConnection>>();
  private pubClient: Redis;
  private subClient: Redis;
  private protocolHandler: any; // Will be set when MCP handler is implemented
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private httpServer: HTTPServer,
    private authService: AuthService,
    redisUrl?: string
  ) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/ws',
    });

    this.pubClient = new Redis(redisUrl || process.env.REDIS_URL!);
    this.subClient = new Redis(redisUrl || process.env.REDIS_URL!);

    this.setupWebSocketServer();
    this.setupPubSub();
    this.startHeartbeat();
  }

  setProtocolHandler(handler: any) {
    this.protocolHandler = handler;
  }

  private setupWebSocketServer() {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      try {
        const connection = await this.handleNewConnection(ws, req);

        ws.on('message', async (data) => {
          try {
            if (this.protocolHandler) {
              await this.protocolHandler.handleMessage(data.toString(), connection);
            } else {
              // Echo back for testing
              connection.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'echo',
                  params: { message: data.toString() },
                })
              );
            }
          } catch (error) {
            logger.error('WebSocket message error:', error);
          }
        });

        ws.on('pong', () => {
          connection.isAlive = true;
        });

        ws.on('close', () => {
          this.handleDisconnection(connection);
        });

        ws.on('error', (error) => {
          logger.error('WebSocket error:', error);
          this.handleDisconnection(connection);
        });

        // Send initialization message
        connection.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
              protocolVersion: '1.0',
              serverInfo: {
                name: 'Pipe',
                version: '1.0.0',
              },
              capabilities: {
                tools: true,
                resources: true,
                prompts: true,
                streaming: true,
                realtime: true,
              },
            },
          })
        );
      } catch (error) {
        logger.error('Connection setup error:', error);
        ws.close(1008, 'Connection setup failed');
      }
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  private async handleNewConnection(ws: WebSocket, req: IncomingMessage): Promise<MCPConnection> {
    // Extract auth token from query params or headers
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token =
      url.searchParams.get('token') || req.headers.authorization?.replace('Bearer ', '');

    // Authenticate connection
    const auth = token ? await this.authService.validateToken(token) : null;
    if (!auth) {
      ws.close(1008, 'Unauthorized');
      throw new Error('Unauthorized connection');
    }

    // Create connection object
    const connection: MCPConnection = {
      id: uuidv4(),
      ws,
      userId: auth.userId,
      teamId: auth.teamId,
      metadata: {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        connectedAt: new Date(),
      },
      send: (data: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      },
      isAlive: true,
    };

    // Track connection
    this.addConnection(auth.teamId, connection);

    // Subscribe to team channels
    await this.subscribeToChannels(connection);

    logger.info('New WebSocket connection', {
      connectionId: connection.id,
      userId: auth.userId,
      teamId: auth.teamId,
    });

    return connection;
  }

  private handleDisconnection(connection: MCPConnection) {
    logger.info('WebSocket disconnected', {
      connectionId: connection.id,
      userId: connection.userId,
    });

    // Remove from team connections
    const teamConnections = this.connections.get(`team:${connection.teamId}`);
    if (teamConnections) {
      teamConnections.delete(connection);
      if (teamConnections.size === 0) {
        this.connections.delete(`team:${connection.teamId}`);
      }
    }

    // Remove from user connections
    const userConnections = this.connections.get(`user:${connection.userId}`);
    if (userConnections) {
      userConnections.delete(connection);
      if (userConnections.size === 0) {
        this.connections.delete(`user:${connection.userId}`);
      }
    }
  }

  private addConnection(teamId: string, connection: MCPConnection) {
    // Add to team connections
    const teamKey = `team:${teamId}`;
    if (!this.connections.has(teamKey)) {
      this.connections.set(teamKey, new Set());
    }
    this.connections.get(teamKey)!.add(connection);

    // Add to user connections
    const userKey = `user:${connection.userId}`;
    if (!this.connections.has(userKey)) {
      this.connections.set(userKey, new Set());
    }
    this.connections.get(userKey)!.add(connection);
  }

  private async subscribeToChannels(connection: MCPConnection) {
    // Subscribe to team and user channels
    await this.subClient.subscribe(`team:${connection.teamId}`);
    await this.subClient.subscribe(`user:${connection.userId}`);
  }

  private setupPubSub() {
    // Subscribe to Redis channels
    this.subClient.on('message', (channel, message) => {
      const [type, id] = channel.split(':');

      if (type === 'team') {
        this.broadcastToTeam(id, JSON.parse(message));
      } else if (type === 'user') {
        this.sendToUser(id, JSON.parse(message));
      }
    });

    // Subscribe to global events
    this.subClient.subscribe('global:events').catch((err) => {
      logger.error('Failed to subscribe to global events:', err);
    });
  }

  async broadcastToTeam(teamId: string, message: any) {
    const connections = this.connections.get(`team:${teamId}`) || new Set();

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notification',
      params: message,
    });

    for (const connection of connections) {
      connection.send(payload);
    }

    // Also publish to Redis for other server instances
    await this.pubClient.publish(`team:${teamId}`, JSON.stringify(message));
  }

  async sendToUser(userId: string, message: any) {
    const connections = this.connections.get(`user:${userId}`) || new Set();

    const payload = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notification',
      params: message,
    });

    for (const connection of connections) {
      connection.send(payload);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: any) => {
        const connection = Array.from(this.connections.values())
          .flatMap((set) => Array.from(set))
          .find((conn) => conn.ws === ws);

        if (connection) {
          if (!connection.isAlive) {
            logger.info('Terminating inactive connection', {
              connectionId: connection.id,
            });
            ws.terminate();
            this.handleDisconnection(connection);
            return;
          }

          connection.isAlive = false;
          ws.ping();
        }
      });
    }, 30000); // 30 seconds
  }

  async shutdown() {
    logger.info('Shutting down WebSocket server');

    // Clear heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    this.wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    // Close Redis connections
    await this.pubClient.quit();
    await this.subClient.quit();

    // Close WebSocket server
    await new Promise<void>((resolve) => {
      this.wss.close(() => resolve());
    });
  }
}
