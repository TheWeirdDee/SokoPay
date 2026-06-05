import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { sendOTP, verifyOTP } from '../services/otp';
import { generateMerchantWallet } from '../services/wallet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const resend = new Resend(process.env.RESEND_API_KEY);

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(.{8,})$/;

const pinLockouts = new Map<string, { attempts: number; lockedUntil: number }>();

function hashString(val: string) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

router.get('/check-phone', async (req: Request, res: Response) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) return res.status(400).json({ error: 'Phone is required' });

    const { data } = await supabase
      .from('Merchant')
      .select('id, businessName, passwordHash')
      .eq('phone', phone)
      .maybeSingle();

    return res.json({
      exists: !!data,
      hasPassword: !!data?.passwordHash
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to check phone' });
  }
});

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
    const { phone, otp, businessName, country, password, paymentPassword, paymentPin, email } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

    const isValid = await verifyOTP(phone, otp);
    if (!isValid) return res.status(400).json({ error: 'Invalid or expired OTP' });

    let { data: merchant } = await supabase.from('Merchant').select('*').eq('phone', phone).maybeSingle();

    if (merchant) {
      // Demo mode: OTP alone is sufficient to log in
    } else {
      if (!businessName || !country) return res.status(400).json({ error: 'businessName and country required for signup' });
      const { address, encryptedPrivateKey } = generateMerchantWallet();
      const defaultPin = await bcrypt.hash('0000', 10);

      const newId = crypto.randomUUID();
      const { error: insertError } = await supabase.from('Merchant').insert({
        id: newId,
        phone, businessName, country, walletAddress: address, encryptedPrivateKey,
        passwordHash: null,
        paymentPinHash: defaultPin,
        paymentPasswordHash: null,
        email: email?.trim() || null,
        isVerified: false,
        selfAgentId: null,
        lowBalanceThreshold: 5,
        dailySummaryEnabled: true,
        paymentAlertsEnabled: true,
        createdAt: new Date().toISOString()
      });
      if (insertError) {
        console.error('[VERIFY-OTP] Merchant insert error:', insertError.message, insertError.details, insertError.hint);
        throw insertError;
      }
      const { data: newMerchant, error: fetchError } = await supabase.from('Merchant').select('*').eq('id', newId).single();
      if (fetchError || !newMerchant) {
        console.error('[VERIFY-OTP] Merchant fetch after insert failed:', fetchError?.message);
        throw new Error('Merchant created but could not be retrieved');
      }
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
  } catch (error: any) {
    const msg = error?.message || 'Failed to verify OTP';
    console.error('[VERIFY-OTP] 500 error:', msg, error?.details || '');
    res.status(500).json({ error: msg });
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

router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword are required' });

    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character (!@#$%^&*)' });
    }

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    if (merchant.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, merchant.passwordHash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('Merchant').update({ passwordHash: hash }).eq('id', merchantId);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to change password' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('phone', phone).maybeSingle();
    if (!merchant) return res.status(404).json({ error: 'No account found for this phone number' });
    if (!merchant.email) return res.status(400).json({ error: 'No recovery email linked. Add one in Settings first.' });

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase.from('Merchant').update({
      passwordResetToken: token,
      passwordResetExpiry: expiry
    }).eq('id', merchant.id);

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@sokopay.app',
      to: merchant.email,
      subject: 'Reset your SokoPay password',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1A1208">Reset your SokoPay password</h2>
          <p style="color:#7A6B55">Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}"
            style="display:inline-block;margin:16px 0;padding:12px 24px;background:#C4622D;color:#fff;font-weight:bold;border-radius:8px;text-decoration:none">
            Reset Password
          </a>
          <p style="color:#7A6B55;font-size:12px">If you didn't request this, ignore this email.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Reset link sent to your email' });
  } catch (error: any) {
    console.error('[forgot-password]', error);
    res.status(500).json({ error: error.message || 'Failed to send reset email' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword are required' });

    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character (!@#$%^&*)' });
    }

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('passwordResetToken', token).maybeSingle();
    if (!merchant) return res.status(400).json({ error: 'Invalid or expired reset link' });
    if (new Date(merchant.passwordResetExpiry) < new Date()) return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await supabase.from('Merchant').update({
      passwordHash: hash,
      passwordResetToken: null,
      passwordResetExpiry: null
    }).eq('id', merchant.id);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

router.post('/reset-pin-with-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized' });

    const { password, newPin } = req.body;
    if (!password || !newPin) return res.status(400).json({ error: 'password and newPin are required' });
    if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });

    const { data: merchant } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    if (!merchant.passwordHash) return res.status(400).json({ error: 'No password configured for this account' });

    const valid = await bcrypt.compare(password, merchant.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Password is incorrect' });

    const pinHash = await bcrypt.hash(newPin, 12);
    await supabase.from('Merchant').update({
      paymentPinHash: pinHash,
      paymentPasswordHash: hashString(newPin)
    }).eq('id', merchantId);

    res.json({ success: true, message: 'Payment PIN reset successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reset PIN' });
  }
});

export { router as authRouter };
