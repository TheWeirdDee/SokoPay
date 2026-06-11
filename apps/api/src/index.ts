import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';

const rawAgentKey = process.env.AGENT_PRIVATE_KEY;
if (rawAgentKey) {
  try {
    const agentKey = (rawAgentKey.startsWith('0x') ? rawAgentKey : `0x${rawAgentKey}`) as `0x${string}`;
    const operatorAccount = privateKeyToAccount(agentKey);
    console.log('=== OPERATOR WALLET ADDRESS ===');
    console.log(operatorAccount.address);
    console.log('===============================');
  } catch (e) {
    console.error('[STARTUP] AGENT_PRIVATE_KEY is set but invalid — check it is a 32-byte hex value:', (e as Error).message);
  }
} else {
  console.warn('[STARTUP] AGENT_PRIVATE_KEY not set — operator wallet disabled');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { initWebSocketServer } from './services/websocket';


const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
// Capture the raw body so webhook handlers can verify HMAC signatures over the
// exact bytes the sender signed. Parsing behaviour is otherwise unchanged.
app.use(express.json({ limit: '50mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

import { authRouter } from './routes/auth';
import { merchantRouter } from './routes/merchant';
import { nigeriaWebhookRouter } from './routes/webhooks/nigeria';
import { publicRouter } from './routes/public';
import { paymentsRouter } from './routes/payments';
import { transactionsRouter } from './routes/transactions';
import { agentRouter } from './routes/agent';
import { withdrawRouter } from './routes/withdraw';
import { startCronDaemon } from './services/cron';
import { handleMcpPost, handleMcpInfo } from './mcp/handler';

app.use('/auth', authRouter);
app.use('/merchant', merchantRouter);
app.use('/webhooks/nigeria', nigeriaWebhookRouter);
app.use('/p', publicRouter);
app.use('/payments', paymentsRouter);
app.use('/transactions', transactionsRouter);
app.use('/agent', agentRouter);
app.use('/withdraw', withdrawRouter);

// MCP server (Streamable HTTP) for ERC-8004 / 8004scan service detection.
// Isolated, additive — does not touch the signup/payment flow.
app.post('/mcp', handleMcpPost);
app.get('/mcp', handleMcpInfo);

app.get('/', (req, res) => {
  res.status(200).json({ name: 'SokoPay API', version: '1.0.0', status: 'ok' });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = createServer(app);

server.listen(port, () => {
  console.log(`SokoPay API listening on port ${port}`);
  console.log('[STARTUP] NODE_ENV:', process.env.NODE_ENV ?? 'unset');
  initWebSocketServer(server);
  setTimeout(() => {
    startCronDaemon();
  }, 30 * 1000);
});
