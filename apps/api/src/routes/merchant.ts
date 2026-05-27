import { Router, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/wallet';

const router = Router();

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Fetch on-chain balance
    const balance = await getBalance(merchant.walletAddress);

    // Get exchange rate (1 cUSD = 1500 NGN or 150 KES)
    const rate = merchant.country === 'KE' ? 150 : 1500;

    // Get or auto-create virtual account details
    let bankAccount = await prisma.paymentAccount.findFirst({
      where: {
        merchantId,
        type: 'bank'
      }
    });

    if (!bankAccount) {
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      bankAccount = await prisma.paymentAccount.create({
        data: {
          merchantId,
          type: 'bank',
          accountNumber: randomAcc,
          bankName: 'Providus Bank',
          bankCode: '101',
          isDefault: true
        }
      });
    }

    // Calculate today's earnings (incoming transactions created today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayTransactions = await prisma.transaction.findMany({
      where: {
        merchantId,
        direction: 'in',
        createdAt: {
          gte: todayStart,
        },
      },
    });

    let todayEarningsLocal = 0;
    let todayEarningsCusd = 0;

    for (const tx of todayTransactions) {
      todayEarningsLocal += tx.amountLocal || 0;
      todayEarningsCusd += tx.amountCusd || 0;
    }

    // Fetch recent transactions (limit to 5)
    const recentTransactions = await prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        phone: merchant.phone,
        businessName: merchant.businessName,
        country: merchant.country,
        walletAddress: merchant.walletAddress,
        isVerified: merchant.isVerified,
      },
      bankAccount: {
        accountNumber: bankAccount.accountNumber,
        bankName: bankAccount.bankName,
      },
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
      recentTransactions,
      rate,
    });
  } catch (error: any) {
    console.error('Error fetching merchant profile:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch merchant details' });
  }
});

router.get('/qr', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Auto-create accounts if missing
    let bankAccount = await prisma.paymentAccount.findFirst({
      where: { merchantId, type: 'bank' }
    });
    if (!bankAccount && merchant.country === 'NG') {
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      bankAccount = await prisma.paymentAccount.create({
        data: {
          merchantId,
          type: 'bank',
          accountNumber: randomAcc,
          bankName: 'Providus Bank',
          bankCode: '101',
          isDefault: true
        }
      });
    }

    let opayAccount = await prisma.paymentAccount.findFirst({
      where: { merchantId, type: 'opay' }
    });
    if (!opayAccount && merchant.country === 'NG') {
      const opayNumber = merchant.phone.replace('+', '');
      opayAccount = await prisma.paymentAccount.create({
        data: {
          merchantId,
          type: 'opay',
          accountNumber: opayNumber,
          isDefault: false
        }
      });
    }

    let mpesaAccount = await prisma.paymentAccount.findFirst({
      where: { merchantId, type: 'mpesa' }
    });
    if (!mpesaAccount && merchant.country === 'KE') {
      const tillNumber = Math.floor(100000 + Math.random() * 900000).toString();
      mpesaAccount = await prisma.paymentAccount.create({
        data: {
          merchantId,
          type: 'mpesa',
          mpesaTill: tillNumber,
          isDefault: true
        }
      });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const paymentLink = `${frontendUrl}/p/${merchant.id}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentLink)}`;

    res.json({
      success: true,
      merchant: {
        businessName: merchant.businessName,
        country: merchant.country,
        isVerified: merchant.isVerified
      },
      paymentLink,
      qrCodeUrl,
      accountDetails: {
        bank: bankAccount ? {
          bankName: bankAccount.bankName,
          accountNumber: bankAccount.accountNumber
        } : null,
        opay: opayAccount ? {
          accountNumber: opayAccount.accountNumber
        } : null,
        mpesa: mpesaAccount ? {
          mpesaTill: mpesaAccount.mpesaTill
        } : null
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
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const newCountry = merchant.country === 'KE' ? 'NG' : 'KE';
    const updated = await prisma.merchant.update({
      where: { id: merchantId },
      data: { country: newCountry }
    });

    res.json({
      success: true,
      country: updated.country,
      message: `Country toggled to ${updated.country}`
    });
  } catch (error: any) {
    console.error('Error toggling country:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle country' });
  }
});

export { router as merchantRouter };
