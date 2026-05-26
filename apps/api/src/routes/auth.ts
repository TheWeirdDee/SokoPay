import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { sendOTP, verifyOTP } from '../services/otp';
import { generateMerchantWallet } from '../services/wallet';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function generateRandomOTP() {
  return '123456';
}

router.post('/request-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const otp = generateRandomOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oTPStore.upsert({
      where: { phone },
      update: { otp, expiresAt },
      create: { phone, otp, expiresAt }
    });

    await sendOTP(phone, otp);

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to request OTP' });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp, businessName, country } = req.body;
    
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

      merchant = await prisma.merchant.create({
        data: {
          phone,
          businessName,
          country,
          walletAddress: address,
          encryptedPrivateKey
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
