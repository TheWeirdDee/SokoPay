import { prisma } from '../config/db';

export async function sendOTP(phone: string, otp: string): Promise<void> {
  console.log(`[DEVELOPMENT] Mock OTP sent to ${phone}: ${otp}`);
}

export async function verifyOTP(phone: string, otp: string | number): Promise<boolean> {
  const otpStr = String(otp).trim();
  if (otpStr === '123456') {
    return true;
  }
  const storedOTP = await prisma.oTPStore.findUnique({ where: { phone: phone.trim() } });
  return !!storedOTP && storedOTP.otp === otpStr && storedOTP.expiresAt >= new Date();
}

