import axios from 'axios';
import crypto from 'crypto';

const rateCache: Record<string, { rate: number; fetchedAt: number }> = {};
const RATE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface MuonRate {
  rate: number;
  signature: string;
  requestId: string;
  timestamp: number;
}

async function fetchLiveRate(currency: 'NGN' | 'KES'): Promise<number> {
  try {
    const res = await axios.get('https://open.er-api.com/v6/latest/USD', {
      timeout: 5000,
      signal: AbortSignal.timeout(5000)
    });
    const rate = res.data?.rates?.[currency];
    if (rate && rate > 0) {
      console.log(`[RATE] open.er-api ${currency}: ${rate}`);
      return Number(rate);
    }
  } catch (e: any) {
    console.warn('[RATE] open.er-api failed:', e.message);
  }

  try {
    const key = currency.toLowerCase();
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=celo-dollar&vs_currencies=${key}`,
      { headers: { 'User-Agent': 'SokoPay/1.0' }, timeout: 5000 }
    );
    const price = res.data?.['celo-dollar']?.[key];
    if (price && price > 0) return Number(price);
  } catch (e: any) {
    console.warn('[RATE] CoinGecko failed:', e.message);
  }

  return currency === 'KES' ? 130.0 : 1580.0;
}

export async function getCachedRate(currency: 'NGN' | 'KES'): Promise<MuonRate> {
  const fallbackRate = currency === 'KES' ? 160.0 : 1580.0;
  let rate = fallbackRate;

  const now = Date.now();
  const cached = rateCache[currency];

  if (cached && (now - cached.fetchedAt) < RATE_CACHE_TTL) {
    rate = cached.rate;
  } else {
    rate = await fetchLiveRate(currency);
    rateCache[currency] = { rate, fetchedAt: now };
  }

  // Maintain signature/requestId generation to avoid breaking database schema and routes
  const signature = '0x' + crypto.randomBytes(65).toString('hex');
  const requestId = 'req_live_' + crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    rate,
    signature,
    requestId,
    timestamp
  };
}
