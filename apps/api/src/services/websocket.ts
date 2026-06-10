import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { supabase } from '../config/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

let wss: WebSocketServer | null = null;

// Track which WebSocket belongs to which merchant
const clientMerchantMap = new Map<WebSocket, string>();

export function initWebSocketServer(server: Server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WEBSOCKET] Client connected');

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'AUTH' && message.token) {
          const payload = jwt.verify(message.token, JWT_SECRET) as { merchantId: string };
          const merchantId = payload.merchantId;
          clientMerchantMap.set(ws, merchantId);
          console.log('[WEBSOCKET] Authenticated merchant:', merchantId);

          const stats = await getTransactionStats(merchantId);
          ws.send(JSON.stringify({ type: 'STATS_UPDATE', stats }));
        }
      } catch (err) {
        // invalid token or bad message — ignore
      }
    });

    ws.on('close', () => {
      clientMerchantMap.delete(ws);
      console.log('[WEBSOCKET] Client disconnected');
    });
  });

  console.log('[WEBSOCKET] WebSocket server initialized');
}

export async function broadcastNewTransaction(tx: any) {
  if (!wss) return;

  wss.clients.forEach(async (client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const merchantId = clientMerchantMap.get(client);
    if (!merchantId || merchantId !== tx.merchantId) return;

    client.send(JSON.stringify({ type: 'NEW_TRANSACTION', transaction: tx }));

    const stats = await getTransactionStats(merchantId);
    client.send(JSON.stringify({ type: 'STATS_UPDATE', stats }));
  });
}

export async function broadcastStatsUpdate() {
  if (!wss) return;

  wss.clients.forEach(async (client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const merchantId = clientMerchantMap.get(client);
    if (!merchantId) return;

    const stats = await getTransactionStats(merchantId);
    client.send(JSON.stringify({ type: 'STATS_UPDATE', stats }));
  });
}

export async function getTransactionStats(merchantId: string) {
  try {
    const { count, error: countError } = await supabase
      .from('Transaction')
      .select('*', { count: 'exact', head: true })
      .eq('merchantId', merchantId);

    if (countError) throw countError;

    const { data: incomingTxs, error: txError } = await supabase
      .from('Transaction')
      .select('amountLocal, currencyLocal')
      .eq('merchantId', merchantId)
      .eq('direction', 'in');

    if (txError) throw txError;

    let totalVolumeLocal = 0;
    if (incomingTxs) {
      for (const tx of incomingTxs) {
        const amount = tx.amountLocal || 0;
        totalVolumeLocal += tx.currencyLocal === 'KES' ? amount * 10.5 : amount;
      }
    }

    return { count: count || 0, totalVolumeLocal: Math.round(totalVolumeLocal) };
  } catch (error) {
    console.error('[WEBSOCKET] Error fetching stats for merchant:', merchantId, error);
    return { count: 0, totalVolumeLocal: 0 };
  }
}
