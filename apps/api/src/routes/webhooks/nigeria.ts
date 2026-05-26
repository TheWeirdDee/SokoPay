import { Router, Request, Response } from 'express';
import { prisma } from '../../config/db';
import { getCachedRate } from '../../services/muon';
import { transferCusd } from '../../services/wallet';

const router = Router();

router.post('/bank', async (req: Request, res: Response) => {
  try {
    const { account_number, amount, transaction_reference } = req.body;

    if (!account_number || !amount) {
      return res.status(400).json({ error: 'Missing account_number or amount in payload' });
    }

    console.log(`[WEBHOOK] Nigeria bank webhook received for account: ${account_number}, amount: ${amount}`);

    // 1. Locate the merchant's payment account
    const paymentAccount = await prisma.paymentAccount.findFirst({
      where: { 
        accountNumber: String(account_number),
        type: 'bank'
      }
    });

    if (!paymentAccount) {
      return res.status(404).json({ error: `Payment account with number ${account_number} not found` });
    }

    // 2. Fetch the merchant
    const merchant = await prisma.merchant.findUnique({
      where: { id: paymentAccount.merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: `Merchant associated with account ${account_number} not found` });
    }

    // 3. Get Muon-verified exchange rate
    const muonRate = await getCachedRate('NGN');

    // 4. Calculate cUSD amount
    const amountCusd = parseFloat(amount) / muonRate.rate;

    // 5. Trigger Mento swap/delivery on-chain (transfer cUSD from operator wallet to merchant)
    console.log(`[WEBHOOK] Transferring ${amountCusd.toFixed(6)} cUSD to merchant address ${merchant.walletAddress}...`);
    const txHash = await transferCusd(merchant.walletAddress, amountCusd.toFixed(6));

    // 6. Log transaction to database
    const transaction = await prisma.transaction.create({
      data: {
        merchantId: merchant.id,
        type: 'incoming',
        direction: 'in',
        amountLocal: parseFloat(amount),
        currencyLocal: 'NGN',
        amountCusd: parseFloat(amountCusd.toFixed(6)),
        exchangeRate: muonRate.rate,
        muonSignature: muonRate.signature,
        muonRequestId: muonRate.requestId,
        txHash: txHash,
        method: 'bank',
        status: 'confirmed',
        notes: `Providus Bank webhook. Ref: ${transaction_reference || 'N/A'}`
      }
    });

    console.log(`[WEBHOOK] Payment successfully processed. Transaction logged: ${transaction.id}`);

    res.json({ 
      success: true,
      transactionId: transaction.id,
      amountCusd: transaction.amountCusd,
      txHash: transaction.txHash
    });

  } catch (error: any) {
    console.error('Error handling Nigeria webhook:', error);
    res.status(500).json({ error: error.message || 'Webhook processing failed' });
  }
});

export { router as nigeriaWebhookRouter };
