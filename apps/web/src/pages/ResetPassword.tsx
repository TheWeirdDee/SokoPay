import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Check, X, Eye, EyeOff } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);
  const passwordsMatch = password === confirmPassword && password !== '';
  const isValid = isMinLength && hasUppercase && hasNumber && hasSpecial && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
      setTimeout(() => navigate('/onboarding'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] px-6">
        <div className="text-center space-y-4">
          <p className="text-[#B5271E] font-bold">Invalid reset link.</p>
          <button onClick={() => navigate('/onboarding')} className="text-xs text-[#C4622D] underline">Go to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-[#FAF7F2]">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-black text-[#1A1208] mb-2 tracking-tight">SokoPay</h1>
        <p className="text-[#7A6B55] font-semibold">Your AI Financial Back-Office</p>
      </div>

      <div className="bg-[#F2EDE4] p-8 rounded-2xl shadow-card border-2 border-[#1A1208] max-w-md mx-auto w-full">
        {success ? (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-[#5C6B3A]/15 rounded-full flex items-center justify-center mx-auto text-3xl border-2 border-[#1A1208]">✓</div>
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Password Reset!</h2>
            <p className="text-xs text-[#7A6B55] font-semibold">Redirecting you to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="font-display font-black text-2xl text-[#1A1208]">Set New Password</h2>

            {error && (
              <div className="p-4 bg-[#B5271E]/10 border-2 border-[#B5271E] text-[#B5271E] rounded-xl text-xs font-bold">{error}</div>
            )}

            <div className="space-y-4">
              <div className="relative">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-[#7A6B55]">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="relative">
                <Input
                  label="Confirm Password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-9 text-[#7A6B55]">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#DDD5C5] space-y-2 text-xs font-bold text-[#7A6B55]">
              {[
                [isMinLength, 'At least 8 characters'],
                [hasUppercase, 'One uppercase letter (A-Z)'],
                [hasNumber, 'One number (0-9)'],
                [hasSpecial, 'One special character (!@#$%^&*)'],
                [passwordsMatch, 'Passwords match'],
              ].map(([met, label]) => (
                <div key={label as string} className="flex items-center gap-2">
                  {met ? <Check className="w-4 h-4 text-green-700" /> : <X className="w-4 h-4 text-red-700" />}
                  <span className={met ? 'text-green-700' : ''}>{label as string}</span>
                </div>
              ))}
            </div>

            <Button type="submit" isLoading={isLoading} disabled={!isValid} className="w-full text-base py-3">
              Reset Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
