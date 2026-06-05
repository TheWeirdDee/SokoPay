import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCache } from '../context/CacheContext';
import {
  AlertTriangle, Check, Copy, Trash2, Plus, Landmark, Smartphone,
  ArrowLeft, Save, Sparkles, Loader2, User, Shield, CheckCircle,
  WifiOff, KeyRound, Lock, Eye, EyeOff, X, ExternalLink, CreditCard,
  MessageSquare, Phone
} from 'lucide-react';

function getCountryDisplay(code: string): string {
  if (code === 'NG') return '🇳🇬 Nigeria (NGN)';
  if (code === 'KE') return '🇰🇪 Kenya (KES)';
  return code;
}

interface MerchantProfile {
  id: string;
  businessName: string;
  phone: string;
  email?: string | null;
  country: string;
  walletAddress: string;
  isVerified: boolean;
  lowBalanceThreshold: number;
  dailySummaryEnabled: boolean;
  weeklyReportEnabled: boolean;
  paymentAlertsEnabled: boolean;
}

function Toggle({ enabled, onChange, label, description, disabled = false }: {
  enabled: boolean; onChange: (val: boolean) => void; label: string; description?: string; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#DDD5C5]/40 last:border-0">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-bold text-[#1A1208]">{label}</span>
        {description && <span className="text-xs text-[#7A6B55] mt-0.5">{description}</span>}
      </div>
      <button type="button" disabled={disabled} onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${enabled ? 'bg-[#C4622D]' : 'bg-[#DDD5C5]'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { profile: contextProfile, fetchProfile, withdrawalAccounts: accounts, fetchAccounts, loadingAccounts } = useCache();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState('5');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pwStep, setPwStep] = useState<'idle' | 'change'>('idle');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [accType, setAccType] = useState<'bank' | 'opay' | 'mpesa'>('bank');
  const [accNumber, setAccNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [isDefaultAcc, setIsDefaultAcc] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean | null>(null);
  const [pinStep, setPinStep] = useState<'idle' | 'set' | 'change'>('idle');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [forgotPinStep, setForgotPinStep] = useState<'hidden' | 'verify' | 'newpin'>('hidden');
  const [forgotPinPassword, setForgotPinPassword] = useState('');
  const [forgotNewPin, setForgotNewPin] = useState('');
  const [forgotConfirmPin, setForgotConfirmPin] = useState('');
  const [forgotPinLoading, setForgotPinLoading] = useState(false);
  const [forgotPinError, setForgotPinError] = useState('');

  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile as MerchantProfile);
      setBusinessName(contextProfile.businessName);
      setEmail((contextProfile as any).email || '');
      setLowBalanceThreshold(contextProfile.lowBalanceThreshold.toString());
      setAccType(contextProfile.country === 'KE' ? 'mpesa' : 'bank');
      setIsLoading(false);
    } else {
      fetchProfile().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
    }
  }, [contextProfile]);

  useEffect(() => {
    api.post('/auth/verify-pin', { pin: '____probe____' })
      .then((res: any) => { setHasPinConfigured(!res.data?.noPinConfigured); })
      .catch(() => { setHasPinConfigured(true); });
  }, []);

  useEffect(() => { fetchAccounts(); }, []);

  const handleCopyAddress = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true); setProfileError(''); setProfileSuccess('');
    const thresholdNum = parseFloat(lowBalanceThreshold);
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      setProfileError('Please enter a valid balance threshold.'); setIsSavingProfile(false); return;
    }
    try {
      const response = await api.patch('/merchant/update', { businessName, lowBalanceThreshold: thresholdNum, email: email.trim() || null });
      if (response.data.success) {
        const updated = response.data.merchant;
        setProfile(prev => prev ? { ...prev, ...updated } : prev);
        fetchProfile(true);
        setProfileSuccess('Profile updated successfully!');
      }
    } catch (err: any) {
      setProfileError(err.response?.data?.error || 'Failed to save profile.');
    } finally { setIsSavingProfile(false); }
  };

  const handleToggleSetting = async (key: 'dailySummaryEnabled' | 'weeklyReportEnabled' | 'paymentAlertsEnabled', currentValue: boolean) => {
    if (!profile) return;
    setProfile({ ...profile, [key]: !currentValue });
    try { await api.patch('/merchant/update', { [key]: !currentValue }); fetchProfile(true); }
    catch { setProfile({ ...profile, [key]: currentValue }); }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setLinkLoading(true); setLinkError(''); setLinkSuccess('');
    const payload: any = { type: accType, isDefault: isDefaultAcc };
    if (accType === 'mpesa') {
      if (!mpesaNumber) { setLinkError('M-Pesa number is required'); setLinkLoading(false); return; }
      payload.mpesaNumber = mpesaNumber;
    } else if (accType === 'opay') {
      if (!accNumber) { setLinkError('OPay number is required'); setLinkLoading(false); return; }
      payload.accountNumber = accNumber; payload.bankName = 'OPay'; payload.bankCode = '999992';
    } else {
      if (!accNumber || !bankName) { setLinkError('Account number and bank name required'); setLinkLoading(false); return; }
      payload.accountNumber = accNumber; payload.bankName = bankName; payload.bankCode = bankCode || '101';
    }
    try {
      const response = await api.post('/withdraw/accounts', payload);
      if (response.data.success) {
        setLinkSuccess('Account linked!');
        setMpesaNumber(''); setAccNumber(''); setBankName(''); setBankCode('');
        setIsDefaultAcc(false); setShowAddForm(false); fetchAccounts(true);
      }
    } catch (err: any) { setLinkError(err.response?.data?.error || 'Failed to link account.'); }
    finally { setLinkLoading(false); }
  };

  const handleSetDefaultAccount = async (id: string) => {
    try { await api.patch(`/withdraw/accounts/${id}/default`); fetchAccounts(true); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed.'); }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Unlink this withdrawal account?')) return;
    try { await api.delete(`/withdraw/accounts/${id}`); fetchAccounts(true); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed.'); }
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault(); setPinError('');
    if (!/^\d{4}$/.test(newPin)) { setPinError('PIN must be exactly 4 digits.'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return; }
    setPinLoading(true);
    try {
      const res = await api.post('/auth/set-pin', { pin: newPin });
      if (res.data.success) { setPinSuccess('Payment PIN set!'); setHasPinConfigured(true); setPinStep('idle'); setNewPin(''); setConfirmPin(''); }
    } catch (err: any) { setPinError(err.response?.data?.error || 'Failed to set PIN.'); }
    finally { setPinLoading(false); }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault(); setPinError('');
    if (!/^\d{4}$/.test(newPin)) { setPinError('New PIN must be exactly 4 digits.'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return; }
    if (!currentPinInput) { setPinError('Enter your current PIN.'); return; }
    setPinLoading(true);
    try {
      const res = await api.post('/auth/change-pin', { currentPin: currentPinInput, newPin });
      if (res.data.success) { setPinSuccess('PIN changed!'); setPinStep('idle'); setNewPin(''); setConfirmPin(''); setCurrentPinInput(''); }
    } catch (err: any) { setPinError(err.response?.data?.error || 'Failed to change PIN.'); }
    finally { setPinLoading(false); }
  };

  const handleForgotPinVerify = async (e: React.FormEvent) => {
    e.preventDefault(); setForgotPinError(''); setForgotPinLoading(true);
    try {
      await api.post('/auth/reset-pin-with-password', { password: forgotPinPassword, newPin: '0000' });
      setForgotPinStep('newpin');
    } catch (err: any) {
      const msg = err.response?.data?.error || '';
      if (msg.includes('PIN must be')) { setForgotPinStep('newpin'); }
      else { setForgotPinError(msg || 'Incorrect password.'); }
    } finally { setForgotPinLoading(false); }
  };

  const handleForgotPinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(forgotNewPin) || forgotNewPin !== forgotConfirmPin) {
      setForgotPinError('PINs must match and be 4 digits.'); return;
    }
    setForgotPinError(''); setForgotPinLoading(true);
    try {
      await api.post('/auth/reset-pin-with-password', { password: forgotPinPassword, newPin: forgotNewPin });
      setPinSuccess('PIN reset successfully!');
      setForgotPinStep('hidden'); setForgotPinPassword(''); setForgotNewPin(''); setForgotConfirmPin('');
    } catch (err: any) { setForgotPinError(err.response?.data?.error || 'Failed to reset PIN.'); }
    finally { setForgotPinLoading(false); }
  };

  const pwIsMinLength = newPassword.length >= 8;
  const pwHasUppercase = /[A-Z]/.test(newPassword);
  const pwHasNumber = /[0-9]/.test(newPassword);
  const pwHasSpecial = /[!@#$%^&*]/.test(newPassword);
  const pwMatch = newPassword === confirmNewPassword && newPassword !== '';
  const pwIsValid = pwIsMinLength && pwHasUppercase && pwHasNumber && pwHasSpecial && pwMatch;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); if (!pwIsValid) return;
    setPwError(''); setPwSuccess(''); setPwLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setPwSuccess('Password changed!'); setPwStep('idle');
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
    } catch (err: any) { setPwError(err.response?.data?.error || 'Failed to change password.'); }
    finally { setPwLoading(false); }
  };

  const handleSignOut = () => {
    ['sokopay_token', 'sokopay_qr_details', 'sokopay_cached_txs', 'sokopay_cached_stats'].forEach(k => localStorage.removeItem(k));
    navigate('/');
  };

  if (isLoading) return (
    <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#C4622D]" />
    </div>
  );
  if (!profile) return null;

  const NAV = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'wallet', label: 'Wallet', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'pin', label: 'Payment PIN', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'password', label: 'Password', icon: <Lock className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Shield className="w-4 h-4" /> },
    { id: 'coming-soon', label: 'Coming Soon', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'accounts', label: 'Settlement', icon: <Landmark className="w-4 h-4" /> },
  ];

  const scrollTo = (id: string) => document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const pinCls = 'w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors';
  const NG = '🇳🇬';
  const KE = '🇰🇪';
  const GH = '🇬🇭';
  const UG = '🇺🇬';
  const ZA = '🇿🇦';

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-body text-[#1A1208]">

      <div className="sticky top-0 z-30 bg-[#FAF7F2]/95 backdrop-blur border-b border-[#DDD5C5] px-4 md:px-8 h-14 flex items-center gap-4">
        <button onClick={() => navigate('/dashboard')} className="p-1.5 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-[#FAF7F2] transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-xl font-black tracking-tight">Settings</h1>
        <span className={`ml-auto text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border-2 border-[#1A1208] shadow-card ${profile.isVerified ? 'bg-[#5C6B3A] text-[#FAF7F2]' : 'bg-[#C4622D] text-[#FAF7F2]'}`}>
          {profile.isVerified ? 'Verified' : 'Unverified'}
        </span>
      </div>

      <div className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 border-b border-[#DDD5C5] bg-[#FAF7F2]" style={{ scrollbarWidth: 'none' }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => scrollTo(n.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1A1208] border-2 border-[#1A1208] rounded-full bg-[#F2EDE4] hover:bg-[#DDD5C5] transition-colors whitespace-nowrap">
            {n.icon}{n.label}
          </button>
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex gap-8 items-start">

        <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 sticky top-20">
          <p className="text-[10px] font-black text-[#7A6B55] uppercase tracking-widest mb-2 px-3">Navigation</p>
          {NAV.map(n => (
            <button key={n.id} onClick={() => scrollTo(n.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-[#1A1208] rounded-lg hover:bg-[#F2EDE4] hover:text-[#C4622D] transition-all text-left group">
              <span className="text-[#C4622D] group-hover:scale-110 transition-transform">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="border-t border-[#DDD5C5] mt-2 pt-2">
            <button onClick={handleSignOut} className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-[#B5271E] rounded-lg hover:bg-red-50 w-full">
              Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 space-y-6">

          <section id="section-profile" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <User className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Store & Profile</h2>
            </div>
            <div className="p-6 space-y-5">
              {profileSuccess && <div className="p-3 bg-green-50 border border-green-300 text-green-800 text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0" />{profileSuccess}</div>}
              {profileError && <div className="p-3 bg-red-50 border border-red-300 text-[#B5271E] text-xs font-bold rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{profileError}</div>}
              {!profile.email && (
                <div className="p-3 bg-[#C4622D]/10 border border-[#C4622D]/40 rounded-lg flex items-center gap-2 text-xs font-bold text-[#C4622D]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Add a recovery email to enable password and PIN reset.
                </div>
              )}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Business Name</label>
                    <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold transition-colors" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Low Balance Alert (cUSD)</label>
                    <div className="relative">
                      <input type="number" value={lowBalanceThreshold} onChange={e => setLowBalanceThreshold(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold transition-colors"
                        min="0" step="any" required />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-[#7A6B55] bg-[#F2EDE4] px-1.5 py-0.5 rounded border border-[#DDD5C5]">cUSD</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Recovery Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                    className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold transition-colors" />
                  <p className="text-[10px] text-[#7A6B55] mt-1 font-semibold">Used only for password and PIN reset</p>
                </div>
                <button type="submit" disabled={isSavingProfile}
                  className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-display font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card transition-all disabled:opacity-60">
                  {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes
                </button>
              </form>
              <div className="border-t border-[#DDD5C5] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-0.5">Phone</span>
                  <span className="font-semibold">{profile.phone}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-0.5">Market</span>
                  <span className="font-semibold">{getCountryDisplay(profile.country)}</span>
                </div>
              </div>
            </div>
          </section>

          <section id="section-wallet" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Your Celo Wallet</h2>
            </div>
            <div className="p-6">
              <div className="bg-[#FAF7F2] border-2 border-[#1A1208] rounded-lg p-4 space-y-3">
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Wallet Address</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-[#1A1208]">
                      {profile.walletAddress.slice(0, 10)}...{profile.walletAddress.slice(-6)}
                    </span>
                    <button onClick={handleCopyAddress}
                      className="flex items-center gap-1 px-2 py-1 border border-[#DDD5C5] bg-[#F2EDE4] rounded text-xs font-bold hover:bg-[#DDD5C5] transition-colors">
                      {copied ? <><Check className="w-3 h-3 text-green-700" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
                <a href={`https://celoscan.io/address/${profile.walletAddress}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C4622D] hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> View on Celo Explorer
                </a>
              </div>
            </div>
          </section>

          <section id="section-pin" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Payment PIN</h2>
              {hasPinConfigured !== null && (
                <span className={`ml-auto text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${hasPinConfigured ? 'bg-green-50 text-green-800 border-green-300' : 'bg-red-50 text-[#B5271E] border-red-300'}`}>
                  {hasPinConfigured ? 'PIN Set' : 'No PIN'}
                </span>
              )}
            </div>
            <div className="p-6 space-y-4">
              {pinSuccess && <div className="p-3 bg-green-50 border border-green-300 text-green-800 text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0" />{pinSuccess}</div>}
              {pinError && <div className="p-3 bg-red-50 border border-red-300 text-[#B5271E] text-xs font-bold rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{pinError}</div>}

              {pinStep === 'idle' && forgotPinStep === 'hidden' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#7A6B55] font-semibold">Your 4-digit PIN authorises every outgoing payment.{hasPinConfigured === false && ' Set one now to start sending money.'}</p>
                  <div className="flex flex-wrap gap-3 items-center">
                    {hasPinConfigured === false && (
                      <button onClick={() => { setPinError(''); setPinSuccess(''); setPinStep('set'); }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-xs rounded-md border-2 border-[#1A1208] shadow-card transition-all">
                        <KeyRound className="w-3.5 h-3.5" /> Set Payment PIN
                      </button>
                    )}
                    {hasPinConfigured === true && (
                      <>
                        <button onClick={() => { setPinError(''); setPinSuccess(''); setPinStep('change'); }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-bold text-xs rounded-md border-2 border-[#1A1208] shadow-card transition-all">
                          <KeyRound className="w-3.5 h-3.5" /> Change PIN
                        </button>
                        <button onClick={() => { setForgotPinError(''); setForgotPinStep('verify'); }}
                          className="text-xs font-bold text-[#7A6B55] hover:text-[#C4622D] hover:underline">
                          Forgot PIN?
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {pinStep === 'set' && (
                <form onSubmit={handleSetPin} className="space-y-4">
                  <p className="text-xs text-[#7A6B55] font-semibold">Choose a 4-digit numeric PIN.</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Confirm PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={pinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card disabled:opacity-60">
                      {pinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Set PIN
                    </button>
                    <button type="button" onClick={() => { setPinStep('idle'); setNewPin(''); setConfirmPin(''); setPinError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208]">Cancel</button>
                  </div>
                </form>
              )}

              {pinStep === 'change' && (
                <form onSubmit={handleChangePin} className="space-y-4">
                  <p className="text-xs text-[#7A6B55] font-semibold">Enter current PIN, then set a new one.</p>
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Current PIN</label>
                    <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={currentPinInput}
                      onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="w-40 px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={newPin}
                        onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Confirm New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={confirmPin}
                        onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={pinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card disabled:opacity-60">
                      {pinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Change PIN
                    </button>
                    <button type="button" onClick={() => { setPinStep('idle'); setNewPin(''); setConfirmPin(''); setCurrentPinInput(''); setPinError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208]">Cancel</button>
                  </div>
                </form>
              )}

              {forgotPinStep === 'verify' && (
                <form onSubmit={handleForgotPinVerify} className="space-y-4">
                  <p className="text-xs text-[#7A6B55] font-semibold">Enter your login password to reset your PIN.</p>
                  {forgotPinError && <p className="text-xs text-[#B5271E] font-bold">{forgotPinError}</p>}
                  <input type="password" value={forgotPinPassword} onChange={e => setForgotPinPassword(e.target.value)}
                    placeholder="Login password" autoFocus
                    className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold transition-colors" required />
                  <div className="flex gap-2">
                    <button type="submit" disabled={forgotPinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card disabled:opacity-60">
                      {forgotPinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Verify Password
                    </button>
                    <button type="button" onClick={() => { setForgotPinStep('hidden'); setForgotPinPassword(''); setForgotPinError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208]">Cancel</button>
                  </div>
                </form>
              )}

              {forgotPinStep === 'newpin' && (
                <form onSubmit={handleForgotPinReset} className="space-y-4">
                  <p className="text-xs text-[#7A6B55] font-semibold">Password verified. Set your new 4-digit PIN.</p>
                  {forgotPinError && <p className="text-xs text-[#B5271E] font-bold">{forgotPinError}</p>}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={forgotNewPin}
                        onChange={e => setForgotNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Confirm PIN</label>
                      <input type="password" inputMode="numeric" placeholder="****" maxLength={4} value={forgotConfirmPin}
                        onChange={e => setForgotConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} className={pinCls} required />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={forgotPinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card disabled:opacity-60">
                      {forgotPinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Reset PIN
                    </button>
                    <button type="button" onClick={() => { setForgotPinStep('verify'); setForgotNewPin(''); setForgotConfirmPin(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208]">Back</button>
                  </div>
                </form>
              )}
            </div>
          </section>

          <section id="section-password" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Login Password</h2>
            </div>
            <div className="p-6 space-y-4">
              {pwSuccess && <div className="p-3 bg-green-50 border border-green-300 text-green-800 text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0" />{pwSuccess}</div>}
              {pwError && <div className="p-3 bg-red-50 border border-red-300 text-[#B5271E] text-xs font-bold rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{pwError}</div>}
              {pwStep === 'idle' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#7A6B55] font-semibold">Your login password protects access to your SokoPay back-office.</p>
                  <button onClick={() => { setPwError(''); setPwSuccess(''); setPwStep('change'); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-bold text-xs rounded-md border-2 border-[#1A1208] shadow-card">
                    <Lock className="w-3.5 h-3.5" /> Change Password
                  </button>
                </div>
              )}
              {pwStep === 'change' && (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  {([
                    ['Current Password', currentPassword, setCurrentPassword, showCurrentPw, () => setShowCurrentPw((v: boolean) => !v)],
                    ['New Password', newPassword, setNewPassword, showNewPw, () => setShowNewPw((v: boolean) => !v)],
                    ['Confirm New Password', confirmNewPassword, setConfirmNewPassword, showConfirmPw, () => setShowConfirmPw((v: boolean) => !v)],
                  ] as [string, string, React.Dispatch<React.SetStateAction<string>>, boolean, () => void][]).map(([lbl, val, setter, show, toggle]) => (
                    <div key={lbl}>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">{lbl}</label>
                      <div className="relative">
                        <input type={show ? 'text' : 'password'} value={val} onChange={e => setter(e.target.value)}
                          className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold transition-colors pr-10" required />
                        <button type="button" onClick={toggle} className="absolute right-3 top-2.5 text-[#7A6B55]">
                          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="bg-[#FAF7F2] p-3 rounded-lg border border-[#DDD5C5] space-y-1.5 text-xs font-bold">
                    {([
                      [pwIsMinLength, 'At least 8 characters'],
                      [pwHasUppercase, 'One uppercase letter (A-Z)'],
                      [pwHasNumber, 'One number (0-9)'],
                      [pwHasSpecial, 'One special character (!@#$%^&*)'],
                      [pwMatch, 'Passwords match'],
                    ] as [boolean, string][]).map(([met, lbl]) => (
                      <div key={lbl} className="flex items-center gap-2">
                        {met ? <Check className="w-3.5 h-3.5 text-green-700" /> : <X className="w-3.5 h-3.5 text-red-700" />}
                        <span className={met ? 'text-green-700' : 'text-[#7A6B55]'}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={pwLoading || !pwIsValid}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card disabled:opacity-60">
                      {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Password
                    </button>
                    <button type="button" onClick={() => { setPwStep('idle'); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setPwError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208]">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </section>

          <section id="section-notifications" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Notification Subscriptions</h2>
            </div>
            <div className="divide-y divide-[#DDD5C5]/50 px-6">
              <Toggle enabled={profile.dailySummaryEnabled} onChange={() => handleToggleSetting('dailySummaryEnabled', profile.dailySummaryEnabled)}
                label="Daily Summary Report" description="8:00 AM digest of earnings, counts, and agent insights." />
              <Toggle enabled={profile.weeklyReportEnabled} onChange={() => handleToggleSetting('weeklyReportEnabled', profile.weeklyReportEnabled)}
                label="Weekly Report" description="Sunday cashflow forecasting and breakdown metrics." />
              <Toggle enabled={profile.paymentAlertsEnabled} onChange={() => handleToggleSetting('paymentAlertsEnabled', profile.paymentAlertsEnabled)}
                label="Instant Payment Alerts" description="Real-time alerts when payments clear on your dashboard." />
            </div>
          </section>

          <section id="section-coming-soon" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Coming Soon</h2>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-start gap-3 p-3 bg-[#FAF7F2] border border-[#DDD5C5] rounded-lg">
                <MessageSquare className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#1A1208]">WhatsApp Notifications</span>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-[#C4622D]/15 text-[#C4622D] border border-[#C4622D]/30 rounded-full">Q3 2026</span>
                  </div>
                  <p className="text-xs text-[#7A6B55] font-semibold mt-0.5">Payment alerts and daily reports delivered on WhatsApp.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[#FAF7F2] border border-[#DDD5C5] rounded-lg">
                <Phone className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#1A1208]">SMS Notifications</span>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-[#C4622D]/15 text-[#C4622D] border border-[#C4622D]/30 rounded-full">Q4 2026</span>
                  </div>
                  <p className="text-xs text-[#7A6B55] font-semibold mt-0.5">Fallback SMS alerts for critical account events.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-[#FAF7F2] border border-[#DDD5C5] rounded-lg">
                <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#1A1208]">Additional Countries</span>
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-[#C4622D]/15 text-[#C4622D] border border-[#C4622D]/30 rounded-full">Q3 2026</span>
                  </div>
                  <p className="text-xs text-[#7A6B55] font-semibold mt-0.5">Expanding to {GH} Ghana, {UG} Uganda, {ZA} South Africa.</p>
                </div>
              </div>
            </div>
          </section>

          <section id="section-accounts" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#C4622D]" />
                <h2 className="font-display font-black text-base">Settlement Accounts</h2>
              </div>
              {!showAddForm && (
                <button onClick={() => { setLinkError(''); setLinkSuccess(''); setShowAddForm(true); }}
                  className="text-xs font-bold text-[#C4622D] flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FAF7F2] border-2 border-[#1A1208] rounded-md shadow-card">
                  <Plus className="w-3.5 h-3.5" /> Link Account
                </button>
              )}
            </div>
            <div className="p-6 space-y-4">
              {linkSuccess && <div className="p-3 bg-green-50 border border-green-300 text-green-800 text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0" />{linkSuccess}</div>}
              {showAddForm && (
                <div className="bg-[#FAF7F2] border-2 border-[#1A1208] p-4 rounded-lg space-y-4">
                  <div className="flex justify-between items-center border-b border-[#DDD5C5] pb-2">
                    <h3 className="font-display font-bold text-sm">Link New Account</h3>
                    <button onClick={() => setShowAddForm(false)} className="text-xs text-[#7A6B55] font-bold">Cancel</button>
                  </div>
                  {linkError && <div className="p-2 bg-red-50 border border-red-300 text-[#B5271E] text-xs font-bold rounded flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{linkError}</div>}
                  <form onSubmit={handleLinkAccount} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1.5">Account Type</label>
                      <div className="flex flex-wrap gap-4 bg-[#F2EDE4] p-2.5 rounded-md border border-[#DDD5C5]">
                        {profile.country === 'KE' ? (
                          <label className="flex items-center gap-2 font-bold text-xs cursor-pointer select-none">
                            <input type="radio" name="accType" value="mpesa" checked={accType === 'mpesa'} onChange={() => setAccType('mpesa')} />
                            {KE} M-Pesa
                          </label>
                        ) : (
                          <>
                            <label className="flex items-center gap-2 font-bold text-xs cursor-pointer select-none">
                              <input type="radio" name="accType" value="bank" checked={accType === 'bank'} onChange={() => setAccType('bank')} />
                              {NG} Bank
                            </label>
                            <label className="flex items-center gap-2 font-bold text-xs cursor-pointer select-none">
                              <input type="radio" name="accType" value="opay" checked={accType === 'opay'} onChange={() => setAccType('opay')} />
                              {NG} OPay
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                    {accType === 'mpesa' ? (
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">M-Pesa Number</label>
                        <input type="text" placeholder="+254 712345678" value={mpesaNumber} onChange={e => setMpesaNumber(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                      </div>
                    ) : accType === 'opay' ? (
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">OPay Account (Phone)</label>
                        <input type="text" placeholder="08031234567" value={accNumber} onChange={e => setAccNumber(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Account Number</label>
                          <input type="text" placeholder="0123456789" value={accNumber} onChange={e => setAccNumber(e.target.value)}
                            className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Name</label>
                            <input type="text" placeholder="GTBank, Access..." value={bankName} onChange={e => setBankName(e.target.value)}
                              className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Code</label>
                            <input type="text" placeholder="058" value={bankCode} onChange={e => setBankCode(e.target.value)}
                              className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" />
                          </div>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 font-bold text-xs cursor-pointer select-none">
                      <input type="checkbox" checked={isDefaultAcc} onChange={e => setIsDefaultAcc(e.target.checked)} className="w-4 h-4" />
                      Set as default off-ramp channel
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={linkLoading}
                        className="flex-1 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-xs rounded border-2 border-[#1A1208] shadow-card">
                        {linkLoading ? 'Linking...' : 'Link Account'}
                      </button>
                      <button type="button" onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-xs rounded border-2 border-[#1A1208]">Cancel</button>
                    </div>
                  </form>
                </div>
              )}
              {loadingAccounts ? (
                <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-[#C4622D]" /></div>
              ) : accounts.length === 0 ? (
                <div className="border-2 border-dashed border-[#DDD5C5] p-8 rounded-lg text-center text-[#7A6B55] text-xs">
                  <Landmark className="w-8 h-8 text-[#DDD5C5] mx-auto mb-2" />
                  No settlement accounts linked yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map((acc) => (
                    <div key={acc.id} className="bg-[#FAF7F2] border-2 border-[#1A1208] rounded-lg p-4 shadow-card flex justify-between items-center gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card">
                          {acc.type === 'mpesa' ? <Smartphone className="w-4 h-4 text-[#C4622D]" /> : <Landmark className="w-4 h-4 text-[#C4622D]" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm flex items-center gap-2">
                            {acc.type === 'mpesa' ? 'M-Pesa' : acc.type === 'opay' ? 'OPay' : acc.bankName}
                            {acc.isDefault && <span className="bg-green-50 text-green-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-green-300">Default</span>}
                          </div>
                          <div className="text-xs text-[#7A6B55] font-mono">{acc.type === 'mpesa' ? acc.mpesaNumber : acc.accountNumber}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!acc.isDefault && (
                          <button onClick={() => handleSetDefaultAccount(acc.id)} className="text-[10px] font-bold text-green-800 bg-white px-2 py-1 rounded border border-[#DDD5C5] hover:underline">Set Default</button>
                        )}
                        <button onClick={() => handleDeleteAccount(acc.id)} className="p-1.5 border border-red-200 bg-red-50 text-[#B5271E] rounded hover:bg-red-100">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section id="section-bridges" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base">Bridges & Offline Mode</h2>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#FAF7F2] p-4 rounded-lg border border-[#DDD5C5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1208]">Country Bridges</span>
                  <span className="bg-green-50 text-green-800 border border-green-300 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">2 Active</span>
                </div>
                <p className="text-xs text-[#7A6B55] font-semibold">{NG} Nigeria & {KE} Kenya</p>
                <p className="text-[10px] text-[#7A6B55]/70 font-semibold">Coming Q3: {GH} {UG} {ZA}</p>
              </div>
              <div className="bg-[#FAF7F2] p-4 rounded-lg border border-[#DDD5C5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1208]">Offline USSD</span>
                  <span className="bg-orange-50 text-orange-800 border border-orange-300 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Sandbox</span>
                </div>
                <p className="text-xs text-[#7A6B55] font-semibold">Dial <span className="font-mono font-bold text-[#1A1208]">*384*402#</span> to check balance and request withdrawals offline.</p>
              </div>
            </div>
          </section>

          <button onClick={handleSignOut} className="w-full py-3 bg-[#B5271E] hover:bg-red-800 text-white font-display font-black rounded-lg border-2 border-[#1A1208] shadow-card transition-all md:hidden">
            Sign Out of Account
          </button>

        </div>
      </div>
    </div>
  );
}
