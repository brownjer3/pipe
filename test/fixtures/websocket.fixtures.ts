import { vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Socket } from 'socket.io';
import { generateTestAccessToken } from './auth.fixtures';

/**
 * WebSocket test fixtures and utilities
 */

/**
 * Create a mock Socket.io socket
 */
export const createMockSocket = (overrides: Partial<Socket> = {}): Socket => {
  const emitter = new EventEmitter();
  const rooms = new Set<string>();
  rooms.add('socket-id'); // Socket's own room

  const socket = {
    id: 'socket-id',
    rooms,
    data: {},
    connected: true,

    on: vi.fn().mockImplementation((event, handler) => {
      emitter.on(event, handler);
      return socket;
    }),

    once: vi.fn().mockImplementation((event, handler) => {
      emitter.once(event, handler);
      return socket;
    }),

    off: vi.fn().mockImplementation((event, handler) => {
      emitter.off(event, handler);
      return socket;
    }),

    emit: vi.fn().mockImplementation((event, ...args) => {
      emitter.emit(event, ...args);
      return true;
    }),

    join: vi.fn().mockImplementation((room) => {
      rooms.add(room);
      return Promise.resolve();
    }),

    leave: vi.fn().mockImplementation((room) => {
      rooms.delete(room);
      return Promise.resolve();
    }),

    to: vi.fn().mockReturnThis(),
    broadcast: {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    },

    disconnect: vi.fn().mockImplementation((close) => {
      socket.connected = false;
      emitter.emit('disconnect', 'test disconnect');
      return socket;
    }),

    // Test utilities
    _emit: (event: string, ...args: any[]) => {
      emitter.emit(event, ...args);
    },

    ...overrides,
  } as unknown as Socket;

  return socket;
};

/**
 * Create a mock Socket.io server
 */
export const createMockSocketServer = () => {
  const sockets = new Map<string, Socket>();
  const rooms = new Map<string, Set<string>>();

  return {
    sockets: {
      sockets: sockets,
    },

    to: vi.fn().mockImplementation((room) => ({
      emit: vi.fn().mockImplementation((event, data) => {
        const roomSockets = rooms.get(room) || new Set();
        roomSockets.forEach((socketId) => {
          const socket = sockets.get(socketId);
          socket?.emit(event, data);
        });
      }),
    })),

    // Test utilities
    addSocket: (socket: Socket) => {
      sockets.set(socket.id, socket);
      socket.rooms.forEach((room) => {
        if (!rooms.has(room)) {
          rooms.set(room, new Set());
        }
        rooms.get(room)!.add(socket.id);
      });
    },

    removeSocket: (socketId: string) => {
      const socket = sockets.get(socketId);
      if (socket) {
        socket.rooms.forEach((room) => {
          rooms.get(room)?.delete(socketId);
        });
        sockets.delete(socketId);
      }
    },
  };
};

/**
 * WebSocket test client for integration tests
 */
export class TestWebSocketClient extends EventEmitter {
  messages: any[] = [];
  connected = false;

  constructor(
    public url: string,
    public auth?: any
  ) {
    super();
  }

  connect() {
    this.connected = true;
    this.emit('connect');
    return Promise.resolve();
  }

  disconnect() {
    this.connected = false;
    this.emit('disconnect');
  }

  send(event: string, data: any) {
    if (!this.connected) throw new Error('Not connected');
    this.emit('message', { event, data });
  }

  waitForMessage(predicate: (msg: any) => boolean, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      const checkExisting = this.messages.find(predicate);
      if (checkExisting) {
        clearTimeout(timer);
        resolve(checkExisting);
        return;
      }

      const handler = (msg: any) => {
        this.messages.push(msg);
        if (predicate(msg)) {
          clearTimeout(timer);
          this.off('server-message', handler);
          resolve(msg);
        }
      };

      this.on('server-message', handler);
    });
  }

  // Simulate receiving a message from server
  _receiveMessage(event: string, data: any) {
    const message = { event, data, timestamp: Date.now() };
    this.messages.push(message);
    this.emit('server-message', message);
  }
}

/**
 * Create authenticated WebSocket connection
 */
export const createAuthenticatedWebSocket = (userId?: string) => {
  const token = generateTestAccessToken({ id: userId });
  const socket = createMockSocket({
    handshake: {
      auth: { token },
    } as any,
  });

  return { socket, token };
};

/**
 * WebSocket event test helpers
 */
export const wsEvents = {
  connectionAuth: (token: string) => ({
    auth: { token },
  }),

  joinTeam: (teamId: string) => ({
    type: 'join-team',
    teamId,
  }),

  leaveTeam: (teamId: string) => ({
    type: 'leave-team',
    teamId,
  }),

  contextUpdate: (data: any) => ({
    type: 'context-update',
    data,
  }),

  platformSync: (platform: string, status: string) => ({
    type: 'platform-sync',
    platform,
    status,
  }),
};

/**
 * Mock heartbeat/ping-pong mechanism
 */
export const createHeartbeatMock = () => {
  let interval: NodeJS.Timeout | null = null;

  return {
    start: vi.fn().mockImplementation((socket, intervalMs = 30000) => {
      interval = setInterval(() => {
        socket.emit('ping');
      }, intervalMs);
    }),

    stop: vi.fn().mockImplementation(() => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }),

    handlePong: vi.fn(),
  };
};
