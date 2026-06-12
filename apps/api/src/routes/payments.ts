import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import crypto, { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { transferCusdFromMerchant, decryptPrivateKey, getBalance } from '../services/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { getCachedRate } from '../services/muon';
import { broadcastNewTransaction } from '../services/websocket';

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
      id: randomUUID(),
      merchantId,
      customerName: customerName || null,
      amountLocal: parseFloat(amountLocal),
      currencyLocal: currency,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      linkToken,
      status: 'pending',
      createdAt: new Date().toISOString()
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


    // Derive the ACTUAL signing address from the private key so the balance
    // check uses the same account that will sign the transaction.
    // If walletAddress in DB ever drifted from the stored key, this catches it.
    const decryptedKey = decryptPrivateKey(merchant.encryptedPrivateKey);
    const signerAddress = privateKeyToAccount(decryptedKey).address;

    if (signerAddress.toLowerCase() !== merchant.walletAddress?.toLowerCase()) {
      console.error('[PAYMENTS SEND] ADDRESS MISMATCH — DB:', merchant.walletAddress, '/ Key:', signerAddress);
    }

    const { cusd: balance } = await getBalance(signerAddress);
    const balanceNum = parseFloat(balance);
    const amountNum = parseFloat(amountCusd.toString());

    console.log('[PAYMENTS SEND] Signer address:', signerAddress);
    console.log('[PAYMENTS SEND] DB walletAddress:', merchant.walletAddress);
    console.log('[PAYMENTS SEND] Balance:', balance, '| Amount:', amountCusd);

    // Gas is paid in cUSD (feeCurrency), so the spendable amount is balance minus
    // a gas reserve. Checking balance < amount alone lets a near-full-balance send
    // pass here but revert on-chain (amount + fee > balance). Reserve a buffer so
    // we reject client-side instead of broadcasting a doomed transfer.
    const GAS_BUFFER_CUSD = 0.01; // generously covers ~0.001–0.005 cUSD of feeCurrency gas
    if (balanceNum < amountNum + GAS_BUFFER_CUSD) {
      return res.status(400).json({
        success: false,
        error: `Insufficient balance after network fees. You have ${balanceNum.toFixed(4)} cUSD; this transfer needs ${amountNum.toFixed(4)} + ~${GAS_BUFFER_CUSD} cUSD reserved for gas.`
      });
    }

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);

    if (!rateData?.rate || rateData.rate <= 0) {
      return res.status(500).json({ error: 'Exchange rate unavailable — please try again in a moment.' });
    }

    const amountCusdNum = parseFloat(amountCusd);
    const amountLocal = parseFloat((amountCusdNum * rateData.rate).toFixed(2));

    console.log(`[PAYMENTS SEND] Executing instant transfer of ${amountCusd} cUSD (≈ ${currency} ${amountLocal}) to ${recipientAddress}`);
    const txHash = await transferCusdFromMerchant(decryptedKey, recipientAddress, amountCusdNum.toFixed(6));

    // On-chain transfer succeeded — record it. If the DB insert fails, still return
    // success with the txHash so the user knows their money moved.
    const { data: transaction, error: txError } = await supabase.from('Transaction').insert({
      id: crypto.randomUUID(),
      merchantId,
      type: 'outgoing',
      direction: 'out',
      amountCusd: amountCusdNum,
      amountLocal,
      currencyLocal: currency,
      exchangeRate: rateData.rate,
      txHash,
      method: 'x402',
      status: 'confirmed',
      counterpart: counterpart || recipientAddress,
      notes: notes || 'Direct transfer payout'
    }).select().single();

    if (txError) {
      console.error('[PAYMENTS SEND] DB insert failed after successful on-chain transfer:', txError.message, '| txHash:', txHash);
    }

    // If the recipient is a known SokoPay merchant, record their incoming side
    // immediately (and notify them live). The block-scanner cron dedupes per
    // merchant + txHash, so it won't double-insert this.
    try {
      const { data: recipientMatches } = await supabase
        .from('Merchant')
        .select('id, country, walletAddress, businessName')
        .ilike('walletAddress', recipientAddress)
        .limit(1);
      const recipient = recipientMatches?.[0];

      if (recipient && recipient.id !== merchantId) {
        const recipientCurrency = recipient.country === 'KE' ? 'KES' : 'NGN';
        const recipientRate = await getCachedRate(recipientCurrency);
        const recipientAmountLocal = parseFloat((amountCusdNum * recipientRate.rate).toFixed(2));

        const { data: inTx, error: inErr } = await supabase.from('Transaction').insert({
          id: crypto.randomUUID(),
          merchantId: recipient.id,
          type: 'incoming',
          direction: 'in',
          amountCusd: amountCusdNum,
          amountLocal: recipientAmountLocal,
          currencyLocal: recipientCurrency,
          exchangeRate: recipientRate.rate,
          txHash,
          method: 'x402',
          status: 'confirmed',
          counterpart: merchant.businessName || merchant.walletAddress,
          notes: notes || 'Incoming SokoPay transfer'
        }).select().single();

        if (inErr) {
          // 23505 = unique-constraint hit: the recipient's incoming row for this
          // exact transfer already exists (the cron sync beat us). Already-recorded,
          // not an error — skip silently.
          if (inErr.code !== '23505') {
            console.error('[PAYMENTS SEND] Failed to record recipient incoming tx:', inErr.message, '| txHash:', txHash);
          }
        } else if (inTx) {
          broadcastNewTransaction(inTx).catch(() => { /* ws best-effort */ });
        }
      }
    } catch (recErr: any) {
      console.error('[PAYMENTS SEND] Recipient incoming-record step errored:', recErr?.message);
    }

    res.json({ success: true, transaction: transaction ?? null, txHash });

  } catch (error: any) {
    console.error('[PAYMENTS SEND] Transfer failed:', error?.shortMessage || error?.message || error);
    const msg = error?.shortMessage || error?.message || 'Failed to send payment';
    // On-chain revert (e.g. amount + gas fee exceeded balance). Nothing was
    // recorded because the throw happened before the DB inserts.
    if (msg.includes('reverted')) {
      return res.status(400).json({ success: false, error: 'Transfer failed: insufficient balance after network fees.' });
    }
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
