import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/wallet';
import { randomUUID } from 'crypto';

const router = Router();

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();

    if (error || !merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let { data: bankAccount, error: bankFetchError } = await supabase.from('PaymentAccount')
      .select('*')
      .eq('merchantId', merchantId)
      .eq('type', 'bank')
      .limit(1)
      .maybeSingle();

    if (bankFetchError) console.error('GET /merchant/me PaymentAccount fetch error:', bankFetchError.message);

    if (!bankAccount && !bankFetchError) {
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      const { data: newBankAcc, error: insertError } = await supabase.from('PaymentAccount').insert({
        id: randomUUID(),
        merchantId,
        type: 'bank',
        accountNumber: randomAcc,
        bankName: 'Providus Bank',
        bankCode: '101',
        isDefault: true
      }).select().single();

      if (insertError) console.error('GET /merchant/me PaymentAccount insert error:', insertError.message);
      else bankAccount = newBankAcc;
    }

    return res.json({
      success: true,
      merchant: {
        id: merchant.id,
        phone: merchant.phone,
        businessName: merchant.businessName,
        country: merchant.country,
        walletAddress: merchant.walletAddress,
        isVerified: merchant.isVerified,
        createdAt: merchant.createdAt,
        lowBalanceThreshold: merchant.lowBalanceThreshold,
        dailySummaryEnabled: merchant.dailySummaryEnabled,
        weeklyReportEnabled: merchant.weeklyReportEnabled,
        paymentAlertsEnabled: merchant.paymentAlertsEnabled,
        email: merchant.email || null
      },
      bankAccount: bankAccount ? {
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
      } : null,
      id: merchant.id,
      phone: merchant.phone,
      businessName: merchant.businessName,
      country: merchant.country,
      walletAddress: merchant.walletAddress,
      isVerified: merchant.isVerified,
      createdAt: merchant.createdAt
    });
  } catch (error: any) {
    console.error('GET /merchant/me error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch merchant details' });
  }
});

router.get('/balance', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();

    if (error || !merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const balance = await getBalance(merchant.walletAddress);
    const rate = merchant.country === 'KE' ? 150 : 1500;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayTransactions } = await supabase.from('Transaction')
      .select('*')
      .eq('merchantId', merchantId)
      .eq('direction', 'in')
      .gte('createdAt', todayStart.toISOString());

    let todayEarningsLocal = 0;
    let todayEarningsCusd = 0;

    if (todayTransactions) {
      for (const tx of todayTransactions) {
        todayEarningsLocal += tx.amountLocal || 0;
        todayEarningsCusd += tx.amountCusd || 0;
      }
    }

    const { data: recentTransactions } = await supabase.from('Transaction')
      .select('*')
      .eq('merchantId', merchantId)
      .order('createdAt', { ascending: false })
      .limit(5);

    res.json({
      success: true,
      balance: {
        cusd: balance.cusd,
        celo: balance.celo,
        local: (Number(balance.cusd) * rate).toFixed(2),
        currency: merchant.country === 'KE' ? 'KES' : 'NGN',
      },
      todayEarnings: {
        local: todayEarningsLocal.toFixed(2),
        cusd: todayEarningsCusd.toFixed(2),
      },
      recentTransactions: recentTransactions || [],
      rate,
    });
  } catch (error: any) {
    console.error('GET /merchant/balance error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch balance details' });
  }
});

router.get('/qr', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    console.log('[QR] Fetching for merchant:', merchantId);
    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (error || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    let { data: bankAccount, error: bankErr } = await supabase.from('PaymentAccount').select('*').eq('merchantId', merchantId).eq('type', 'bank').maybeSingle();
    if (bankErr) console.error('[QR] bank fetch error:', bankErr.message);
    if (!bankAccount && merchant.country === 'NG') {
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      const { data: newBank, error: bankInsertErr } = await supabase.from('PaymentAccount').insert({
        id: randomUUID(), merchantId, type: 'bank', accountNumber: randomAcc, bankName: 'Providus Bank', bankCode: '101', isDefault: true
      }).select().single();
      if (bankInsertErr) console.error('[QR] bank insert error:', bankInsertErr.message);
      else bankAccount = newBank;
    }

    let { data: opayAccount } = await supabase.from('PaymentAccount').select('*').eq('merchantId', merchantId).eq('type', 'opay').maybeSingle();
    if (!opayAccount && merchant.country === 'NG') {
      const opayNumber = merchant.phone.replace('+', '');
      const { data: newOpay, error: opayInsertErr } = await supabase.from('PaymentAccount').insert({
        id: randomUUID(), merchantId, type: 'opay', accountNumber: opayNumber, isDefault: false
      }).select().single();
      if (opayInsertErr) console.error('[QR] opay insert error:', opayInsertErr.message);
      else opayAccount = newOpay;
    }

    let { data: mpesaAccount } = await supabase.from('PaymentAccount').select('*').eq('merchantId', merchantId).eq('type', 'mpesa').maybeSingle();
    if (!mpesaAccount && merchant.country === 'KE') {
      const tillNumber = Math.floor(100000 + Math.random() * 900000).toString();
      const { data: newMpesa, error: mpesaInsertErr } = await supabase.from('PaymentAccount').insert({
        id: randomUUID(), merchantId, type: 'mpesa', mpesaTill: tillNumber, isDefault: true
      }).select().single();
      if (mpesaInsertErr) console.error('[QR] mpesa insert error:', mpesaInsertErr.message);
      else mpesaAccount = newMpesa;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const paymentLink = `${frontendUrl}/p/${merchant.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentLink)}`;

    res.json({
      success: true,
      merchant: { businessName: merchant.businessName, country: merchant.country, isVerified: merchant.isVerified },
      paymentLink, qrCodeUrl,
      accountDetails: {
        bank: bankAccount ? { bankName: bankAccount.bankName, accountNumber: bankAccount.accountNumber } : null,
        opay: opayAccount ? { accountNumber: opayAccount.accountNumber } : null,
        mpesa: mpesaAccount ? { mpesaTill: mpesaAccount.mpesaTill } : null
      }
    });
  } catch (error: any) {
    console.error('Error fetching merchant QR details:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch QR details' });
  }
});

router.post('/toggle-country', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const newCountry = merchant.country === 'KE' ? 'NG' : 'KE';
    const { data: updated, error } = await supabase.from('Merchant').update({ country: newCountry }).eq('id', merchantId).select().single();
    if (error) throw error;

    res.json({ success: true, country: updated.country, message: `Country toggled to ${updated.country}` });
  } catch (error: any) {
    console.error('Error toggling country:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle country' });
  }
});

router.patch('/update', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { businessName, lowBalanceThreshold, dailySummaryEnabled, weeklyReportEnabled, paymentAlertsEnabled, email } = req.body;
    const updateData: any = {};
    if (businessName !== undefined && businessName.trim() !== '') updateData.businessName = businessName.trim();
    if (lowBalanceThreshold !== undefined && !isNaN(parseFloat(lowBalanceThreshold))) updateData.lowBalanceThreshold = parseFloat(lowBalanceThreshold);
    if (dailySummaryEnabled !== undefined) updateData.dailySummaryEnabled = !!dailySummaryEnabled;
    if (weeklyReportEnabled !== undefined) updateData.weeklyReportEnabled = !!weeklyReportEnabled;
    if (paymentAlertsEnabled !== undefined) updateData.paymentAlertsEnabled = !!paymentAlertsEnabled;
    if (email !== undefined) updateData.email = email?.trim() || null;

    const { data: updated, error } = await supabase.from('Merchant').update(updateData).eq('id', merchantId).select().single();
    if (error) throw error;

    res.json({
      success: true,
      merchant: {
        id: updated.id, phone: updated.phone, businessName: updated.businessName, country: updated.country,
        walletAddress: updated.walletAddress, isVerified: updated.isVerified, lowBalanceThreshold: updated.lowBalanceThreshold,
        dailySummaryEnabled: updated.dailySummaryEnabled, weeklyReportEnabled: updated.weeklyReportEnabled,
        paymentAlertsEnabled: updated.paymentAlertsEnabled, email: updated.email || null
      }
    });
  } catch (error: any) {
    console.error('Error updating merchant profile:', error);
    res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
});

router.get('/by-phone/:phone', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rawPhone = decodeURIComponent(req.params.phone).replace(/[\s\-]/g, '');

    // Build lookup candidates covering all common formats
    const candidates: string[] = [rawPhone];
    if (rawPhone.startsWith('+')) {
      // E.164 → also try local 0... format
      if (rawPhone.startsWith('+234')) candidates.push('0' + rawPhone.slice(4));
      if (rawPhone.startsWith('+254')) candidates.push('0' + rawPhone.slice(4));
    } else {
      candidates.push('+' + rawPhone);
      if (rawPhone.startsWith('0')) {
        candidates.push('+234' + rawPhone.slice(1)); // 080... → +23480...
        candidates.push('+254' + rawPhone.slice(1)); // 071... → +25471...
      }
    }

    console.log('[by-phone] Searching candidates:', candidates);

    const { data: merchant, error } = await supabase
      .from('Merchant')
      .select('id, businessName, walletAddress, phone')
      .in('phone', candidates)
      .maybeSingle();

    if (error) throw error;

    if (!merchant) {
      return res.status(404).json({ success: false, error: 'No SokoPay merchant found with this phone number' });
    }

    if (merchant.id === req.merchantId) {
      return res.status(400).json({ success: false, error: 'Cannot pay yourself' });
    }

    return res.json({
      success: true,
      found: true,
      businessName: merchant.businessName,
      walletAddress: merchant.walletAddress,
      phone: merchant.phone
    });
  } catch (error: any) {
    console.error('GET /merchant/by-phone error:', error);
    return res.status(500).json({ error: error.message || 'Lookup failed' });
  }
});

export { router as merchantRouter };
