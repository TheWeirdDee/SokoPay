import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Intercept transaction creation and broadcast in real-time via WebSocket
prisma.$use(async (params, next) => {
  const result = await next(params);
  if (params.model === 'Transaction' && params.action === 'create') {
    // Defer import to prevent circular dependencies
    setTimeout(() => {
      try {
        const { broadcastNewTransaction } = require('../services/websocket');
        broadcastNewTransaction(result);
      } catch (err) {
        console.error('[DATABASE LOGGER] Failed to broadcast transaction:', err);
      }
    }, 100);
  }
  return result;
});
