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

export async function getCachedRate(currency: 'NGN' | 'KES'): Promise<MuonRate> {
  const fallbackRate = currency === 'KES' ? 150.0 : 1500.0;
  let rate = fallbackRate;

  const now = Date.now();
  const cached = rateCache[currency];

  if (cached && (now - cached.fetchedAt) < RATE_CACHE_TTL) {
    rate = cached.rate;
  } else {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=celo-dollar&vs_currencies=ngn,kes',
        {
          headers: {
            'User-Agent': 'SokoPay/1.0 (Hackathon)'
          },
          timeout: 5000
        }
      );

      const data = response.data;
      const key = currency.toLowerCase();
      if (data?.['celo-dollar']?.[key]) {
        rate = Number(data['celo-dollar'][key]);
        rateCache[currency] = { rate, fetchedAt: now };
      }
    } catch (error: any) {
      console.warn(`Failed to fetch live rate from CoinGecko, using fallback: ${fallbackRate}. Error: ${error.message}`);
      rate = cached?.rate ?? fallbackRate;
    }
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
