import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer, MCP_TOOL_NAMES } from './server';

// Streamable HTTP transport in STATELESS mode: a fresh server + transport per
// request, no session id required. This makes the endpoint trivially
// health-checkable (a bare initialize / tools/list works without a prior
// session handshake) and returns plain application/json, not SSE or HTML.
export async function handleMcpPost(req: Request, res: Response) {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true       // respond with application/json instead of text/event-stream
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error('[MCP] request error:', err?.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null
      });
    }
  }
}

// GET probe returns JSON describing the endpoint (NOT an HTML page — that is the
// exact failure mode that scores 0 on health). Real MCP traffic uses POST.
export function handleMcpInfo(_req: Request, res: Response) {
  res.status(200).json({
    name: 'SokoPay MCP Server',
    description: 'cUSD balance, FX rates, payments, and transaction history for African merchants on Celo.',
    protocol: 'mcp',
    protocolVersion: '2025-06-18',
    transport: 'streamable-http',
    endpoint: '/mcp',
    rpc: 'POST (JSON-RPC 2.0)',
    tools: MCP_TOOL_NAMES
  });
}
