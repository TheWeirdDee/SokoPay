import crypto from 'crypto';

interface MuonRate {
  rate: number;
  signature: string;
  requestId: string;
  timestamp: number;
}

export async function getCachedRate(currency: 'NGN' | 'KES'): Promise<MuonRate> {
  // 1 cUSD = 1500 NGN or 150 KES
  const rate = currency === 'KES' ? 150.0 : 1500.0;
  
  // Generate a mock TSS signature simulating Muon Network verification
  const signature = '0x' + crypto.randomBytes(65).toString('hex');
  const requestId = 'req_muon_' + crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    rate,
    signature,
    requestId,
    timestamp
  };
}
