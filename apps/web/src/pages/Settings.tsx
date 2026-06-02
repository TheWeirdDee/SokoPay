import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCache } from '../context/CacheContext';
import { 
  AlertTriangle, 
  FlaskConical, 
  Check, 
  Copy, 
  Trash2, 
  Plus, 
  Landmark, 
  Smartphone, 
  ArrowLeft, 
  Save, 
  Sparkles,
  Loader2,
  User,
  Shield,
  CheckCircle,
  WifiOff,
  KeyRound
} from 'lucide-react';

interface MerchantProfile {
  id: string;
  businessName: string;
  phone: string;
  country: string;
  walletAddress: string;
  isVerified: boolean;
  lowBalanceThreshold: number;
  dailySummaryEnabled: boolean;
  weeklyReportEnabled: boolean;
  paymentAlertsEnabled: boolean;
}



// Toggle Switch Component
function Toggle({ enabled, onChange, label, description, disabled = false }: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
      <div className="flex flex-col pr-4">
        <span className="text-sm font-bold text-[#1A1208]">{label}</span>
        {description && <span className="text-xs text-[#7A6B55] mt-0.5">{description}</span>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-[#C4622D]' : 'bg-[#DDD5C5]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { profile: contextProfile, fetchProfile, withdrawalAccounts: accounts, fetchAccounts, loadingAccounts } = useCache();
  
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Profile Edits State
  const [businessName, setBusinessName] = useState('');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState('5');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  
  // Add Account Form State
  const [accType, setAccType] = useState<'bank' | 'opay' | 'mpesa'>('bank');
  const [accNumber, setAccNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [isDefaultAcc, setIsDefaultAcc] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');

  // PIN Management State
  const [hasPinConfigured, setHasPinConfigured] = useState<boolean | null>(null);
  const [pinStep, setPinStep] = useState<'idle' | 'set' | 'change'>('idle');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  // General States
  const [copied, setCopied] = useState(false);
  const [isTogglingCountry, setIsTogglingCountry] = useState(false);

  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
      setBusinessName(contextProfile.businessName);
      setLowBalanceThreshold(contextProfile.lowBalanceThreshold.toString());
      setAccType(contextProfile.country === 'KE' ? 'mpesa' : 'bank');
      setIsLoading(false);
    } else {
      // absolute fallback: fetch it if context didn't load it yet (shouldn't happen)
      fetchProfile().then(() => {
        setIsLoading(false);
      }).catch((err) => {
        setError(err?.response?.data?.error || 'Failed to load profile.');
        setIsLoading(false);
      });
    }
  }, [contextProfile]);

  // Probe if PIN is configured on mount
  useEffect(() => {
    api.post('/auth/verify-pin', { pin: '____probe____' }).catch((err) => {
      const data = err?.response?.data;
      if (data?.noPinConfigured) {
        setHasPinConfigured(false);
      } else {
        setHasPinConfigured(true);
      }
    });
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Update Profile details
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    const thresholdNum = parseFloat(lowBalanceThreshold);
    if (isNaN(thresholdNum) || thresholdNum < 0) {
      setProfileError('Please enter a valid balance threshold amount.');
      setIsSavingProfile(false);
      return;
    }

    try {
      const response = await api.patch('/merchant/update', {
        businessName,
        lowBalanceThreshold: thresholdNum
      });
      if (response.data.success) {
        fetchProfile(true);
        setProfileSuccess('Profile settings updated successfully!');
      }
    } catch (err: any) {
      console.error(err);
      setProfileError(err.response?.data?.error || 'Failed to save profile details.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Immediate update toggle settings
  const handleToggleSetting = async (key: 'dailySummaryEnabled' | 'weeklyReportEnabled' | 'paymentAlertsEnabled', currentValue: boolean) => {
    if (!profile) return;
    const newValue = !currentValue;
    
    // Optimistic Update
    setProfile({
      ...profile,
      [key]: newValue
    });

    try {
      const response = await api.patch('/merchant/update', {
        [key]: newValue
      });
      if (response.data.success) {
        fetchProfile(true);
      }
    } catch (err: any) {
      console.error(err);
      // Revert if error
      setProfile({
        ...profile,
        [key]: currentValue
      });
      alert(err.response?.data?.error || 'Failed to update notification channel.');
    }
  };

  // Link new account
  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkLoading(true);
    setLinkError('');
    setLinkSuccess('');

    const payload: any = {
      type: accType,
      isDefault: isDefaultAcc
    };

    if (accType === 'mpesa') {
      if (!mpesaNumber) {
        setLinkError('M-Pesa number is required');
        setLinkLoading(false);
        return;
      }
      payload.mpesaNumber = mpesaNumber;
    } else if (accType === 'opay') {
      if (!accNumber) {
        setLinkError('OPay account number (phone number) is required');
        setLinkLoading(false);
        return;
      }
      payload.accountNumber = accNumber;
      payload.bankName = 'OPay';
      payload.bankCode = '999992';
    } else {
      if (!accNumber || !bankName) {
        setLinkError('Bank account number and name are required');
        setLinkLoading(false);
        return;
      }
      payload.accountNumber = accNumber;
      payload.bankName = bankName;
      payload.bankCode = bankCode || '101';
    }

    try {
      const response = await api.post('/withdraw/accounts', payload);
      if (response.data.success) {
        setLinkSuccess('Withdrawal account linked successfully!');
        setMpesaNumber('');
        setAccNumber('');
        setBankName('');
        setBankCode('');
        setIsDefaultAcc(false);
        setShowAddForm(false);
        fetchAccounts(true);
      }
    } catch (err: any) {
      console.error(err);
      setLinkError(err.response?.data?.error || 'Failed to link account.');
    } finally {
      setLinkLoading(false);
    }
  };

  // Set default account
  const handleSetDefaultAccount = async (id: string) => {
    try {
      const response = await api.patch(`/withdraw/accounts/${id}/default`);
      if (response.data.success) {
        fetchAccounts(true);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to set account as default.');
    }
  };

  // Delete account
  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to unlink this withdrawal account?')) return;
    try {
      const response = await api.delete(`/withdraw/accounts/${id}`);
      if (response.data.success) {
        fetchAccounts(true);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete account.');
    }
  };

  // Toggle Sandbox Country Context
  const handleToggleCountry = async () => {
    setIsTogglingCountry(true);
    try {
      const response = await api.post('/merchant/toggle-country');
      if (response.data.success) {
        alert(`Country toggled to: ${response.data.country === 'KE' ? 'Kenya (KES)' : 'Nigeria (NGN)'}`);
        fetchProfile();
        fetchAccounts();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to toggle country context.');
    } finally {
      setIsTogglingCountry(false);
    }
  };

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('PIN must be exactly 4 digits (numbers only).');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match. Please re-enter.');
      return;
    }
    setPinLoading(true);
    try {
      const res = await api.post('/auth/set-pin', { pin: newPin });
      if (res.data.success) {
        setPinSuccess('Payment PIN set successfully! You can now authorize transactions.');
        setHasPinConfigured(true);
        setPinStep('idle');
        setNewPin('');
        setConfirmPin('');
      }
    } catch (err: any) {
      setPinError(err.response?.data?.error || 'Failed to set PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    if (!/^\d{4}$/.test(newPin)) {
      setPinError('New PIN must be exactly 4 digits (numbers only).');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match. Please re-enter.');
      return;
    }
    if (!currentPinInput) {
      setPinError('Please enter your current PIN.');
      return;
    }
    setPinLoading(true);
    try {
      const res = await api.post('/auth/change-pin', { currentPin: currentPinInput, newPin });
      if (res.data.success) {
        setPinSuccess('Payment PIN changed successfully!');
        setPinStep('idle');
        setNewPin('');
        setConfirmPin('');
        setCurrentPinInput('');
      }
    } catch (err: any) {
      setPinError(err.response?.data?.error || 'Failed to change PIN.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('sokopay_token');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] font-body flex items-center justify-center">
        <div className="w-full max-w-5xl px-6 space-y-4 animate-pulse">
          <div className="h-8 bg-[#F2EDE4] rounded w-32" />
          <div className="flex gap-6">
            <div className="w-56 h-96 bg-[#F2EDE4] rounded-xl" />
            <div className="flex-1 space-y-4">
              <div className="h-48 bg-[#F2EDE4] rounded-xl" />
              <div className="h-40 bg-[#F2EDE4] rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] font-body flex items-center justify-center p-6">
        <div className="bg-[#F2EDE4] border-2 border-[#B5271E] p-8 rounded-xl shadow-card text-center max-w-md space-y-4">
          <AlertTriangle className="w-8 h-8 text-[#B5271E] mx-auto" />
          <h2 className="font-display font-bold text-lg text-[#1A1208]">Error Loading Profile</h2>
          <p className="text-sm text-[#7A6B55]">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-[#C4622D] text-white rounded font-bold border-2 border-[#1A1208] shadow-card hover:bg-[#A8501F]">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const NAV = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'pin', label: 'Payment PIN', icon: <KeyRound className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Shield className="w-4 h-4" /> },
    { id: 'accounts', label: 'Settlement', icon: <Landmark className="w-4 h-4" /> },
    { id: 'bridges', label: 'Bridges & Offline', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'developer', label: 'Developer', icon: <FlaskConical className="w-4 h-4" /> },
  ];

  const scrollTo = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-body text-[#1A1208]">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-30 bg-[#FAF7F2]/95 backdrop-blur border-b border-[#DDD5C5] px-4 md:px-8 h-14 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-1.5 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-[#FAF7F2] transition-all active:translate-x-[1px] active:translate-y-[1px]"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-xl font-black tracking-tight">Settings</h1>
        <span className={`ml-auto text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border-2 border-[#1A1208] shadow-card ${
          profile.isVerified ? 'bg-[#5C6B3A] text-[#FAF7F2]' : 'bg-[#C4622D] text-[#FAF7F2]'
        }`}>
          {profile.isVerified ? 'âœ“ Verified' : 'Unverified'}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex gap-8 items-start">

        {/* LEFT â€” Sticky Sidebar Nav */}
        <aside className="hidden md:flex flex-col gap-1 w-52 shrink-0 sticky top-20">
          <p className="text-[10px] font-black text-[#7A6B55] uppercase tracking-widest mb-2 px-3">Navigation</p>
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-[#1A1208] rounded-lg hover:bg-[#F2EDE4] hover:text-[#C4622D] transition-all text-left group"
            >
              <span className="text-[#C4622D] group-hover:scale-110 transition-transform">{n.icon}</span>
              {n.label}
            </button>
          ))}
          <div className="border-t border-[#DDD5C5] mt-2 pt-2">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-bold text-[#B5271E] rounded-lg hover:bg-red-50 transition-all w-full"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* RIGHT â€” Content Sections */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* â”€â”€ PROFILE â”€â”€ */}
          <section id="section-profile" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <User className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base text-[#1A1208]">Store & Profile</h2>
            </div>
            <div className="p-6 space-y-5">
              {profileSuccess && (
                <div className="p-3 bg-success/15 border border-success text-success text-xs font-bold rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />{profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="p-3 bg-error/15 border border-error text-error text-xs font-bold rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{profileError}
                </div>
              )}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Business Name</label>
                    <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-[#1A1208] transition-colors" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Low Balance Alert (cUSD)</label>
                    <div className="relative">
                      <input type="number" value={lowBalanceThreshold} onChange={(e) => setLowBalanceThreshold(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-[#1A1208] transition-colors"
                        min="0" step="any" required />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-[#7A6B55] bg-[#F2EDE4] px-1.5 py-0.5 rounded border border-[#DDD5C5]">cUSD</span>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={isSavingProfile}
                  className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-display font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card transition-all active:translate-y-[1px] disabled:opacity-60">
                  {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </form>

              {/* Read-only info */}
              <div className="border-t border-[#DDD5C5] pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-0.5">Phone</span>
                  <span className="font-semibold">{profile.phone}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-0.5">Market</span>
                  <span className="font-semibold">{profile.country === 'KE' ? 'ðŸ‡°ðŸ‡ª Kenya (KES)' : 'ðŸ‡³ðŸ‡¬ Nigeria (NGN)'}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-0.5">Celo Wallet</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-[#C4622D] truncate">{profile.walletAddress.slice(0,8)}â€¦{profile.walletAddress.slice(-4)}</span>
                    <button onClick={() => handleCopyAddress(profile.walletAddress)} className="p-1 border border-[#DDD5C5] rounded hover:bg-[#FAF7F2]" title="Copy">
                      {copied ? <Check className="w-3 h-3 text-green-700" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* â”€â”€ PAYMENT PIN â”€â”€ */}
          <section id="section-pin" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base text-[#1A1208]">Payment PIN & Security</h2>
              {hasPinConfigured !== null && (
                <span className={`ml-auto text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                  hasPinConfigured ? 'bg-[#5C6B3A]/15 text-[#5C6B3A] border-[#5C6B3A]/30' : 'bg-[#B5271E]/10 text-[#B5271E] border-[#B5271E]/30'
                }`}>
                  {hasPinConfigured ? 'âœ“ PIN Set' : 'âš  No PIN'}
                </span>
              )}
            </div>
            <div className="p-6 space-y-4">
              {pinSuccess && <div className="p-3 bg-success/15 border border-success text-success text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0"/>{pinSuccess}</div>}
              {pinError && <div className="p-3 bg-error/15 border border-error text-error text-xs font-bold rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/>{pinError}</div>}

              {pinStep === 'idle' && (
                <div className="space-y-3">
                  <p className="text-xs text-[#7A6B55] font-semibold">
                    Your 4-digit PIN authorises every outgoing payment.
                    {hasPinConfigured === false && <span className="text-[#B5271E] font-bold"> No PIN set â€” you can't send money yet.</span>}
                  </p>
                  <div className="flex gap-3">
                    {hasPinConfigured === false && (
                      <button onClick={() => { setPinError(''); setPinSuccess(''); setPinStep('set'); }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-xs rounded-md border-2 border-[#1A1208] shadow-card transition-all">
                        <KeyRound className="w-3.5 h-3.5" /> Set Payment PIN
                      </button>
                    )}
                    {hasPinConfigured === true && (
                      <button onClick={() => { setPinError(''); setPinSuccess(''); setPinStep('change'); }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-bold text-xs rounded-md border-2 border-[#1A1208] shadow-card transition-all">
                        <KeyRound className="w-3.5 h-3.5" /> Change PIN
                      </button>
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
                      <input type="password" inputMode="numeric" placeholder="â€¢â€¢â€¢â€¢" maxLength={4} value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Confirm PIN</label>
                      <input type="password" inputMode="numeric" placeholder="â€¢â€¢â€¢â€¢" maxLength={4} value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={pinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card transition-all disabled:opacity-60">
                      {pinLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <KeyRound className="w-4 h-4"/>} Set PIN
                    </button>
                    <button type="button" onClick={() => { setPinStep('idle'); setNewPin(''); setConfirmPin(''); setPinError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208] transition-all">Cancel</button>
                  </div>
                </form>
              )}

              {pinStep === 'change' && (
                <form onSubmit={handleChangePin} className="space-y-4">
                  <p className="text-xs text-[#7A6B55] font-semibold">Verify current PIN, then set a new one.</p>
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Current PIN</label>
                    <input type="password" inputMode="numeric" placeholder="â€¢â€¢â€¢â€¢" maxLength={4} value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g,'').slice(0,4))}
                      className="w-40 px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="â€¢â€¢â€¢â€¢" maxLength={4} value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Confirm New PIN</label>
                      <input type="password" inputMode="numeric" placeholder="â€¢â€¢â€¢â€¢" maxLength={4} value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
                        className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md text-center tracking-[0.5em] font-semibold transition-colors" required />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={pinLoading}
                      className="flex items-center gap-2 px-5 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card transition-all disabled:opacity-60">
                      {pinLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <KeyRound className="w-4 h-4"/>} Change PIN
                    </button>
                    <button type="button" onClick={() => { setPinStep('idle'); setNewPin(''); setConfirmPin(''); setCurrentPinInput(''); setPinError(''); }}
                      className="px-4 py-2 bg-[#FAF7F2] text-[#1A1208] font-bold text-sm rounded-md border-2 border-[#1A1208] transition-all">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </section>

          {/* â”€â”€ NOTIFICATIONS â”€â”€ */}
          <section id="section-notifications" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base text-[#1A1208]">Notification Subscriptions</h2>
            </div>
            <div className="divide-y divide-[#DDD5C5]/50">
              <Toggle enabled={profile.dailySummaryEnabled}
                onChange={() => handleToggleSetting('dailySummaryEnabled', profile.dailySummaryEnabled)}
                label="Daily Summary Report" description="8:00 AM digest of earnings, counts, and agent insights." />
              <Toggle enabled={profile.weeklyReportEnabled}
                onChange={() => handleToggleSetting('weeklyReportEnabled', profile.weeklyReportEnabled)}
                label="Weekly Report" description="Sunday cashflow forecasting and breakdown metrics." />
              <Toggle enabled={profile.paymentAlertsEnabled}
                onChange={() => handleToggleSetting('paymentAlertsEnabled', profile.paymentAlertsEnabled)}
                label="Instant Payment Alerts" description="Real-time alerts when payments clear on your dashboard." />
            </div>
          </section>

          {/* â”€â”€ SETTLEMENT ACCOUNTS â”€â”€ */}
          <section id="section-accounts" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-[#C4622D]" />
                <h2 className="font-display font-black text-base text-[#1A1208]">Settlement Accounts</h2>
              </div>
              {!showAddForm && (
                <button onClick={() => { setLinkError(''); setLinkSuccess(''); setShowAddForm(true); }}
                  className="text-xs font-bold text-[#C4622D] hover:text-[#A8501F] flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FAF7F2] border-2 border-[#1A1208] rounded-md shadow-card hover:shadow-hover transition-all">
                  <Plus className="w-3.5 h-3.5" /> Link Account
                </button>
              )}
            </div>
            <div className="p-6 space-y-4">
              {linkSuccess && <div className="p-3 bg-success/15 border border-success text-success text-xs font-bold rounded-lg flex items-center gap-2"><CheckCircle className="w-4 h-4 shrink-0"/>{linkSuccess}</div>}
              {showAddForm && (
                <div className="bg-[#FAF7F2] border-2 border-[#1A1208] p-4 rounded-lg space-y-4">
                  <div className="flex justify-between items-center border-b border-[#DDD5C5] pb-2">
                    <h3 className="font-display font-bold text-sm">Link New Account</h3>
                    <button onClick={() => setShowAddForm(false)} className="text-xs text-[#7A6B55] font-bold hover:text-[#1A1208]">Cancel</button>
                  </div>
                  {linkError && <div className="p-2 bg-error/15 border border-error text-error text-xs font-bold rounded flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/>{linkError}</div>}
                  <form onSubmit={handleLinkAccount} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1.5">Account Type</label>
                      <div className="flex flex-wrap gap-4 bg-[#F2EDE4] p-2.5 rounded-md border border-[#DDD5C5]">
                        {profile.country === 'KE' ? (
                          <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                            <input type="radio" name="accType" value="mpesa" checked={accType === 'mpesa'} onChange={() => setAccType('mpesa')} className="text-[#C4622D]" />
                            ðŸ‡°ðŸ‡ª M-Pesa
                          </label>
                        ) : (
                          <>
                            <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                              <input type="radio" name="accType" value="bank" checked={accType === 'bank'} onChange={() => setAccType('bank')} className="text-[#C4622D]" />
                              ðŸ‡³ðŸ‡¬ Bank
                            </label>
                            <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                              <input type="radio" name="accType" value="opay" checked={accType === 'opay'} onChange={() => setAccType('opay')} className="text-[#C4622D]" />
                              ðŸ‡³ðŸ‡¬ OPay
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                    {accType === 'mpesa' ? (
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">M-Pesa Number</label>
                        <input type="text" placeholder="+254 712345678" value={mpesaNumber} onChange={(e) => setMpesaNumber(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                      </div>
                    ) : accType === 'opay' ? (
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">OPay Account (Phone)</label>
                        <input type="text" placeholder="08031234567" value={accNumber} onChange={(e) => setAccNumber(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Account Number</label>
                          <input type="text" placeholder="0123456789" value={accNumber} onChange={(e) => setAccNumber(e.target.value)}
                            className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Name</label>
                            <input type="text" placeholder="GTBank, Accessâ€¦" value={bankName} onChange={(e) => setBankName(e.target.value)}
                              className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" required />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Code</label>
                            <input type="text" placeholder="058" value={bankCode} onChange={(e) => setBankCode(e.target.value)}
                              className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm" />
                          </div>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                      <input type="checkbox" checked={isDefaultAcc} onChange={(e) => setIsDefaultAcc(e.target.checked)} className="rounded border-[#1A1208] text-[#C4622D] w-4 h-4" />
                      Set as default off-ramp channel
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={linkLoading}
                        className="flex-1 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-bold text-xs rounded border-2 border-[#1A1208] shadow-card transition-all">
                        {linkLoading ? 'Linkingâ€¦' : 'Link Account'}
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
                            {acc.isDefault && <span className="bg-[#5C6B3A]/15 text-[#5C6B3A] text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-[#5C6B3A]/30">Default</span>}
                          </div>
                          <div className="text-xs text-[#7A6B55] font-mono">{acc.type === 'mpesa' ? acc.mpesaNumber : acc.accountNumber}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!acc.isDefault && (
                          <button onClick={() => handleSetDefaultAccount(acc.id)} className="text-[10px] font-bold text-[#5C6B3A] bg-white px-2 py-1 rounded border border-[#DDD5C5] hover:underline">Set Default</button>
                        )}
                        <button onClick={() => handleDeleteAccount(acc.id)} className="p-1.5 border border-red-200 bg-red-50 text-[#B5271E] rounded hover:bg-red-100 transition-colors" title="Unlink">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* â”€â”€ BRIDGES & OFFLINE â”€â”€ */}
          <section id="section-bridges" className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#DDD5C5] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base text-[#1A1208]">Bridges & Offline Mode</h2>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#FAF7F2] p-4 rounded-lg border border-[#DDD5C5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5"><Landmark className="w-4 h-4 text-teal-600" /> Country Bridges</span>
                  <span className="bg-[#5C6B3A]/15 text-[#5C6B3A] border border-[#5C6B3A]/30 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">2 Active</span>
                </div>
                <p className="text-xs text-[#7A6B55] font-semibold">ðŸ‡³ðŸ‡¬ Nigeria & ðŸ‡°ðŸ‡ª Kenya</p>
                <p className="text-[10px] text-[#7A6B55]/70 font-semibold">Coming Q3: ðŸ‡¬ðŸ‡­ ðŸ‡ºðŸ‡¬ ðŸ‡¿ðŸ‡¦</p>
              </div>
              <div className="bg-[#FAF7F2] p-4 rounded-lg border border-[#DDD5C5] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5"><WifiOff className="w-4 h-4 text-orange-600" /> Offline USSD</span>
                  <span className="bg-[#5C6B3A]/15 text-[#5C6B3A] border border-[#5C6B3A]/30 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Sandbox</span>
                </div>
                <p className="text-xs text-[#7A6B55] font-semibold">Dial <span className="font-mono font-bold text-[#1A1208]">*384*402#</span> to check balance and request withdrawals offline.</p>
              </div>
            </div>
          </section>

          {/* â”€â”€ DEVELOPER â”€â”€ */}
          <section id="section-developer" className="bg-[#FAF7F2] border-2 border-dashed border-[#C4622D] rounded-xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-[#C4622D]/20 flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#C4622D]" />
              <h2 className="font-display font-black text-base text-[#C4622D]">Developer Sandbox</h2>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-[#7A6B55] leading-relaxed">Toggle SokoPay's currency routing between ðŸ‡³ðŸ‡¬ Nigeria and ðŸ‡°ðŸ‡ª Kenya. Exchange rates, withdrawal methods, and country bridges adapt automatically.</p>
              <button onClick={handleToggleCountry} disabled={isTogglingCountry}
                className="w-full py-2.5 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] border-2 border-[#1A1208] rounded font-display font-bold text-xs shadow-card transition-all flex items-center justify-center gap-2">
                {isTogglingCountry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Switch Country Context to {profile.country === 'KE' ? 'ðŸ‡³ðŸ‡¬ Nigeria' : 'ðŸ‡°ðŸ‡ª Kenya'}
              </button>
            </div>
          </section>

          {/* â”€â”€ SIGN OUT (mobile visible, desktop also) â”€â”€ */}
          <button onClick={handleSignOut}
            className="w-full py-3 bg-[#B5271E] hover:bg-red-800 text-white font-display font-black rounded-lg border-2 border-[#1A1208] shadow-card transition-all active:translate-y-[1px] md:hidden">
            Sign Out of Account
          </button>

        </div>
      </div>
    </div>
  );
}

