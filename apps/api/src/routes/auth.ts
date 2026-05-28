import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { sendOTP, verifyOTP } from '../services/otp';
import { generateMerchantWallet } from '../services/wallet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Global map to track PIN lockout states: merchantId -> { attempts, lockedUntil }
const pinLockouts = new Map<string, { attempts: number; lockedUntil: number }>();

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

    // Support both bcrypt and legacy sha256
    let passwordMatch = false;
    if (merchant.passwordHash.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, merchant.passwordHash);
    } else {
      passwordMatch = merchant.passwordHash === hashString(password);
    }

    if (!passwordMatch) {
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
    const { phone, otp, businessName, country, password, paymentPassword, paymentPin } = req.body;
    
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone and OTP are required' });
    }

    const isValid = await verifyOTP(phone, otp);
    
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // OTP is valid. Check if merchant exists.
    let merchant = await prisma.merchant.findUnique({ where: { phone } });

    if (merchant) {
      // Existing user logging in via OTP flow
      // If a password was not supplied yet, they must complete the password challenge
      if (merchant.passwordHash && !password) {
        return res.json({
          success: true,
          exists: true,
          requiresPassword: true
        });
      }

      // If password was supplied, verify it
      if (merchant.passwordHash && password) {
        let passwordMatch = false;
        if (merchant.passwordHash.startsWith('$2')) {
          passwordMatch = await bcrypt.compare(password, merchant.passwordHash);
        } else {
          passwordMatch = merchant.passwordHash === hashString(password);
        }

        if (!passwordMatch) {
          return res.status(400).json({ error: 'Incorrect password' });
        }
      }
    } else {
      // First time signup
      if (!businessName || !country) {
        return res.status(400).json({ error: 'businessName and country required for signup' });
      }

      // Generate EOA Wallet offline
      const { address, encryptedPrivateKey } = generateMerchantWallet();

      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const finalPin = paymentPin || paymentPassword;
      const paymentPinHash = finalPin ? await bcrypt.hash(finalPin, 10) : null;
      const legacyPaymentHash = finalPin ? hashString(finalPin) : null;

      merchant = await prisma.merchant.create({
        data: {
          phone,
          businessName,
          country,
          walletAddress: address,
          encryptedPrivateKey,
          passwordHash,
          paymentPinHash,
          paymentPasswordHash: legacyPaymentHash
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

// POST /auth/verify-pin - Verify payment PIN with lockout protection
router.post('/verify-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const { pin } = req.body;

    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!pin) {
      return res.status(400).json({ error: 'Payment PIN is required' });
    }

    // Check lockout state
    const lockout = pinLockouts.get(merchantId);
    if (lockout && lockout.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((lockout.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({ 
        error: `Account temporarily locked due to consecutive failed attempts. Try again in ${minutesLeft} minutes.` 
      });
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Verify PIN: check paymentPinHash first (bcrypt), then paymentPasswordHash (sha256)
    let pinMatch = false;
    if (merchant.paymentPinHash && merchant.paymentPinHash.startsWith('$2')) {
      pinMatch = await bcrypt.compare(pin, merchant.paymentPinHash);
    } else if (merchant.paymentPasswordHash) {
      pinMatch = merchant.paymentPasswordHash === hashString(pin);
    } else {
      // No pin set
      return res.status(400).json({ error: 'Payment PIN not configured' });
    }

    if (!pinMatch) {
      const currentAttempts = (lockout?.attempts || 0) + 1;
      if (currentAttempts >= 3) {
        pinLockouts.set(merchantId, {
          attempts: currentAttempts,
          lockedUntil: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
        return res.status(403).json({ 
          error: 'Incorrect PIN. Your account is locked for 5 minutes.' 
        });
      } else {
        pinLockouts.set(merchantId, {
          attempts: currentAttempts,
          lockedUntil: 0
        });
        return res.status(400).json({ 
          error: `Incorrect PIN. ${3 - currentAttempts} attempts remaining.` 
        });
      }
    }

    // Reset attempts on successful entry
    pinLockouts.delete(merchantId);

    res.json({
      success: true,
      message: 'PIN verified successfully'
    });

  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: error.message || 'Failed to verify PIN' });
  }
});

export { router as authRouter };
