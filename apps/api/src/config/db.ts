import { PrismaClient } from '@prisma/client';

// Add connection pool parameters to handle transient Supabase drops
function buildDatabaseUrl() {
  const base = process.env.DATABASE_URL || '';
  if (!base || base.includes('connection_limit')) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}connection_limit=5&pool_timeout=20&connect_timeout=15`;
}

export const prisma = new PrismaClient({
  datasourceUrl: buildDatabaseUrl(),
});


// Intercept transaction creation and broadcast in real-time via WebSocket
prisma.$use(async (params: any, next: any) => {
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
