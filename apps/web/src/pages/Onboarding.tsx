import React, { useState } from 'react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useNavigate } from 'react-router-dom';

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
  const [password, setPassword] = useState('');
  const [paymentPassword, setPaymentPassword] = useState('');

  // Login State
  const [loginPassword, setLoginPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

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
      const res = await api.post('/auth/request-otp', { phone: getFullPhone(), forceOtp: false });
      if (res.data.exists) {
        // User exists, prompt for login password
        setStep(5);
      } else {
        // User does not exist, send OTP
        setStep(2);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send OTP');
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
        paymentPassword
      });
      localStorage.setItem('sokopay_token', res.data.token);
      if (step === 3) {
        setStep(4);
      } else {
        navigate('/dashboard');
      }
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

  const handleSetupProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName) {
      setError('Business Name is required');
      return;
    }
    if (!password || password.length < 6) {
      setError('Login Password must be at least 6 characters');
      return;
    }
    if (!paymentPassword || paymentPassword.length !== 4 || isNaN(Number(paymentPassword))) {
      setError('Payment PIN must be exactly 4 digits');
      return;
    }
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
      localStorage.setItem('sokopay_token', res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="font-display text-4xl font-bold text-accent mb-2">SokoPay</h1>
        <p className="text-text-muted">Your AI Financial Back-Office</p>
      </div>

      <div className="bg-bg-card p-8 rounded-xl shadow-card border-2 border-border max-w-md mx-auto w-full">
        {error && <div className="mb-6 p-4 bg-error/10 text-error rounded-lg text-sm font-semibold">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleRequestOTP}>
            <h2 className="font-display font-bold text-2xl mb-6">Welcome</h2>

            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-text-muted">Enter Your Phone Number</label>
              <div className="flex items-center bg-bg border-2 border-border focus-within:border-accent rounded-xl overflow-hidden transition-colors">

                {/* Country Selector */}
                <div className="relative flex items-center bg-bg-card px-3 py-3 border-r-2 border-border">
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
                    <span className="text-sm font-semibold text-text-muted">{selectedCountry.code}</span>
                    <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                {/* Dial Code Prefix */}
                <div className="pl-4 pr-1 py-3 text-text-muted font-semibold bg-bg select-none">
                  {selectedCountry.dialCode}
                </div>

                {/* Phone Input */}
                <input
                  type="tel"
                  className="flex-1 px-2 py-3 bg-bg outline-none font-semibold text-text"
                  placeholder="803 123 4567"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-lg py-4">Continue</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyOTP}>
            <h2 className="font-display font-bold text-2xl mb-4">Enter Code</h2>
            <p className="text-sm text-text-muted mb-6">We sent a 6-digit verification code to {selectedCountry.dialCode} {localPhone}</p>
            <Input
              label="OTP Code"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
            />
            <Button type="submit" isLoading={isLoading} className="w-full text-lg py-4 mt-2">Verify OTP</Button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mt-6 text-sm font-semibold text-accent w-full text-center hover:underline"
            >
              Wrong number?
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSetupProfile}>
            <h2 className="font-display font-bold text-2xl mb-6">Account Setup</h2>
            
            <div className="space-y-4">
              <Input
                label="Business Name"
                placeholder="e.g. Mama Joy Market"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />

              <Input
                label="Create Login Password"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <div>
                <label className="block text-sm font-semibold text-text-muted mb-1">Create 4-Digit Payment PIN</label>
                <input
                  type="password"
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  className="w-full px-4 py-3 bg-bg border-2 border-border focus:border-accent rounded-xl outline-none font-semibold text-text tracking-widest text-center"
                  value={paymentPassword}
                  onChange={(e) => setPaymentPassword(e.target.value.replace(/\D/g, ''))}
                  required
                />
                <span className="text-[10px] text-text-muted block mt-1">This PIN will be requested to authorize payments and withdrawals.</span>
              </div>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-lg py-4 mt-6">Create Agent Wallet</Button>
          </form>
        )}

        {step === 4 && (
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-success/20 text-success rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              ✓
            </div>
            <h2 className="font-display font-bold text-2xl mb-3">Wallet Created!</h2>
            <p className="text-text-muted mb-8 leading-relaxed">Your AI agent is ready to start accepting payments on Celo.</p>
            <Button onClick={() => navigate('/dashboard')} className="w-full py-4 text-lg">Go to Dashboard</Button>
          </div>
        )}

        {step === 5 && (
          <form onSubmit={handleLoginWithPassword}>
            <h2 className="font-display font-bold text-2xl mb-4">Enter Password</h2>
            <p className="text-sm text-text-muted mb-6">Welcome back! Enter your login password for {selectedCountry.dialCode} {localPhone}</p>
            
            <div className="space-y-4 mb-6">
              <Input
                label="Password"
                type="password"
                placeholder="Enter password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full text-lg py-4">Login</Button>
            
            <div className="flex flex-col gap-3 mt-6 text-center">
              <button
                type="button"
                onClick={handleRequestOTPFallback}
                className="text-sm font-semibold text-accent hover:underline"
              >
                Log in with OTP instead
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-text-muted hover:underline"
              >
                Change phone number
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
