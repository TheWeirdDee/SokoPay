import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { sendOTP, verifyOTP } from '../services/otp';
import { generateMerchantWallet } from '../services/wallet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function generateRandomOTP() {
  return '123456';
}

function hashString(val: string) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

router.post('/request-otp', async (req: Request, res: Response) => {
  try {
    const { phone, forceOtp } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const merchant = await prisma.merchant.findUnique({ where: { phone } });
    const exists = !!merchant;

    // If merchant exists and we're not forcing OTP login, we can let them log in with password
    if (exists && !forceOtp) {
      return res.json({ success: true, exists: true, message: 'Merchant exists, prompt for password' });
    }

    const otp = generateRandomOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oTPStore.upsert({
      where: { phone },
      update: { otp, expiresAt },
      create: { phone, otp, expiresAt }
    });

    await sendOTP(phone, otp);

    res.json({ success: true, exists, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to request OTP' });
  }
});

router.post('/login-password', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const merchant = await prisma.merchant.findUnique({ where: { phone } });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    if (!merchant.passwordHash) {
      return res.status(400).json({ error: 'No password configured for this account. Please log in with OTP.' });
    }

    const hashed = hashString(password);
    if (merchant.passwordHash !== hashed) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const token = jwt.sign({ merchantId: merchant.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        walletAddress: merchant.walletAddress,
        country: merchant.country
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to login with password' });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp, businessName, country, password, paymentPassword } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const isValid = await verifyOTP(phone, otp);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // OTP is valid. Check if merchant exists.
    let merchant = await prisma.merchant.findUnique({ where: { phone } });

    if (!merchant) {
      // First time signup
      if (!businessName || !country) {
        return res.status(400).json({ error: 'businessName and country required for signup' });
      }

      // Generate EOA Wallet offline
      const { address, encryptedPrivateKey } = generateMerchantWallet();

      const passwordHash = password ? hashString(password) : null;
      const paymentPasswordHash = paymentPassword ? hashString(paymentPassword) : null;

      merchant = await prisma.merchant.create({
        data: {
          phone,
          businessName,
          country,
          walletAddress: address,
          encryptedPrivateKey,
          passwordHash,
          paymentPasswordHash
        }
      });
    }

    // Delete used OTP
    await prisma.oTPStore.deleteMany({ where: { phone } });

    // Generate JWT
    const token = jwt.sign({ merchantId: merchant.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        walletAddress: merchant.walletAddress,
        country: merchant.country
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

export { router as authRouter };
