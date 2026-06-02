import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { transferCusdFromMerchant, decryptPrivateKey, getBalance } from '../services/wallet';

const router = Router();

router.post('/request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { customerName, amountLocal, description, dueDate } = req.body;
    if (!amountLocal || isNaN(parseFloat(amountLocal))) {
      return res.status(400).json({ error: 'amountLocal must be a valid number' });
    }

    const { data: merchant, error: merchantError } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (merchantError || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const linkToken = crypto.randomBytes(8).toString('hex');

    const { data: paymentRequest, error: insertError } = await supabase.from('PaymentRequest').insert({
      merchantId,
      customerName: customerName || null,
      amountLocal: parseFloat(amountLocal),
      currencyLocal: currency,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      linkToken,
      status: 'pending'
    }).select().single();

    if (insertError) throw insertError;

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${frontendUrl}/p/${linkToken}`;

    res.json({ success: true, paymentRequest, link });
  } catch (error: any) {
    console.error('Error creating payment request:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment request' });
  }
});

router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: requests, error } = await supabase.from('PaymentRequest')
      .select('*')
      .eq('merchantId', merchantId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json({ success: true, paymentRequests: requests });
  } catch (error: any) {
    console.error('Error fetching payment requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payment requests' });
  }
});

router.post('/send', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { recipientAddress, amountCusd, notes, counterpart, paymentPassword } = req.body;

    if (!recipientAddress || !recipientAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'Valid recipient wallet address is required' });
    }

    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd is required' });
    }

    const { data: merchant, error: merchantError } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (merchantError || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    if (merchant.paymentPinHash || merchant.paymentPasswordHash) {
      const pin = paymentPassword || req.body.pin || req.body.paymentPin;
      if (!pin) return res.status(400).json({ error: 'Payment PIN is required' });
      let pinMatch = false;
      if (merchant.paymentPinHash && merchant.paymentPinHash.startsWith('$2')) {
        pinMatch = await bcrypt.compare(pin, merchant.paymentPinHash);
      } else if (merchant.paymentPasswordHash) {
        const hashed = crypto.createHash('sha256').update(pin).digest('hex');
        pinMatch = merchant.paymentPasswordHash === hashed;
      }
      if (!pinMatch) return res.status(400).json({ error: 'Incorrect payment PIN' });
    }

    const { cusd: balance } = await getBalance(merchant.walletAddress);
    const balanceNum = parseFloat(balance);
    const amountNum = parseFloat(amountCusd.toString());

    console.log('Sending from wallet:', merchant.walletAddress);
    console.log('Balance:', balance);
    console.log('Amount to send:', amountCusd);
    console.log('Balance check:', { balanceNum, amountNum });

    if (balanceNum < amountNum) {
      return res.status(400).json({
        success: false,
        error: `Insufficient cUSD balance. Have: ${balanceNum}, Need: ${amountNum}`
      });
    }

    console.log(`[PAYMENTS SEND] Executing instant transfer of ${amountCusd} cUSD to ${recipientAddress}`);
    const decryptedKey = decryptPrivateKey(merchant.encryptedPrivateKey);
    const txHash = await transferCusdFromMerchant(decryptedKey, recipientAddress, parseFloat(amountCusd).toFixed(6));

    const { data: transaction, error: txError } = await supabase.from('Transaction').insert({
      merchantId,
      type: 'outgoing',
      direction: 'out',
      amountCusd: parseFloat(amountCusd),
      txHash,
      method: 'x402',
      status: 'confirmed',
      counterpart: counterpart || recipientAddress,
      notes: notes || 'Direct transfer payout'
    }).select().single();

    if (txError) throw txError;

    res.json({ success: true, transaction, txHash });

  } catch (error: any) {
    console.error('[PAYMENTS SEND] Transfer failed:', error?.shortMessage || error?.message || error);
    const msg = error?.shortMessage || error?.message || 'Failed to send payment';
    if (msg.includes('transfer amount exceeds balance') || msg.includes('ERC20InsufficientBalance')) {
      return res.status(400).json({ error: 'Insufficient cUSD balance to complete this transfer.' });
    }
    if (msg.includes('insufficient funds') || msg.includes('InsufficientFundsError')) {
      return res.status(400).json({ error: 'Insufficient CELO to pay gas fees. Your wallet needs a small amount of CELO to cover network fees.' });
    }
    res.status(500).json({ success: false, error: 'Transfer failed: ' + (error?.shortMessage || msg) });
  }
});

router.post('/schedule', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { recipient, recipientAddress, amountCusd, description, scheduledAt, recurrence } = req.body;

    if (!recipient) return res.status(400).json({ error: 'Recipient name/phone is required' });
    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) return res.status(400).json({ error: 'Valid amountCusd is required' });
    if (!scheduledAt) return res.status(400).json({ error: 'Scheduled execution date is required' });

    const { data: scheduledPayment, error } = await supabase.from('ScheduledPayment').insert({
      merchantId,
      recipient,
      recipientAddress: recipientAddress || null,
      amountCusd: parseFloat(amountCusd),
      description: description || null,
      scheduledAt: new Date(scheduledAt).toISOString(),
      recurrence: recurrence || null
    }).select().single();

    if (error) throw error;

    res.json({ success: true, scheduledPayment });

  } catch (error: any) {
    console.error('Error scheduling payment:', error);
    res.status(500).json({ error: error.message || 'Failed to schedule payment' });
  }
});

router.get('/scheduled', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: payments, error } = await supabase.from('ScheduledPayment')
      .select('*')
      .eq('merchantId', merchantId)
      .eq('executed', false)
      .order('scheduledAt', { ascending: true });

    if (error) throw error;

    res.json({ success: true, payments, scheduledPayments: payments });

  } catch (error: any) {
    console.error('GET /payments/scheduled error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch scheduled payments', payments: [], scheduledPayments: [] });
  }
});

router.delete('/scheduled/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    const { id } = req.params;

    const { data: payment, error } = await supabase.from('ScheduledPayment').select('*').eq('id', id).single();

    if (error || !payment || payment.merchantId !== merchantId) {
      return res.status(404).json({ error: 'Scheduled payment not found' });
    }

    if (payment.executed) {
      return res.status(400).json({ error: 'Cannot cancel already executed payment' });
    }

    const { error: deleteError } = await supabase.from('ScheduledPayment').delete().eq('id', id);
    if (deleteError) throw deleteError;

    res.json({ success: true, message: 'Scheduled payment cancelled' });

  } catch (error: any) {
    console.error('Error cancelling scheduled payment:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel scheduled payment' });
  }
});

export { router as paymentsRouter };
