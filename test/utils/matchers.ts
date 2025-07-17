import { expect } from 'vitest';
import jwt from 'jsonwebtoken';

/**
 * Custom Vitest matchers for the Pipe MCP Server
 */

expect.extend({
  /**
   * Check if a value is a valid JWT token
   */
  toBeValidJWT(received: string) {
    try {
      const decoded = jwt.decode(received, { complete: true });
      const pass = !!decoded && !!decoded.header && !!decoded.payload;

      if (pass) {
        return {
          message: () => `expected ${received} not to be a valid JWT`,
          pass: true,
        };
      } else {
        return {
          message: () => `expected ${received} to be a valid JWT`,
          pass: false,
        };
      }
    } catch (error) {
      return {
        message: () => `expected ${received} to be a valid JWT, but got error: ${error}`,
        pass: false,
      };
    }
  },

  /**
   * Check if a value is a valid UUID v4
   */
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID v4`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID v4`,
        pass: false,
      };
    }
  },

  /**
   * Check if an object matches the MCP message format
   */
  toMatchMCPMessage(
    received: any,
    expected: {
      jsonrpc?: string;
      id?: number | string;
      method?: string;
      params?: any;
      result?: any;
      error?: any;
    }
  ) {
    const isValidMCPMessage = (msg: any) => {
      // Must have jsonrpc version
      if (msg.jsonrpc !== '2.0') return false;

      // Request: must have method
      if ('method' in msg && typeof msg.method !== 'string') return false;

      // Response: must have either result or error
      if ('result' in msg && 'error' in msg) return false;

      // Error must have code and message
      if ('error' in msg && (!msg.error.code || !msg.error.message)) return false;

      return true;
    };

    const pass =
      isValidMCPMessage(received) &&
      Object.entries(expected).every(([key, value]) => {
        if (value === undefined) return true;
        return JSON.stringify(received[key]) === JSON.stringify(value);
      });

    if (pass) {
      return {
        message: () =>
          `expected ${JSON.stringify(received)} not to match MCP message ${JSON.stringify(expected)}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${JSON.stringify(received)} to match MCP message ${JSON.stringify(expected)}`,
        pass: false,
      };
    }
  },

  /**
   * Check if a number is within a range
   */
  toBeWithinRange(received: number, min: number, max: number) {
    const pass = received >= min && received <= max;

    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${min}-${max}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${min}-${max}`,
        pass: false,
      };
    }
  },
});
