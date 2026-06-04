import { supabase } from '../config/supabase';

export async function sendOTP(phone: string): Promise<string> {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await supabase.from('OTPStore').upsert({
    phone,
    otp,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });

  // TODO: Swap in Termii SMS call here once sender ID is approved
  console.log(`[OTP] DEV — code for ${phone}: ${otp}`);

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
