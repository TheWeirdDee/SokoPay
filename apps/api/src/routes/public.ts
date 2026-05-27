import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { KenyaBridge } from '../bridges/kenya';
import { getCachedRate } from '../services/muon';
import { transferCusd } from '../services/wallet';

const router = Router();
const kenyaBridge = new KenyaBridge();

router.get('/:linkToken', async (req: Request, res: Response) => {
  try {
    const { linkToken } = req.params;

    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { linkToken },
      include: { merchant: true }
    });

    if (paymentRequest) {
      const bankAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: paymentRequest.merchantId, type: 'bank' }
      });
      const opayAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: paymentRequest.merchantId, type: 'opay' }
      });
      const mpesaAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: paymentRequest.merchantId, type: 'mpesa' }
      });

      return res.json({
        success: true,
        type: 'invoice',
        invoice: {
          id: paymentRequest.id,
          customerName: paymentRequest.customerName,
          amountLocal: paymentRequest.amountLocal,
          currencyLocal: paymentRequest.currencyLocal,
          description: paymentRequest.description,
          status: paymentRequest.status,
          dueDate: paymentRequest.dueDate
        },
        merchant: {
          id: paymentRequest.merchant.id,
          businessName: paymentRequest.merchant.businessName,
          country: paymentRequest.merchant.country,
          isVerified: paymentRequest.merchant.isVerified
        },
        accounts: {
          bank: bankAccount ? { bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber } : null,
          opay: opayAccount ? { accountNumber: opayAccount.accountNumber } : null,
          mpesa: mpesaAccount ? { mpesaTill: mpesaAccount.mpesaTill } : null
        }
      });
    }

    let merchant = await prisma.merchant.findUnique({
      where: { id: linkToken }
    });

    if (!merchant) {
      const merchants = await prisma.merchant.findMany();
      merchant = merchants.find(m => 
        m.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') === linkToken.toLowerCase()
      ) || null;
    }

    if (merchant) {
      const bankAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: merchant.id, type: 'bank' }
      });
      const opayAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: merchant.id, type: 'opay' }
      });
      const mpesaAccount = await prisma.paymentAccount.findFirst({
        where: { merchantId: merchant.id, type: 'mpesa' }
      });

      return res.json({
        success: true,
        type: 'merchant',
        merchant: {
          id: merchant.id,
          businessName: merchant.businessName,
          country: merchant.country,
          isVerified: merchant.isVerified
        },
        accounts: {
          bank: bankAccount ? { bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber } : null,
          opay: opayAccount ? { accountNumber: opayAccount.accountNumber } : null,
          mpesa: mpesaAccount ? { mpesaTill: mpesaAccount.mpesaTill } : null
        }
      });
    }

    res.status(404).json({ error: 'Payment link not found' });
  } catch (error: any) {
    console.error('Error fetching public payment link:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payment link details' });
  }
});

router.post('/:linkToken/pay', async (req: Request, res: Response) => {
  try {
    const { linkToken } = req.params;
    const { customerName, phone, amountLocal, simulate } = req.body;

    let paymentRequest = await prisma.paymentRequest.findUnique({
      where: { linkToken },
      include: { merchant: true }
    });

    let merchant;
    let finalAmountLocal: number;

    if (paymentRequest) {
      if (paymentRequest.status === 'paid') {
        return res.status(400).json({ error: 'Invoice already paid' });
      }
      merchant = paymentRequest.merchant;
      finalAmountLocal = paymentRequest.amountLocal;
    } else {
      merchant = await prisma.merchant.findUnique({
        where: { id: linkToken }
      });

      if (!merchant) {
        const merchants = await prisma.merchant.findMany();
        merchant = merchants.find(m => 
          m.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-') === linkToken.toLowerCase()
        ) || null;
      }

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      if (!amountLocal || isNaN(parseFloat(amountLocal))) {
        return res.status(400).json({ error: 'Amount is required' });
      }
      finalAmountLocal = parseFloat(amountLocal);
    }

    if (merchant.country === 'KE' && !simulate) {
      if (!phone) {
        return res.status(400).json({ error: 'Phone number is required for M-Pesa payment' });
      }

      console.log(`[PUBLIC PAY] Initiating real M-Pesa STK Push to ${phone} for ${finalAmountLocal} KES`);
      const response = await kenyaBridge.initiateSTKPush({
        phone,
        amount: finalAmountLocal,
        merchantId: merchant.id
      });

      return res.json({
        success: true,
        message: 'STK push request sent to your phone. Please enter your PIN.',
        mpesaResponse: response
      });
    }

    console.log(`[PUBLIC PAY] Processing mainnet token transfer. Amount: ${finalAmountLocal} ${merchant.country === 'KE' ? 'KES' : 'NGN'}`);

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rate = await getCachedRate(currency);
    const amountCusd = finalAmountLocal / rate.rate;

    console.log(`[PUBLIC PAY] Swapping ${finalAmountLocal} ${currency} to ${amountCusd.toFixed(6)} cUSD`);
    const txHash = await transferCusd(merchant.walletAddress, amountCusd.toFixed(6));

    const transaction = await prisma.transaction.create({
      data: {
        merchantId: merchant.id,
        type: 'incoming',
        direction: 'in',
        amountLocal: finalAmountLocal,
        currencyLocal: currency,
        amountCusd: parseFloat(amountCusd.toFixed(6)),
        exchangeRate: rate.rate,
        muonSignature: rate.signature,
        muonRequestId: rate.requestId,
        txHash: txHash,
        method: merchant.country === 'KE' ? 'mpesa' : 'bank',
        status: 'confirmed',
        counterpart: customerName || 'Customer',
        notes: paymentRequest 
          ? `Paid via link for: ${paymentRequest.description || 'N/A'}`
          : `Direct payment link from ${customerName || 'Customer'}`
      }
    });

    if (paymentRequest) {
      paymentRequest = await prisma.paymentRequest.update({
        where: { id: paymentRequest.id },
        data: {
          status: 'paid',
          paidTxHash: txHash
        },
        include: { merchant: true }
      });
    }

    res.json({
      success: true,
      message: 'Payment completed successfully!',
      transaction,
      paymentRequest
    });

  } catch (error: any) {
    console.error('Error processing public payment:', error);
    res.status(500).json({ error: error.message || 'Payment initiation failed' });
  }
});

router.post('/webhooks/kenya/mpesa', async (req: Request, res: Response) => {
  try {
    console.log('[M-PESA WEBHOOK] Received callback payload:', JSON.stringify(req.body));
    
    const stkCallback = req.body?.Body?.stkCallback;
    if (!stkCallback) {
      return res.status(400).json({ error: 'Invalid Safaricom payload' });
    }

    if (stkCallback.ResultCode !== 0) {
      console.warn(`[M-PESA WEBHOOK] Transaction failed: ${stkCallback.ResultDesc}`);
      return res.json({ success: false, message: stkCallback.ResultDesc });
    }

    const merchantId = req.query.merchantId as string;
    const invoiceId = req.query.invoiceId as string;

    if (!merchantId) {
      console.error('[M-PESA WEBHOOK] Missing merchantId in callback query');
      return res.status(400).json({ error: 'Missing merchantId in callback query' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      console.error(`[M-PESA WEBHOOK] Merchant not found: ${merchantId}`);
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const items = stkCallback.CallbackMetadata?.Item;
    const amount = items.find((i: any) => i.Name === 'Amount')?.Value;
    const receipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value;
    const phoneItem = items.find((i: any) => i.Name === 'PhoneNumber')?.Value;

    console.log(`[M-PESA WEBHOOK] Payment verified. Amount: ${amount} KES, Receipt: ${receipt}, Phone: ${phoneItem}`);

    const rate = await getCachedRate('KES');
    const amountCusd = parseFloat(amount) / rate.rate;

    console.log(`[M-PESA WEBHOOK] Delivering ${amountCusd.toFixed(6)} cUSD to merchant ${merchant.walletAddress}...`);
    const txHash = await transferCusd(merchant.walletAddress, amountCusd.toFixed(6));

    const transaction = await prisma.transaction.create({
      data: {
        merchantId: merchant.id,
        type: 'incoming',
        direction: 'in',
        amountLocal: parseFloat(amount),
        currencyLocal: 'KES',
        amountCusd: parseFloat(amountCusd.toFixed(6)),
        exchangeRate: rate.rate,
        muonSignature: rate.signature,
        muonRequestId: rate.requestId,
        txHash: txHash,
        method: 'mpesa',
        status: 'confirmed',
        counterpart: phoneItem ? String(phoneItem) : 'M-Pesa Customer',
        notes: `M-Pesa STK Push. Receipt: ${receipt}`
      }
    });

    if (invoiceId) {
      await prisma.paymentRequest.update({
        where: { id: invoiceId },
        data: {
          status: 'paid',
          paidTxHash: txHash
        }
      });
      console.log(`[M-PESA WEBHOOK] Updated invoice ${invoiceId} status to paid.`);
    }

    res.json({ success: true, transactionId: transaction.id });

  } catch (error: any) {
    console.error('[M-PESA WEBHOOK] Error processing Safaricom webhook:', error);
    res.status(500).json({ error: error.message || 'Webhook processing error' });
  }
});

export { router as publicRouter };
