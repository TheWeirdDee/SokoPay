import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check, X, Shield, Lock, Landmark } from 'lucide-react';
import { useCache } from '../context/CacheContext';

const COUNTRIES = [
  { code: 'NG', dialCode: '+234', name: 'Nigeria' },
  { code: 'KE', dialCode: '+254', name: 'Kenya' }
];

export default function Onboarding() {
  const [step, setStep] = useState(1);

  // Phone State
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [localPhone, setLocalPhone] = useState('');

  // OTP & Setup State
  const [otp, setOtp] = useState('');
  const [businessName, setBusinessName] = useState('');
  
  // Step 3: Business Setup State
  const [email, setEmail] = useState('');

  // Step 3.5: Password State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState('');

  // Step 3.6: PIN State
  const [paymentPin, setPaymentPin] = useState('');
  const [confirmPaymentPin, setConfirmPaymentPin] = useState('');

  // Login State
  const [loginPassword, setLoginPassword] = useState('');

  // Step 6: OTP Login Password Challenge State
  const [otpLoginPassword, setOtpLoginPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(60);
  const [isNewUser, setIsNewUser] = useState(false);

  const navigate = useNavigate();
  const { clearCache } = useCache();

  const clearMerchantCache = () => {
    clearCache(); // reset in-memory cached state (profile/balance/txs) from any previous session
    localStorage.clear();
  };

  // Start 60s resend countdown whenever OTP screen is shown
  useEffect(() => {
    if (step !== 2) return;
    setResendCountdown(60);
    const interval = setInterval(() => {
      setResendCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Combine dial code and local phone, removing non-digits
  const getFullPhone = () => {
    const raw = `${selectedCountry.dialCode}${localPhone}`;
    return raw.replace(/\D/g, ''); // Termii requires numbers only (e.g., 2348031234567)
  };

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const phone = getFullPhone();
      const check = await api.get(`/auth/check-phone?phone=${phone}`);
      const { exists, hasPassword } = check.data;

      if (!exists) {
        setIsNewUser(true);
        await api.post('/auth/request-otp', { phone, forceOtp: true });
        setStep(2);
      } else if (hasPassword) {
        setIsNewUser(false);
        setStep(5);
      } else {
        // exists but no password — go to OTP, not password screen
        setIsNewUser(false);
        await api.post('/auth/request-otp', { phone, forceOtp: true });
        setStep(2);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to continue. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOTPFallback = async () => {
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/request-otp', { phone: getFullPhone(), forceOtp: true });
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone: getFullPhone(),
        otp,
        businessName,
        country: selectedCountry.code,
        password,
        paymentPin,
        email: email.trim() || undefined
      });
      
      clearMerchantCache();
      localStorage.setItem('sokopay_token', res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      if (err.response?.data?.error === 'businessName and country required for signup') {
        setStep(3);
      } else {
        setError(err.response?.data?.error || 'Invalid OTP');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPLoginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', {
        phone: getFullPhone(),
        otp,
        password: otpLoginPassword
      });
      clearMerchantCache();
      localStorage.setItem('sokopay_token', res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Incorrect password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupBusinessName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business Name is required');
      return;
    }
    setError('');
    await handleVerifyOTP(e);
  };

  // Password requirements checks
  const isMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  const passwordsMatch = password === confirmPassword && password !== '';
  const isPasswordValid = isMinLength && hasUppercase && hasNumber && hasSpecial && passwordsMatch;

  const handleSetupPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid) {
      setError('Please satisfy all password strength requirements.');
      return;
    }
    setError('');
    setStep(3.6);
  };

  const isPinValid = paymentPin.length === 4 && paymentPin === confirmPaymentPin;

  const handleSetupPinAndWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPinValid) {
      setError('PINs must match and be exactly 4 digits.');
      return;
    }
    setError('');
    await handleVerifyOTP(e);
  };

  const handleLoginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login-password', {
        phone: getFullPhone(),
        password: loginPassword
      });
      clearMerchantCache();
      localStorage.setItem('sokopay_token', res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  // Reusable Pin Box Group helper
  const PinInputGroup = ({ value, onChange, idPrefix }: { value: string; onChange: (val: string) => void; idPrefix: string }) => {
    const boxes = [0, 1, 2, 3];
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
      const val = e.target.value.replace(/\D/g, '');
      if (!val) return;
      const currentVal = value.split('');
      currentVal[idx] = val[val.length - 1]; // take last digit
      const newVal = currentVal.join('');
      onChange(newVal);

      // Auto-focus next input
      if (idx < 3) {
        const nextInput = document.getElementById(`${idPrefix}-${idx + 1}`);
        nextInput?.focus();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
      if (e.key === 'Backspace') {
        const currentVal = value.split('');
        // If current box is empty, focus previous and clear it
        if (!currentVal[idx] && idx > 0) {
          const prevInput = document.getElementById(`${idPrefix}-${idx - 1}`);
          prevInput?.focus();
          currentVal[idx - 1] = '';
        } else {
          currentVal[idx] = '';
        }
        onChange(currentVal.join(''));
      }
    };

    return (
      <div className="flex justify-center gap-4 py-2">
        {boxes.map((_, idx) => (
          <input
            key={idx}
            id={`${idPrefix}-${idx}`}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={value[idx] || ''}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="w-12 h-12 text-center text-xl font-bold bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] rounded-xl outline-none transition-colors"
          />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#1A1208]">
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="flex items-center gap-3 mb-2">
          <svg width="40" height="40" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M 75 24 H 48 C 34 24 24 34 24 48 H 40" stroke="#FAF7F2" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 25 76 H 52 C 66 76 76 66 76 52 H 60" stroke="#C4622D" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="font-display text-4xl font-black text-[#FAF7F2] tracking-tight">SokoPay</h1>
        </div>
        <p className="text-[#DDD5C5] font-semibold">Your AI Financial Back-Office</p>
      </div>

      <div className="bg-[#F2EDE4] p-8 rounded-2xl shadow-card border-2 border-[#1A1208] max-w-md mx-auto w-full relative">
        {error && <div className="mb-6 p-4 bg-[#B5271E]/10 border-2 border-[#B5271E] text-[#B5271E] rounded-xl text-xs font-bold">{error}</div>}

        {/* STEP 1: Phone Verification */}
        {step === 1 && (
          <form onSubmit={handleRequestOTP} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Welcome to SokoPay</h2>

            <div>
              <label className="block mb-2 text-xs font-bold text-[#7A6B55] uppercase tracking-wider">Enter Phone Number</label>
              <div className="flex items-center bg-[#FAF7F2] border-2 border-[#1A1208] focus-within:border-[#C4622D] rounded-xl overflow-hidden transition-colors">
                {/* Country Selector */}
                <div className="relative flex items-center bg-[#F2EDE4] px-3 py-3 border-r-2 border-[#1A1208]">
                  <select
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    value={selectedCountry.code}
                    onChange={(e) => setSelectedCountry(COUNTRIES.find(c => c.code === e.target.value) || COUNTRIES[0])}
                  >
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name} ({c.dialCode})</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 pointer-events-none">
                    <span className="text-xs font-black text-[#1A1208]">{selectedCountry.code}</span>
                    <svg className="w-3.5 h-3.5 text-[#1A1208]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                {/* Dial Code Prefix */}
                <div className="pl-4 pr-1 py-3 text-[#7A6B55] font-bold select-none text-sm">
                  {selectedCountry.dialCode}
                </div>

                {/* Phone Input */}
                <input
                  type="tel"
                  className="flex-1 px-2 py-3 bg-transparent outline-none font-bold text-[#1A1208] text-sm"
                  placeholder="803 123 4567"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-base py-3">Continue</Button>
          </form>
        )}

        {/* STEP 2: Verify OTP Code */}
        {step === 2 && (
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">
              {isNewUser ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">
              {isNewUser
                ? `Enter the code we sent to ${selectedCountry.dialCode} ${localPhone} to get started.`
                : `Enter the code we sent to ${selectedCountry.dialCode} ${localPhone} to log in.`}
            </p>

            <div className="space-y-2">
              <Input
                label="OTP Code"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
              <p className="text-[12px] text-[#C4622D] font-semibold">Demo mode: use code 123456</p>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-base py-3">Verify Code</Button>

            <div className="flex flex-col gap-3 text-center">
              {resendCountdown > 0 ? (
                <p className="text-xs text-[#7A6B55]">Resend code in {resendCountdown}s</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setResendCountdown(60)}
                  className="text-xs font-bold text-[#C4622D] hover:underline"
                >
                  Resend code
                </button>
              )}
              {!isNewUser && (
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="text-xs font-bold text-[#7A6B55] hover:underline"
                >
                  Sign in with password instead
                </button>
              )}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-[#7A6B55] hover:underline"
              >
                Wrong phone number?
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Business Profile setup */}
        {step === 3 && (
          <form onSubmit={handleSetupBusinessName} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208] flex items-center gap-2">
              <Landmark className="w-6 h-6 text-[#C4622D]" /> Profile Setup
            </h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">Let's create your storefront identity on SokoPay.</p>
            
            <Input
              label="Business Name"
              placeholder="e.g. Mama Joy Market Store"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />

            <div>
              <Input
                label="Recovery Email (optional)"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-[11px] text-[#7A6B55] mt-1">Used only for password and PIN reset</p>
            </div>

            <Button type="submit" className="w-full text-base py-3">Continue</Button>
          </form>
        )}

        {/* STEP 3.5: Create Password */}
        {step === 3.5 && (
          <form onSubmit={handleSetupPassword} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208] flex items-center gap-2">
              <Lock className="w-6 h-6 text-[#C4622D]" /> Create Password
            </h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">You'll use this password to securely log back in to your back-office.</p>

            <div className="space-y-4">
              {/* Password Input */}
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-[#7A6B55]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Confirm Password Input */}
              <div className="relative">
                <Input
                  label="Confirm Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-9 text-[#7A6B55]"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Validation List */}
            <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#DDD5C5] space-y-2 text-xs font-bold text-[#7A6B55]">
              <div className="flex items-center gap-2">
                {isMinLength ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                <span className={isMinLength ? 'text-green-700' : ''}>At least 8 characters</span>
              </div>
              <div className="flex items-center gap-2">
                {hasUppercase ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                <span className={hasUppercase ? 'text-green-700' : ''}>One uppercase letter (A-Z)</span>
              </div>
              <div className="flex items-center gap-2">
                {hasNumber ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                <span className={hasNumber ? 'text-green-700' : ''}>One number (0-9)</span>
              </div>
              <div className="flex items-center gap-2">
                {hasSpecial ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                <span className={hasSpecial ? 'text-green-700' : ''}>One special character (!@#$%^&*)</span>
              </div>
              <div className="flex items-center gap-2">
                {passwordsMatch ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                <span className={passwordsMatch ? 'text-green-700' : ''}>Passwords match</span>
              </div>
            </div>

            <Button type="submit" disabled={!isPasswordValid} className="w-full text-base py-3">Continue</Button>
          </form>
        )}

        {/* STEP 3.6: Set Payment PIN */}
        {step === 3.6 && (
          <form onSubmit={handleSetupPinAndWallet} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208] flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#C4622D]" /> Create Payment PIN
            </h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">
              This 4-digit authorization PIN will be requested to secure and confirm every outgoing payment and off-ramp withdrawal.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider text-center mb-1">Enter 4-Digit PIN</label>
                <PinInputGroup value={paymentPin} onChange={setPaymentPin} idPrefix="setup-pin" />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider text-center mb-1">Confirm 4-Digit PIN</label>
                <PinInputGroup value={confirmPaymentPin} onChange={setConfirmPaymentPin} idPrefix="confirm-pin" />
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} disabled={!isPinValid} className="w-full text-base py-3">
              Create Agent Wallet
            </Button>
          </form>
        )}

        {/* STEP 4: Registration Success */}
        {step === 4 && (
          <div className="text-center py-6 space-y-6">
            <div className="w-20 h-20 bg-success/20 text-[#5C6B3A] rounded-full flex items-center justify-center mx-auto text-4xl border-2 border-[#1A1208] shadow-card">
              ✓
            </div>
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Wallet Ready!</h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">Your secure agent EOA wallet has been generated on the Celo network. You can start accepting payments now.</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full py-3.5 text-base">Go to Dashboard</Button>
          </div>
        )}

        {/* STEP 5: Traditional Login Password Challenge */}
        {step === 5 && (
          <form onSubmit={handleLoginWithPassword} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Enter Password</h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">Welcome back! Verify your identity with your password to log in.</p>
            
            <div className="space-y-4">
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter login password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-[#7A6B55]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-base py-3">Login</Button>

            <div className="flex flex-col gap-3 text-center pt-2">
              <button
                type="button"
                onClick={() => { setError(''); setStep(7); }}
                className="text-xs font-bold text-[#C4622D] hover:underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={handleRequestOTPFallback}
                className="text-xs font-bold text-[#7A6B55] hover:underline"
              >
                Log in with OTP instead
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-[#7A6B55] hover:underline"
              >
                Change phone number
              </button>
            </div>
          </form>
        )}

        {/* STEP 7: Forgot Password — enter email */}
        {step === 7 && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setIsLoading(true);
            try {
              await api.post('/auth/forgot-password', { phone: getFullPhone() });
              setStep(8);
            } catch (err: any) {
              setError(err.response?.data?.error || 'Failed to send reset email');
            } finally {
              setIsLoading(false);
            }
          }} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Reset Password</h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">
              We'll send a reset link to the recovery email linked to your account.
            </p>
            <div>
              <Input
                label="Recovery Email"
                type="email"
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
              <p className="text-[11px] text-[#7A6B55] mt-1">Must match the email saved on your account</p>
            </div>
            <Button type="submit" isLoading={isLoading} className="w-full text-base py-3">Send Reset Link</Button>
            <button type="button" onClick={() => { setError(''); setStep(5); }}
              className="text-xs text-[#7A6B55] w-full text-center hover:underline">
              Back to login
            </button>
          </form>
        )}

        {/* STEP 8: Forgot Password — email sent */}
        {step === 8 && (
          <div className="text-center py-6 space-y-6">
            <div className="w-16 h-16 bg-[#5C6B3A]/15 rounded-full flex items-center justify-center mx-auto text-3xl border-2 border-[#1A1208]">
              ✉️
            </div>
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Check your email</h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">
              A password reset link has been sent to your recovery email. It expires in 1 hour.
            </p>
            <Button onClick={() => setStep(5)} className="w-full py-3 text-base">Back to Login</Button>
          </div>
        )}

        {/* STEP 6: OTP Login Password Challenge */}
        {step === 6 && (
          <form onSubmit={handleOTPLoginWithPassword} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Confirm Login</h2>
            <p className="text-xs text-[#7A6B55] leading-relaxed font-semibold">OTP verified. Please verify your login password to complete access registration.</p>

            <div className="space-y-4">
              <div className="relative">
                <Input
                  label="Login Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={otpLoginPassword}
                  onChange={(e) => setOtpLoginPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-[#7A6B55]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-base py-3">Complete Login</Button>
          </form>
        )}

      </div>
    </div>
  );
}
