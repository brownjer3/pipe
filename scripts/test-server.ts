import WebSocket from 'ws';

async function testServer() {
  console.log('Testing Pipe MCP Server...\n');

  // Test HTTP endpoint
  try {
    const response = await fetch('http://localhost:3000/');
    const data = await response.json();
    console.log('✓ HTTP Server Response:', data);
  } catch (error) {
    console.error('✗ HTTP Server Error:', error);
  }

  // Test health endpoint
  try {
    const response = await fetch('http://localhost:3000/health');
    const data = await response.json();
    console.log('✓ Health Check:', data);
  } catch (error) {
    console.error('✗ Health Check Error:', error);
  }

  // Test WebSocket connection
  console.log('\nTesting WebSocket connection...');

  // You'll need to get a valid JWT token first
  // For testing, you can register a user and use the token
  const token = process.env.TEST_TOKEN || 'your-test-token-here';

  const ws = new WebSocket(`ws://localhost:3000/ws?token=${token}`);

  ws.on('open', () => {
    console.log('✓ WebSocket connected');

    // Send initialize message
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '1.0',
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    ws.send(JSON.stringify(initMessage));
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('✓ Received:', message);

    // If we got the initialize response, try listing tools
    if (message.id === 1) {
      const toolsMessage = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      };
      ws.send(JSON.stringify(toolsMessage));
    } else if (message.id === 2) {
      // We got the tools list, close the connection
      ws.close();
    }
  });

  ws.on('error', (error) => {
    console.error('✗ WebSocket Error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket closed');
    process.exit(0);
  });
}

// Run the test
testServer().catch(console.error);
