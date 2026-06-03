import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCachedRate } from '../services/muon';
import { transferCusdFromMerchant, decryptPrivateKey } from '../services/wallet';
import { privateKeyToAccount } from 'viem/accounts';
import { simulateYellowCardPayout, simulateKotaniPayPayout } from '../services/offramp';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

const OFFRAMP_POOL_ADDRESS = '0x1b8cbc7A0F928CA940bd1d2Ae2c007b460fabD4d';

router.get('/accounts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: accounts, error } = await supabase.from('WithdrawalAccount')
      .select('*')
      .eq('merchantId', merchantId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    res.json({ success: true, accounts });
  } catch (error: any) {
    console.error('Error fetching withdrawal accounts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
});

router.post('/accounts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { type, accountNumber, bankName, bankCode, mpesaNumber, isDefault } = req.body;

    if (!type || !['bank', 'opay', 'mpesa'].includes(type)) return res.status(400).json({ error: 'Invalid account type' });
    if (type === 'mpesa' && !mpesaNumber) return res.status(400).json({ error: 'M-Pesa number is required' });
    if (type !== 'mpesa' && (!accountNumber || !bankName)) return res.status(400).json({ error: 'Bank account number and name are required' });

    if (isDefault) {
      await supabase.from('WithdrawalAccount').update({ isDefault: false }).eq('merchantId', merchantId).eq('isDefault', true);
    }

    const { data: account, error } = await supabase.from('WithdrawalAccount').insert({
      id: crypto.randomUUID(),
      merchantId,
      type,
      accountNumber: accountNumber || null,
      bankName: bankName || null,
      bankCode: bankCode || null,
      mpesaNumber: mpesaNumber || null,
      isDefault: isDefault || false
    }).select().single();

    if (error) throw error;

    res.json({ success: true, account });

  } catch (error: any) {
    console.error('Error creating withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to link account' });
  }
});

router.get('/preview', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const amountCusd = parseFloat(req.query.amountCusd as string);
    if (!amountCusd || isNaN(amountCusd) || amountCusd <= 0) return res.status(400).json({ error: 'Valid amountCusd query parameter is required' });

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (error || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const rate = rateData.rate;

    const amountLocal = amountCusd * rate;
    const feeLocal = merchant.country === 'KE' ? 15 : 100;
    const netSettlementLocal = amountLocal - feeLocal;

    res.json({
      success: true, rate, amountLocal, feeLocal, feeCusd: feeLocal / rate,
      netSettlementLocal: netSettlementLocal > 0 ? netSettlementLocal : 0, currency
    });
  } catch (error: any) {
    console.error('Error during offramp preview:', error);
    res.status(500).json({ error: error.message || 'Off-ramp preview failed' });
  }
});

router.post('/execute', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { amountCusd, withdrawalAccountId, paymentPassword } = req.body;
    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd is required' });
    }

    const { data: account, error: accError } = await supabase.from('WithdrawalAccount').select('*').eq('id', withdrawalAccountId).eq('merchantId', merchantId).maybeSingle();
    if (accError || !account) return res.status(404).json({ error: 'Linked withdrawal account not found' });

    const { data: merchant, error: merError } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (merError || !merchant) return res.status(404).json({ error: 'Merchant not found' });

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

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const rate = rateData.rate;
    const parseCusd = parseFloat(amountCusd);

    const decryptedKey = decryptPrivateKey(merchant.encryptedPrivateKey);
    const signerAddress = privateKeyToAccount(decryptedKey).address;
    if (signerAddress.toLowerCase() !== merchant.walletAddress?.toLowerCase()) {
      console.error('[WITHDRAW] ADDRESS MISMATCH — DB:', merchant.walletAddress, '/ Key:', signerAddress);
    }
    console.log(`[WITHDRAW EXECUTE] On-chain transfer of ${parseCusd} cUSD from ${signerAddress} to offramp pool`);
    const txHash = await transferCusdFromMerchant(decryptedKey, OFFRAMP_POOL_ADDRESS, parseCusd.toFixed(6));

    let offrampResult;
    if (account.type === 'mpesa') {
      offrampResult = await simulateKotaniPayPayout(account.mpesaNumber!, parseCusd, rate);
    } else {
      offrampResult = await simulateYellowCardPayout(account.bankCode || '101', account.accountNumber!, parseCusd, rate);
    }

    const { data: transaction, error: txError } = await supabase.from('Transaction').insert({
      id: crypto.randomUUID(),
      merchantId,
      type: 'withdrawal',
      direction: 'out',
      amountCusd: parseCusd,
      amountLocal: offrampResult.amountLocal,
      currencyLocal: currency,
      exchangeRate: rate,
      muonSignature: rateData.signature,
      muonRequestId: rateData.requestId,
      txHash,
      method: account.type === 'mpesa' ? 'mpesa' : 'bank',
      status: 'confirmed',
      counterpart: account.type === 'mpesa' ? account.mpesaNumber : `${account.bankName} (${account.accountNumber})`,
      notes: `Withdrawal Settlement. Offramp ID: ${offrampResult.trackingId}`
    }).select().single();

    if (txError) throw txError;

    res.json({ success: true, transaction, txHash, offramp: offrampResult });
  } catch (error: any) {
    console.error('Error executing withdrawal:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to complete withdrawal' });
  }
});

router.delete('/accounts/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const { id } = req.params;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: account, error: accError } = await supabase.from('WithdrawalAccount').select('*').eq('id', id).eq('merchantId', merchantId).maybeSingle();
    if (accError || !account) return res.status(404).json({ error: 'Withdrawal account not found' });

    await supabase.from('WithdrawalAccount').delete().eq('id', id);

    if (account.isDefault) {
      const { data: remaining } = await supabase.from('WithdrawalAccount').select('*').eq('merchantId', merchantId).limit(1).maybeSingle();
      if (remaining) {
        await supabase.from('WithdrawalAccount').update({ isDefault: true }).eq('id', remaining.id);
      }
    }

    res.json({ success: true, message: 'Withdrawal account deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to delete account' });
  }
});

router.patch('/accounts/:id/default', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const { id } = req.params;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: account, error: accError } = await supabase.from('WithdrawalAccount').select('*').eq('id', id).eq('merchantId', merchantId).maybeSingle();
    if (accError || !account) return res.status(404).json({ error: 'Withdrawal account not found' });

    await supabase.from('WithdrawalAccount').update({ isDefault: false }).eq('merchantId', merchantId).eq('isDefault', true);
    
    const { data: updated, error: updateError } = await supabase.from('WithdrawalAccount').update({ isDefault: true }).eq('id', id).select().single();
    if (updateError) throw updateError;

    res.json({ success: true, account: updated });
  } catch (error: any) {
    console.error('Error setting default withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to set default account' });
  }
});

export { router as withdrawRouter };
