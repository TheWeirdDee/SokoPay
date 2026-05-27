import crypto from 'crypto';

interface OfframpResult {
  success: boolean;
  trackingId: string;
  amountLocal: number;
  feeLocal: number;
  message: string;
}

export async function simulateYellowCardPayout(
  bankCode: string,
  accountNumber: string,
  amountCusd: number,
  rate: number
): Promise<OfframpResult> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const amountLocal = amountCusd * rate;
  const feeLocal = 100; // Flat 100 NGN fee
  const trackingId = 'yc_pay_' + crypto.randomBytes(12).toString('hex');

  console.log(`[YELLOW CARD OFF-RAMP] Executing payout:
    - Amount: ${amountCusd} cUSD
    - Rate: 1 cUSD = ${rate} NGN
    - Settling NGN: ${amountLocal} NGN
    - Bank Account: ${accountNumber} (Bank Code: ${bankCode})
    - Tracking ID: ${trackingId}`);

  return {
    success: true,
    trackingId,
    amountLocal: parseFloat((amountLocal - feeLocal).toFixed(2)),
    feeLocal,
    message: 'Payout initiated successfully'
  };
}

export async function simulateKotaniPayPayout(
  mpesaNumber: string,
  amountCusd: number,
  rate: number
): Promise<OfframpResult> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const amountLocal = amountCusd * rate;
  const feeLocal = 15; // Flat 15 KES mobile money payout fee
  const trackingId = 'kotani_pay_' + crypto.randomBytes(12).toString('hex');

  console.log(`[KOTANI PAY OFF-RAMP] Executing payout:
    - Amount: ${amountCusd} cUSD
    - Rate: 1 cUSD = ${rate} KES
    - Settling KES: ${amountLocal} KES
    - M-Pesa Mobile Number: ${mpesaNumber}
    - Tracking ID: ${trackingId}`);

  return {
    success: true,
    trackingId,
    amountLocal: parseFloat((amountLocal - feeLocal).toFixed(2)),
    feeLocal,
    message: 'Mobile money settlement complete'
  };
}
