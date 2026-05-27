import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { prisma } from '../config/db';

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', async (ws: WebSocket) => {
    console.log('[WEBSOCKET] Client connected');

    // Send initial stats immediately on connection
    const stats = await getTransactionStats();
    ws.send(JSON.stringify({ type: 'STATS_UPDATE', stats }));

    ws.on('close', () => {
      console.log('[WEBSOCKET] Client disconnected');
    });
  });

  console.log('[WEBSOCKET] WebSocket server initialized');
}

export async function broadcastStatsUpdate() {
  if (!wss) return;

  const stats = await getTransactionStats();
  const message = JSON.stringify({ type: 'STATS_UPDATE', stats });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function broadcastNewTransaction(tx: any) {
  if (!wss) return;

  // Broadcast the new transaction details
  const txMessage = JSON.stringify({ type: 'NEW_TRANSACTION', transaction: tx });
  
  // Get updated stats and broadcast them
  const stats = await getTransactionStats();
  const statsMessage = JSON.stringify({ type: 'STATS_UPDATE', stats });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(txMessage);
      client.send(statsMessage);
    }
  });
}

async function getTransactionStats() {
  try {
    // Count all transactions (inflow, outflow, cash, withdrawals)
    const count = await prisma.transaction.count();

    // Sum all incoming transaction amounts (for total volume received in local currency equivalent)
    const incomingTxs = await prisma.transaction.findMany({
      where: {
        direction: 'in'
      }
    });

    let totalVolumeLocal = 0;
    for (const tx of incomingTxs) {
      const amount = tx.amountLocal || 0;
      if (tx.currencyLocal === 'KES') {
        // Convert KES volume to NGN equivalent (approx. 10x for display metrics)
        totalVolumeLocal += amount * 10.5;
      } else {
        totalVolumeLocal += amount;
      }
    }

    return {
      count,
      totalVolumeLocal: Math.round(totalVolumeLocal)
    };
  } catch (error) {
    console.error('Error fetching transaction stats for WS:', error);
    return {
      count: 0,
      totalVolumeLocal: 0
    };
  }
}
