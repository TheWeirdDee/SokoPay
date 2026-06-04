import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Shield, X, AlertTriangle, ShieldOff, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  description?: string;
}

export default function PinModal({ isOpen, onClose, onSuccess, description }: PinModalProps) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shouldShake, setShouldShake] = useState(false);
  const [noPinConfigured, setNoPinConfigured] = useState(false);
  const inputRefs = useRef<HTMLInputElement[]>([]);

  // Forgot PIN flow
  const [forgotPinStep, setForgotPinStep] = useState<'hidden' | 'verify' | 'newpin'>('hidden');
  const [forgotPassword, setForgotPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setShouldShake(false);
      setNoPinConfigured(false);
      setForgotPinStep('hidden');
      setForgotPassword('');
      setNewPin('');
      setConfirmNewPin('');
      setForgotError('');
      setForgotSuccess('');

      // Probe to detect if PIN is configured (returns 200, not 400)
      api.post('/auth/verify-pin', { pin: '____probe____' }).then((res) => {
        if (res.data?.noPinConfigured) {
          setNoPinConfigured(true);
        } else {
          setTimeout(() => { inputRefs.current[0]?.focus(); }, 150);
        }
      }).catch(() => {
        // Network error — assume PIN is configured and let user try
        setTimeout(() => { inputRefs.current[0]?.focus(); }, 150);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) return;
    const currentVal = pin.split('');
    currentVal[idx] = val[val.length - 1];
    const newPin = currentVal.join('');
    setPin(newPin);
    if (idx < 3) inputRefs.current[idx + 1]?.focus();
    if (newPin.length === 4) handleSubmit(newPin);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      const currentVal = pin.split('');
      if (!currentVal[idx] && idx > 0) {
        inputRefs.current[idx - 1]?.focus();
        currentVal[idx - 1] = '';
      } else {
        currentVal[idx] = '';
      }
      setPin(currentVal.join(''));
      setError('');
    }
  };

  const handleSubmit = async (pinValue: string) => {
    setLoading(true);
    setError('');
    setShouldShake(false);
    try {
      const res = await api.post('/auth/verify-pin', { pin: pinValue });
      if (res.data.success) {
        onSuccess(pinValue);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'PIN verification failed.');
      setPin('');
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 500);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const goToSettings = () => {
    onClose();
    navigate('/settings');
  };

  const handleVerifyPasswordForPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotLoading(true);
    try {
      await api.post('/auth/reset-pin-with-password', {
        password: forgotPassword,
        newPin: '0000' // sentinel — we verify password only in this step
      });
    } catch (err: any) {
      // 400 "PIN must be 4 digits" means password was accepted — move to new PIN step
      if (err.response?.data?.error?.includes('PIN must be')) {
        setForgotPinStep('newpin');
        setForgotLoading(false);
        return;
      }
      setForgotError(err.response?.data?.error || 'Password verification failed');
      setForgotLoading(false);
      return;
    }
    setForgotPinStep('newpin');
    setForgotLoading(false);
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmNewPin || !/^\d{4}$/.test(newPin)) {
      setForgotError('PINs must match and be exactly 4 digits');
      return;
    }
    setForgotError('');
    setForgotLoading(true);
    try {
      await api.post('/auth/reset-pin-with-password', { password: forgotPassword, newPin });
      setForgotSuccess('PIN reset successfully!');
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setForgotError(err.response?.data?.error || 'Failed to reset PIN');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1A1208]/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0" onClick={onClose} />

      <div
        className="w-full max-w-md bg-[#F2EDE4] border-2 border-[#1A1208] rounded-t-2xl sm:rounded-2xl shadow-card p-6 relative z-10"
        style={shouldShake ? { animation: 'shake 0.4s ease-in-out' } : undefined}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-8px); }
            40%, 80% { transform: translateX(8px); }
          }
        ` }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-full border border-[#DDD5C5] hover:bg-[#FAF7F2] transition-colors"
        >
          <X className="w-4 h-4 text-[#1A1208]" />
        </button>

        <div className="space-y-5 text-center pt-2">

          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${
            noPinConfigured
              ? 'bg-[#B5271E]/10 border-[#B5271E]/30'
              : 'bg-[#C4622D]/15 border-[#C4622D]/30'
          }`}>
            {noPinConfigured
              ? <ShieldOff className="w-6 h-6 text-[#B5271E]" />
              : <Shield className="w-6 h-6 text-[#C4622D]" />
            }
          </div>

          {/* Title + subtitle */}
          <div>
            <h3 className="font-display font-black text-lg text-[#1A1208]">
              {noPinConfigured ? 'Payment PIN Required' : 'Confirm Payment PIN'}
            </h3>
            {noPinConfigured ? (
              <p className="text-xs text-[#7A6B55] mt-2 font-semibold leading-relaxed">
                You haven't set a payment PIN yet. A PIN is required to authorize all outgoing transactions.
                Please set one in <strong className="text-[#1A1208]">Settings</strong> before sending money.
              </p>
            ) : description ? (
              <p className="text-xs text-[#7A6B55] mt-1 font-semibold">{description}</p>
            ) : (
              <p className="text-xs text-[#7A6B55] mt-1 font-semibold">Enter your 4-digit PIN to authorize this transaction.</p>
            )}
          </div>

          {/* Error */}
          {error && !noPinConfigured && (
            <div className="p-3 bg-red-100 border border-red-300 text-[#B5271E] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {noPinConfigured ? (
            /* No PIN — block and redirect to Settings */
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-display font-bold text-xs rounded border-2 border-[#1A1208] shadow-card transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={goToSettings}
                className="flex-1 py-2.5 bg-[#C4622D] hover:bg-[#A8501F] text-[#FAF7F2] font-display font-bold text-xs rounded border-2 border-[#1A1208] shadow-card transition-colors flex items-center justify-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                Set PIN Now
              </button>
            </div>
          ) : forgotPinStep === 'verify' ? (
            /* Forgot PIN — verify password */
            <form onSubmit={handleVerifyPasswordForPin} className="space-y-4 text-left">
              <p className="text-xs text-[#7A6B55] font-semibold text-center">Enter your login password to reset your PIN.</p>
              {forgotError && <p className="text-xs text-[#B5271E] font-bold text-center">{forgotError}</p>}
              <input type="password" value={forgotPassword} onChange={(e) => setForgotPassword(e.target.value)}
                placeholder="Login password" autoFocus
                className="w-full px-4 py-3 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-xl font-semibold text-center" required />
              <div className="flex gap-3">
                <button type="button" onClick={() => setForgotPinStep('hidden')}
                  className="flex-1 py-2.5 bg-[#FAF7F2] text-[#1A1208] font-bold text-xs rounded border-2 border-[#1A1208]">Back</button>
                <button type="submit" disabled={forgotLoading}
                  className="flex-1 py-2.5 bg-[#C4622D] text-white font-bold text-xs rounded border-2 border-[#1A1208] disabled:opacity-50">
                  {forgotLoading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          ) : forgotPinStep === 'newpin' ? (
            /* Forgot PIN — set new PIN */
            <form onSubmit={handleResetPin} className="space-y-4">
              <p className="text-xs text-[#7A6B55] font-semibold text-center">Password verified. Set your new 4-digit PIN.</p>
              {forgotError && <p className="text-xs text-[#B5271E] font-bold text-center">{forgotError}</p>}
              {forgotSuccess && <p className="text-xs text-green-700 font-bold text-center">{forgotSuccess}</p>}
              <div className="flex justify-center gap-4">
                {['new', 'new', 'new', 'new'].map((_, idx) => (
                  <input key={`new-${idx}`} type="password" inputMode="numeric" maxLength={1}
                    value={newPin[idx] || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (!val) return;
                      const arr = newPin.split('');
                      arr[idx] = val[val.length - 1];
                      setNewPin(arr.join(''));
                      if (idx < 3) document.getElementById(`np-${idx + 1}`)?.focus();
                    }}
                    id={`np-${idx}`}
                    className="w-12 h-12 text-center text-xl font-bold bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] rounded-xl outline-none" />
                ))}
              </div>
              <p className="text-[10px] text-[#7A6B55] text-center">Confirm new PIN</p>
              <div className="flex justify-center gap-4">
                {['conf', 'conf', 'conf', 'conf'].map((_, idx) => (
                  <input key={`conf-${idx}`} type="password" inputMode="numeric" maxLength={1}
                    value={confirmNewPin[idx] || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (!val) return;
                      const arr = confirmNewPin.split('');
                      arr[idx] = val[val.length - 1];
                      setConfirmNewPin(arr.join(''));
                      if (idx < 3) document.getElementById(`cp-${idx + 1}`)?.focus();
                    }}
                    id={`cp-${idx}`}
                    className="w-12 h-12 text-center text-xl font-bold bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] rounded-xl outline-none" />
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setForgotPinStep('verify')}
                  className="flex-1 py-2.5 bg-[#FAF7F2] text-[#1A1208] font-bold text-xs rounded border-2 border-[#1A1208]">Back</button>
                <button type="submit" disabled={forgotLoading}
                  className="flex-1 py-2.5 bg-[#C4622D] text-white font-bold text-xs rounded border-2 border-[#1A1208] disabled:opacity-50">
                  {forgotLoading ? 'Saving...' : 'Reset PIN'}
                </button>
              </div>
            </form>
          ) : (
            /* PIN configured — digit inputs */
            <>
              <div className="flex justify-center gap-4 py-2">
                {[0, 1, 2, 3].map((_, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { if (el) inputRefs.current[idx] = el; }}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={pin[idx] || ''}
                    onChange={(e) => handleChange(e, idx)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    disabled={loading}
                    className="w-12 h-12 text-center text-xl font-bold bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] rounded-xl outline-none transition-all disabled:opacity-50"
                  />
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-display font-bold text-xs rounded border-2 border-[#1A1208] shadow-card disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <button type="button" onClick={() => setForgotPinStep('verify')}
                className="text-xs font-bold text-[#7A6B55] hover:text-[#C4622D] hover:underline mt-1">
                Forgot PIN?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
