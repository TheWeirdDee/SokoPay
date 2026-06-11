import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/wallet';
import { getTransactionStats } from '../services/websocket';
import { getCachedRate } from '../services/muon';
import { randomUUID } from 'crypto';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const rate = rateData.rate;

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
        currency,
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

// REST fallback for live-activity stats (WebSocket delivers the same payload,
// but this lets the dashboard show real numbers even when the WS is unavailable).
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    const stats = await getTransactionStats(merchantId);

    // Build a rolling 7-day inflow breakdown (oldest first, today last) for the dashboard chart
    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const days: { start: number; end: number; day: string; isToday: boolean; amount: number }[] = [];
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const start = new Date(todayMidnight);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      days.push({ start: start.getTime(), end: end.getTime(), day: dayLabels[start.getDay()], isToday: i === 0, amount: 0 });
    }

    const { data: weekTxs } = await supabase.from('Transaction')
      .select('amountLocal, createdAt')
      .eq('merchantId', merchantId)
      .eq('direction', 'in')
      .gte('createdAt', new Date(days[0].start).toISOString());

    for (const tx of weekTxs || []) {
      const t = new Date(tx.createdAt).getTime();
      const bucket = days.find(d => t >= d.start && t < d.end);
      if (bucket) bucket.amount += tx.amountLocal || 0;
    }

    const weeklyEarnings = days.map(d => ({ day: d.day, amount: Math.round(d.amount), isToday: d.isToday }));

    res.json({ success: true, stats, weeklyEarnings });
  } catch (error: any) {
    console.error('GET /merchant/stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stats' });
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
    if (email !== undefined) {
      const trimmed = email?.trim() || '';
      if (trimmed === '') {
        updateData.email = null;
      } else {
        if (!EMAIL_REGEX.test(trimmed)) {
          return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        const normalized = trimmed.toLowerCase();
        const { data: owners, error: dupErr } = await supabase
          .from('Merchant')
          .select('id')
          .ilike('email', normalized)
          .neq('id', merchantId)
          .limit(1);
        if (dupErr) throw dupErr;
        if (owners && owners.length > 0) {
          return res.status(409).json({ error: 'This email is already linked to another SokoPay account.' });
        }
        updateData.email = normalized;
      }
    }

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
    const digits = rawPhone.replace(/\D/g, ''); // strip + and any stray symbols

    // Build lookup candidates covering all common stored formats.
    // NOTE: signup stores phone as digits-only E.164 with no '+' (e.g. "2349047208891"),
    // so every form below is generated both with and without the leading '+'.
    const candidates = new Set<string>();
    const add = (v: string) => { if (v && v.length >= 7) { candidates.add(v); candidates.add('+' + v); } };

    add(rawPhone.replace('+', ''));
    add(digits);

    // Local 0... → country-code E.164 (NG/KE)
    if (digits.startsWith('0')) {
      add('234' + digits.slice(1)); // 080... → 23480...
      add('254' + digits.slice(1)); // 071... → 25471...
    }
    // Country-code E.164 → local 0...
    if (digits.startsWith('234')) add('0' + digits.slice(3));
    if (digits.startsWith('254')) add('0' + digits.slice(3));

    console.log('[by-phone] Searching candidates:', [...candidates]);

    const { data: matches, error } = await supabase
      .from('Merchant')
      .select('id, businessName, walletAddress, phone')
      .in('phone', [...candidates]);

    if (error) throw error;

    const merchant = matches && matches.length > 0 ? matches[0] : null;

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
