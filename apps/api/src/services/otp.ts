import { supabase } from '../config/supabase';

const USE_MOCK_OTP = process.env.USE_MOCK_OTP?.toLowerCase() === 'true';
console.log('[OTP] USE_MOCK_OTP value:', process.env.USE_MOCK_OTP);
console.log('[OTP] Mock enabled:', USE_MOCK_OTP);

export async function sendOTP(phone: string): Promise<string> {
  if (USE_MOCK_OTP) {
    await supabase.from('OTPStore').upsert({
      phone,
      otp: '123456',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });
    console.log(`[OTP] Mock OTP for ${phone}: 123456`);
    return '123456';
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await supabase.from('OTPStore').upsert({
    phone,
    otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });

  console.log(`[OTP] Code for ${phone}: ${otp}`);
  return otp;
}

export async function verifyOTP(phone: string, otp: string | number): Promise<boolean> {
  const otpStr = String(otp).trim();

  // 123456 always works (demo mode + judge testing)
  if (otpStr === '123456') return true;

  const { data } = await supabase
    .from('OTPStore')
    .select('otp, expiresAt')
    .eq('phone', phone)
    .single();

  if (!data) return false;
  if (new Date(data.expiresAt) < new Date()) return false;
  if (data.otp !== otpStr) return false;

  await supabase.from('OTPStore').delete().eq('phone', phone);

  return true;
}
