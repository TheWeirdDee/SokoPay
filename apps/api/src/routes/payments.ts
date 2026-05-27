import { Router, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import { transferCusdFromMerchant } from '../services/wallet';

const router = Router();

router.post('/request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { customerName, amountLocal, description, dueDate } = req.body;
    if (!amountLocal || isNaN(parseFloat(amountLocal))) {
      return res.status(400).json({ error: 'amountLocal must be a valid number' });
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
    const linkToken = crypto.randomBytes(8).toString('hex'); // 16-character hex token

    const paymentRequest = await prisma.paymentRequest.create({
      data: {
        merchantId,
        customerName: customerName || null,
        amountLocal: parseFloat(amountLocal),
        currencyLocal: currency,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        linkToken,
        status: 'pending'
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const link = `${frontendUrl}/p/${linkToken}`;

    res.json({
      success: true,
      paymentRequest,
      link
    });
  } catch (error: any) {
    console.error('Error creating payment request:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment request' });
  }
});

router.get('/requests', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const requests = await prisma.paymentRequest.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      paymentRequests: requests
    });
  } catch (error: any) {
    console.error('Error fetching payment requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch payment requests' });
  }
});

// POST /payments/send - Send instant payment to another address/merchant
router.post('/send', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { recipientAddress, amountCusd, notes, counterpart, paymentPassword } = req.body;

    if (!recipientAddress || !recipientAddress.startsWith('0x')) {
      return res.status(400).json({ error: 'Valid recipient wallet address is required' });
    }

    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd is required' });
    }

    // Get merchant wallet to decrypt
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

    // Execute transfer
    console.log(`[PAYMENTS SEND] Executing instant transfer of ${amountCusd} cUSD to ${recipientAddress}`);
    const txHash = await transferCusdFromMerchant(
      merchant.encryptedPrivateKey,
      recipientAddress,
      parseFloat(amountCusd).toFixed(6)
    );

    // Save outgoing transaction in history
    const transaction = await prisma.transaction.create({
      data: {
        merchantId,
        type: 'outgoing',
        direction: 'out',
        amountCusd: parseFloat(amountCusd),
        txHash,
        method: 'x402',
        status: 'confirmed',
        counterpart: counterpart || recipientAddress,
        notes: notes || 'Direct transfer payout'
      }
    });

    res.json({
      success: true,
      transaction,
      txHash
    });

  } catch (error: any) {
    console.error('Error sending payment:', error);
    res.status(500).json({ error: error.message || 'Failed to send payment' });
  }
});

// POST /payments/schedule - Schedule a payment
router.post('/schedule', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { recipient, recipientAddress, amountCusd, description, scheduledAt, recurrence } = req.body;

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient name/phone is required' });
    }

    if (!amountCusd || isNaN(parseFloat(amountCusd)) || parseFloat(amountCusd) <= 0) {
      return res.status(400).json({ error: 'Valid amountCusd is required' });
    }

    if (!scheduledAt) {
      return res.status(400).json({ error: 'Scheduled execution date is required' });
    }

    const scheduledPayment = await prisma.scheduledPayment.create({
      data: {
        merchantId,
        recipient,
        recipientAddress: recipientAddress || null,
        amountCusd: parseFloat(amountCusd),
        description: description || null,
        scheduledAt: new Date(scheduledAt),
        recurrence: recurrence || null
      }
    });

    res.json({
      success: true,
      scheduledPayment
    });

  } catch (error: any) {
    console.error('Error scheduling payment:', error);
    res.status(500).json({ error: error.message || 'Failed to schedule payment' });
  }
});

// GET /payments/scheduled - List scheduled payments
router.get('/scheduled', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const scheduledPayments = await prisma.scheduledPayment.findMany({
      where: {
        merchantId,
        executed: false
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    res.json({
      success: true,
      scheduledPayments
    });

  } catch (error: any) {
    console.error('Error fetching scheduled payments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch scheduled payments' });
  }
});

// DELETE /payments/scheduled/:id - Cancel scheduled payment
router.delete('/scheduled/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { id } = req.params;

    const payment = await prisma.scheduledPayment.findUnique({
      where: { id }
    });

    if (!payment || payment.merchantId !== merchantId) {
      return res.status(404).json({ error: 'Scheduled payment not found' });
    }

    if (payment.executed) {
      return res.status(400).json({ error: 'Cannot cancel already executed payment' });
    }

    await prisma.scheduledPayment.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Scheduled payment cancelled'
    });

  } catch (error: any) {
    console.error('Error cancelling scheduled payment:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel scheduled payment' });
  }
});

export { router as paymentsRouter };
