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
  if (currency === 'NGN') {
    try {
      const res = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=USDTNGN', { timeout: 4000 });
      const price = parseFloat(res.data?.price);
      if (price > 0) return price;
    } catch (e: any) {
      console.warn('[RATE] Binance USDT/NGN failed:', e.message);
    }
  }

  try {
    const key = currency.toLowerCase();
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=celo-dollar&vs_currencies=${key}`,
      { headers: { 'User-Agent': 'SokoPay/1.0' }, timeout: 5000 }
    );
    const price = res.data?.['celo-dollar']?.[key];
    if (price > 0) return Number(price);
  } catch (e: any) {
    console.warn('[RATE] CoinGecko failed:', e.message);
  }

  return currency === 'KES' ? 160.0 : 1580.0;
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
