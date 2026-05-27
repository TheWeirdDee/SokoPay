import { Router, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCachedRate } from '../services/muon';
import { transferCusdFromMerchant } from '../services/wallet';
import { simulateYellowCardPayout, simulateKotaniPayPayout } from '../services/offramp';
import crypto from 'crypto';

const router = Router();

// SokoPay central off-ramp pool address
const OFFRAMP_POOL_ADDRESS = '0x1b8cbc7A0F928CA940bd1d2Ae2c007b460fabD4d';

// GET /withdraw/accounts - List withdrawal accounts
router.get('/accounts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const accounts = await prisma.withdrawalAccount.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      accounts
    });
  } catch (error: any) {
    console.error('Error fetching withdrawal accounts:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
});

// POST /withdraw/accounts - Link a new withdrawal account
router.post('/accounts', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { type, accountNumber, bankName, bankCode, mpesaNumber, isDefault } = req.body;

    if (!type || !['bank', 'opay', 'mpesa'].includes(type)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    if (type === 'mpesa' && !mpesaNumber) {
      return res.status(400).json({ error: 'M-Pesa number is required' });
    }

    if (type !== 'mpesa' && (!accountNumber || !bankName)) {
      return res.status(400).json({ error: 'Bank account number and name are required' });
    }

    // If default, unset previous defaults
    if (isDefault) {
      await prisma.withdrawalAccount.updateMany({
        where: { merchantId, isDefault: true },
        data: { isDefault: false }
      });
    }

    const account = await prisma.withdrawalAccount.create({
      data: {
        merchantId,
        type,
        accountNumber: accountNumber || null,
        bankName: bankName || null,
        bankCode: bankCode || null,
        mpesaNumber: mpesaNumber || null,
        isDefault: isDefault || false
      }
    });

    res.json({
      success: true,
      account
    });

  } catch (error: any) {
    console.error('Error creating withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to link account' });
  }
});

// GET /withdraw/preview - Preview conversion rate & settlement amount
router.get('/preview', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const amountCusd = parseFloat(req.query.amountCusd as string);
    if (!amountCusd || isNaN(amountCusd) || amountCusd <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd query parameter is required' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const rate = rateData.rate;

    const amountLocal = amountCusd * rate;
    const feeLocal = merchant.country === 'KE' ? 15 : 100; // Flat fee structure
    const netSettlementLocal = amountLocal - feeLocal;

    res.json({
      success: true,
      rate,
      amountLocal,
      feeLocal,
      feeCusd: feeLocal / rate,
      netSettlementLocal: netSettlementLocal > 0 ? netSettlementLocal : 0,
      currency
    });

  } catch (error: any) {
    console.error('Error during offramp preview:', error);
    res.status(500).json({ error: error.message || 'Off-ramp preview failed' });
  }
});

// POST /withdraw/execute - Convert cUSD and execute offramp payout
router.post('/execute', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { amountCusd, withdrawalAccountId, paymentPassword } = req.body;

    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd is required' });
    }

    const account = await prisma.withdrawalAccount.findFirst({
      where: { id: withdrawalAccountId, merchantId }
    });

    if (!account) {
      return res.status(404).json({ error: 'Linked withdrawal account not found' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Verify payment password if configured
    if (merchant.paymentPasswordHash) {
      if (!paymentPassword) {
        return res.status(400).json({ error: 'Payment password is required' });
      }
      const hashed = crypto.createHash('sha256').update(paymentPassword).digest('hex');
      if (merchant.paymentPasswordHash !== hashed) {
        return res.status(400).json({ error: 'Incorrect payment password' });
      }
    }

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const rateData = await getCachedRate(currency);
    const rate = rateData.rate;

    const parseCusd = parseFloat(amountCusd);

    // 1. Move cUSD from merchant's EOA on-chain to SokoPay pool address
    console.log(`[WITHDRAW EXECUTE] On-chain transfer of ${parseCusd} cUSD from merchant ${merchant.walletAddress} to offramp pool`);
    const txHash = await transferCusdFromMerchant(
      merchant.encryptedPrivateKey,
      OFFRAMP_POOL_ADDRESS,
      parseCusd.toFixed(6)
    );

    // 2. Trigger simulated third-party offramp payout
    let offrampResult;
    if (account.type === 'mpesa') {
      offrampResult = await simulateKotaniPayPayout(account.mpesaNumber!, parseCusd, rate);
    } else {
      offrampResult = await simulateYellowCardPayout(
        account.bankCode || '101',
        account.accountNumber!,
        parseCusd,
        rate
      );
    }

    // 3. Save withdrawal record in transaction history
    const transaction = await prisma.transaction.create({
      data: {
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
      }
    });

    res.json({
      success: true,
      transaction,
      txHash,
      offramp: offrampResult
    });

  } catch (error: any) {
    console.error('Error executing withdrawal:', error);
    res.status(500).json({ error: error.message || 'Failed to complete withdrawal' });
  }
});

// DELETE /withdraw/accounts/:id - Unlink/delete withdrawal account
router.delete('/accounts/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const { id } = req.params;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const account = await prisma.withdrawalAccount.findFirst({
      where: { id, merchantId }
    });

    if (!account) {
      return res.status(404).json({ error: 'Withdrawal account not found' });
    }

    await prisma.withdrawalAccount.delete({
      where: { id }
    });

    // If we deleted the default account, make another default if possible
    if (account.isDefault) {
      const remaining = await prisma.withdrawalAccount.findFirst({
        where: { merchantId }
      });
      if (remaining) {
        await prisma.withdrawalAccount.update({
          where: { id: remaining.id },
          data: { isDefault: true }
        });
      }
    }

    res.json({
      success: true,
      message: 'Withdrawal account deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to delete account' });
  }
});

// PATCH /withdraw/accounts/:id/default - Set withdrawal account as default
router.patch('/accounts/:id/default', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const { id } = req.params;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const account = await prisma.withdrawalAccount.findFirst({
      where: { id, merchantId }
    });

    if (!account) {
      return res.status(404).json({ error: 'Withdrawal account not found' });
    }

    // Set all other accounts to non-default
    await prisma.withdrawalAccount.updateMany({
      where: { merchantId, isDefault: true },
      data: { isDefault: false }
    });

    // Set this one to default
    const updated = await prisma.withdrawalAccount.update({
      where: { id },
      data: { isDefault: true }
    });

    res.json({
      success: true,
      account: updated
    });
  } catch (error: any) {
    console.error('Error setting default withdrawal account:', error);
    res.status(500).json({ error: error.message || 'Failed to set default account' });
  }
});

export { router as withdrawRouter };
