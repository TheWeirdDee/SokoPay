import { Router, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCachedRate } from '../services/muon';

const router = Router();

// GET /transactions - Paginated and filtered transaction history
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as string; // 'incoming' | 'outgoing' | 'cash' | 'withdrawal'
    const direction = req.query.direction as string; // 'in' | 'out'
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    // Build filter clause
    const whereClause: any = {
      merchantId
    };

    if (type) {
      whereClause.type = type;
    }

    if (direction) {
      whereClause.direction = direction;
    }

    if (search) {
      whereClause.OR = [
        { notes: { contains: search, mode: 'insensitive' } },
        { counterpart: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get total count for pagination math
    const totalTransactions = await prisma.transaction.count({
      where: whereClause
    });

    // Fetch transactions
    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limit
    });

    const totalPages = Math.ceil(totalTransactions / limit);

    // Fetch summary statistics
    const inflowSum = await prisma.transaction.aggregate({
      where: { merchantId, direction: 'in' },
      _sum: { amountLocal: true }
    });
    const outflowSum = await prisma.transaction.aggregate({
      where: { merchantId, direction: 'out' },
      _sum: { amountLocal: true }
    });
    const cashSum = await prisma.transaction.aggregate({
      where: { merchantId, type: 'cash' },
      _sum: { amountLocal: true }
    });

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total: totalTransactions,
        totalPages
      },
      stats: {
        totalInflow: inflowSum._sum.amountLocal || 0,
        totalOutflow: outflowSum._sum.amountLocal || 0,
        totalCash: cashSum._sum.amountLocal || 0
      }
    });

  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch transactions' });
  }
});

// POST /transactions/cash - Record manual cash payment
router.post('/cash', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { amountLocal, notes, counterpart } = req.body;

    if (!amountLocal || isNaN(parseFloat(amountLocal)) || parseFloat(amountLocal) <= 0) {
      return res.status(400).json({ error: 'Valid amountLocal is required' });
    }

    // Fetch merchant country
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    
    // Resolve conversion rate & signature from Muon network oracle service
    const rateData = await getCachedRate(currency);
    const parsedAmountLocal = parseFloat(amountLocal);
    const amountCusd = parsedAmountLocal / rateData.rate;

    const transaction = await prisma.transaction.create({
      data: {
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
      }
    });

    res.json({
      success: true,
      transaction
    });

  } catch (error: any) {
    console.error('Error recording cash transaction:', error);
    res.status(500).json({ error: error.message || 'Failed to record cash transaction' });
  }
});

export { router as transactionsRouter };
