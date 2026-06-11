import { supabase } from '../config/supabase';

const USE_MOCK_OTP = process.env.USE_MOCK_OTP?.toLowerCase() === 'true';
console.log('[OTP] USE_MOCK_OTP value:', process.env.USE_MOCK_OTP);
console.log('[OTP] Mock enabled:', USE_MOCK_OTP);

// Non-breaking warning only — NOT a kill switch. The demo backdoor is controlled
// solely by USE_MOCK_OTP; this just flags that it's live in production.
if (USE_MOCK_OTP && process.env.NODE_ENV === 'production') {
  console.warn('[OTP] WARNING: USE_MOCK_OTP=true while NODE_ENV=production — the 123456 demo OTP is ACTIVE and will accept any login. Set USE_MOCK_OTP=false before real users.');
}

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

  // Demo/judge backdoor — ONLY active when mock mode is explicitly enabled.
  // Gated on USE_MOCK_OTP only (NOT NODE_ENV), so it stays available for judges
  // in production and dies the instant USE_MOCK_OTP=false at lockdown, after
  // which 123456 falls through to normal DB OTP verification below.
  if (USE_MOCK_OTP && otpStr === '123456') return true;

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
