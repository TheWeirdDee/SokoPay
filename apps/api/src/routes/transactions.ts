import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCachedRate } from '../services/muon';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as string;
    const direction = req.query.direction as string;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    let query = supabase.from('Transaction').select('*', { count: 'exact' }).eq('merchantId', merchantId);
    
    if (type) query = query.eq('type', type);
    if (direction) query = query.eq('direction', direction);
    if (search) {
      query = query.or(`notes.ilike.%${search}%,counterpart.ilike.%${search}%`);
    }

    const { data: transactions, count, error } = await query
      .order('createdAt', { ascending: false })
      .range(skip, skip + limit - 1);

    if (error) throw error;

    const totalTransactions = count || 0;
    const totalPages = Math.ceil(totalTransactions / limit);

    const { data: inflows } = await supabase.from('Transaction').select('amountLocal').eq('merchantId', merchantId).eq('direction', 'in');
    const { data: outflows } = await supabase.from('Transaction').select('amountLocal').eq('merchantId', merchantId).eq('direction', 'out');
    const { data: cashTxs } = await supabase.from('Transaction').select('amountLocal').eq('merchantId', merchantId).eq('type', 'cash');

    const totalInflow = inflows?.reduce((acc, tx) => acc + (tx.amountLocal || 0), 0) || 0;
    const totalOutflow = outflows?.reduce((acc, tx) => acc + (tx.amountLocal || 0), 0) || 0;
    const totalCash = cashTxs?.reduce((acc, tx) => acc + (tx.amountLocal || 0), 0) || 0;

    res.json({
      success: true,
      transactions: transactions || [],
      pagination: { page, limit, total: totalTransactions, totalPages },
      stats: { totalInflow, totalOutflow, totalCash }
    });

  } catch (error: any) {
    console.error('GET /transactions error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch transactions',
      transactions: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      stats: { totalInflow: 0, totalOutflow: 0, totalCash: 0 }
    });
  }
});

router.post('/cash', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { amountLocal, notes, counterpart } = req.body;
    if (!amountLocal || isNaN(parseFloat(amountLocal)) || parseFloat(amountLocal) <= 0) {
      return res.status(400).json({ error: 'Valid amountLocal is required' });
    }

    const { data: merchant } = await supabase.from('Merchant').select('country').eq('id', merchantId).single();
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const parsedAmountLocal = parseFloat(amountLocal);
    const amountCusd = parsedAmountLocal / rateData.rate;

    const { data: transaction, error } = await supabase.from('Transaction').insert({
      merchantId,
      type: 'cash',
      direction: 'in',
      amountLocal: parsedAmountLocal,
      currencyLocal: currency,
      amountCusd: parseFloat(amountCusd.toFixed(6)),
      exchangeRate: rateData.rate,
      muonSignature: rateData.signature,
      muonRequestId: rateData.requestId,
      method: 'cash',
      status: 'confirmed',
      counterpart: counterpart || 'Cash Customer',
      notes: notes || 'Recorded Cash Sale'
    }).select().single();

    if (error) throw error;

    res.json({ success: true, transaction });
  } catch (error: any) {
    console.error('Error recording cash transaction:', error);
    res.status(500).json({ error: error.message || 'Failed to record cash transaction' });
  }
});

export { router as transactionsRouter };
