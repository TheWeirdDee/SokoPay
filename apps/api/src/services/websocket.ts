import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { supabase } from '../config/supabase';

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', async (ws: WebSocket) => {
    console.log('[WEBSOCKET] Client connected');

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

  const txMessage = JSON.stringify({ type: 'NEW_TRANSACTION', transaction: tx });
  
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
    const { count, error: countError } = await supabase.from('Transaction').select('*', { count: 'exact', head: true });
    
    if (countError) throw countError;

    const { data: incomingTxs, error: txError } = await supabase.from('Transaction')
      .select('amountLocal, currencyLocal')
      .eq('direction', 'in');

    if (txError) throw txError;

    let totalVolumeLocal = 0;
    if (incomingTxs) {
      for (const tx of incomingTxs) {
        const amount = tx.amountLocal || 0;
        if (tx.currencyLocal === 'KES') {
          totalVolumeLocal += amount * 10.5;
        } else {
          totalVolumeLocal += amount;
        }
      }
    }

    return {
      count: count || 0,
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
