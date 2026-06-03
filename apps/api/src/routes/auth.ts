import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { sendOTP, verifyOTP } from '../services/otp';
import { generateMerchantWallet } from '../services/wallet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const pinLockouts = new Map<string, { attempts: number; lockedUntil: number }>();

function hashString(val: string) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

router.post('/request-otp', async (req: Request, res: Response) => {
  try {
    const { phone, forceOtp } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('phone', phone).maybeSingle();
    const exists = !!merchant;

    if (exists && !forceOtp) {
      return res.json({ success: true, exists: true, message: 'Merchant exists, prompt for password' });
    }

    await sendOTP(phone);

    res.json({ success: true, exists, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to request OTP' });
  }
});

router.post('/login-password', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'Phone and password are required' });

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('phone', phone).maybeSingle();
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    if (!merchant.passwordHash) return res.status(400).json({ error: 'No password configured for this account. Please log in with OTP.' });

    let passwordMatch = false;
    if (merchant.passwordHash.startsWith('$2')) {
      passwordMatch = await bcrypt.compare(password, merchant.passwordHash);
    } else {
      passwordMatch = merchant.passwordHash === hashString(password);
    }

    if (!passwordMatch) return res.status(400).json({ error: 'Incorrect password' });

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
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

    const isValid = await verifyOTP(phone, otp);
    if (!isValid) return res.status(400).json({ error: 'Invalid or expired OTP' });

    let { data: merchant } = await supabase.from('Merchant').select('*').eq('phone', phone).maybeSingle();

    if (merchant) {
      if (merchant.passwordHash && !password) return res.json({ success: true, exists: true, requiresPassword: true });
      if (merchant.passwordHash && password) {
        let passwordMatch = false;
        if (merchant.passwordHash.startsWith('$2')) {
          passwordMatch = await bcrypt.compare(password, merchant.passwordHash);
        } else {
          passwordMatch = merchant.passwordHash === hashString(password);
        }
        if (!passwordMatch) return res.status(400).json({ error: 'Incorrect password' });
      }
    } else {
      if (!businessName || !country) return res.status(400).json({ error: 'businessName and country required for signup' });
      const { address, encryptedPrivateKey } = generateMerchantWallet();
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      const finalPin = paymentPin || paymentPassword;
      const paymentPinHash = finalPin ? await bcrypt.hash(finalPin, 10) : null;
      const legacyPaymentHash = finalPin ? hashString(finalPin) : null;

      const { data: newMerchant, error } = await supabase.from('Merchant').insert({
        phone, businessName, country, walletAddress: address, encryptedPrivateKey,
        passwordHash, paymentPinHash, paymentPasswordHash: legacyPaymentHash
      }).select().single();
      if (error) throw error;
      merchant = newMerchant;
    }

    const token = jwt.sign({ merchantId: merchant.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id, businessName: merchant.businessName, walletAddress: merchant.walletAddress, country: merchant.country
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

router.post('/verify-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    const pin = req.body.pin || req.body.paymentPin;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized' });
    if (!pin) return res.status(400).json({ error: 'Payment PIN is required' });
    if (pin.length !== 4 && pin !== '____probe____') return res.status(400).json({ error: 'Valid 4-digit PIN required' });

    const lockout = pinLockouts.get(merchantId);
    if (lockout && lockout.lockedUntil > Date.now()) {
      const minutesLeft = Math.ceil((lockout.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({ error: `Account temporarily locked due to consecutive failed attempts. Try again in ${minutesLeft} minutes.` });
    }

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (error || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    // Probe: check whether a PIN is configured without consuming a lockout attempt
    if (pin === '____probe____') {
      if (!merchant.paymentPinHash && !merchant.paymentPasswordHash) {
        return res.json({ success: false, noPinConfigured: true });
      }
      return res.json({ success: false, configured: true });
    }

    let pinMatch = false;
    if (merchant.paymentPinHash && merchant.paymentPinHash.startsWith('$2')) {
      pinMatch = await bcrypt.compare(pin, merchant.paymentPinHash);
    } else if (merchant.paymentPasswordHash) {
      pinMatch = merchant.paymentPasswordHash === hashString(pin);
    } else {
      return res.status(400).json({ error: 'Payment PIN not configured', noPinConfigured: true });
    }

    if (!pinMatch) {
      const currentAttempts = (lockout?.attempts || 0) + 1;
      if (currentAttempts >= 3) {
        pinLockouts.set(merchantId, { attempts: currentAttempts, lockedUntil: Date.now() + 5 * 60 * 1000 });
        return res.status(403).json({ error: 'Incorrect PIN. Your account is locked for 5 minutes.' });
      } else {
        pinLockouts.set(merchantId, { attempts: currentAttempts, lockedUntil: 0 });
        return res.status(400).json({ error: `Incorrect PIN. ${3 - currentAttempts} attempts remaining.` });
      }
    }

    pinLockouts.delete(merchantId);
    res.json({ success: true, message: 'PIN verified successfully' });
  } catch (error: any) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: error.message || 'Failed to verify PIN' });
  }
});

router.post('/set-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized' });
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (error || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    if (merchant.paymentPinHash || merchant.paymentPasswordHash) {
      return res.status(400).json({ error: 'A payment PIN is already configured. Use /auth/change-pin to update it.' });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const { error: updateError } = await supabase.from('Merchant').update({ paymentPinHash: pinHash, paymentPasswordHash: hashString(pin) }).eq('id', merchantId);
    if (updateError) throw updateError;

    res.json({ success: true, message: 'Payment PIN set successfully.' });
  } catch (error: any) {
    console.error('Error setting PIN:', error);
    res.status(500).json({ error: error.message || 'Failed to set PIN' });
  }
});

router.post('/change-pin', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized' });
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) return res.status(400).json({ error: 'currentPin and newPin are required.' });
    if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: 'New PIN must be exactly 4 digits.' });

    const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (error || !merchant) return res.status(404).json({ error: 'Merchant not found' });

    let pinMatch = false;
    if (merchant.paymentPinHash && merchant.paymentPinHash.startsWith('$2')) {
      pinMatch = await bcrypt.compare(currentPin, merchant.paymentPinHash);
    } else if (merchant.paymentPasswordHash) {
      pinMatch = merchant.paymentPasswordHash === hashString(currentPin);
    } else {
      return res.status(400).json({ error: 'No payment PIN is configured. Use /auth/set-pin first.' });
    }

    if (!pinMatch) return res.status(400).json({ error: 'Current PIN is incorrect.' });

    const newPinHash = await bcrypt.hash(newPin, 10);
    const { error: updateError } = await supabase.from('Merchant').update({ paymentPinHash: newPinHash, paymentPasswordHash: hashString(newPin) }).eq('id', merchantId);
    if (updateError) throw updateError;

    pinLockouts.delete(merchantId);
    res.json({ success: true, message: 'Payment PIN changed successfully.' });
  } catch (error: any) {
    console.error('Error changing PIN:', error);
    res.status(500).json({ error: error.message || 'Failed to change PIN' });
  }
});

export { router as authRouter };
