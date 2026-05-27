import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
  MessageCircle,
  FileText,
  User,
  Shield,
  CheckCircle,
  WifiOff,
  Database,
  ChevronDown,
  ChevronUp
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

interface WithdrawalAccount {
  id: string;
  merchantId: string;
  type: string;
  accountNumber: string | null;
  bankName: string | null;
  bankCode: string | null;
  mpesaNumber: string | null;
  isDefault: boolean;
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
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Profile Edits State
  const [businessName, setBusinessName] = useState('');
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState('5');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Withdrawal Accounts State
  const [accounts, setAccounts] = useState<WithdrawalAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
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

  // General States
  const [copied, setCopied] = useState(false);
  const [isTogglingCountry, setIsTogglingCountry] = useState(false);

  // Roadmap Expand State
  const [showRoadmap, setShowRoadmap] = useState(true);

  async function fetchProfile() {
    try {
      const response = await api.get('/merchant/me');
      if (response.data.success) {
        const m = response.data.merchant;
        setProfile(m);
        setBusinessName(m.businessName);
        setLowBalanceThreshold(m.lowBalanceThreshold.toString());
        
        // Auto-select type based on country
        if (m.country === 'KE') {
          setAccType('mpesa');
        } else {
          setAccType('bank');
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAccounts() {
    setLoadingAccounts(true);
    try {
      const response = await api.get('/withdraw/accounts');
      if (response.data.success) {
        setAccounts(response.data.accounts || []);
      }
    } catch (err: any) {
      console.error('Error fetching accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    fetchProfile();
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
        setProfile(response.data.merchant);
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
        setProfile(response.data.merchant);
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
        fetchAccounts();
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
        fetchAccounts();
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
        fetchAccounts();
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

  const handleSignOut = () => {
    localStorage.removeItem('sokopay_token');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 font-body flex items-center justify-center">
        <div className="max-w-2xl w-full space-y-6 animate-pulse">
          <div className="h-10 bg-[#F2EDE4] rounded w-1/4 mx-auto"></div>
          <div className="h-64 bg-[#F2EDE4] rounded-lg border border-[#DDD5C5]"></div>
          <div className="h-48 bg-[#F2EDE4] rounded-lg border border-[#DDD5C5]"></div>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 font-body flex items-center justify-center">
        <div className="bg-[#F2EDE4] border-2 border-[#B5271E] p-8 rounded-xl shadow-card text-center max-w-md space-y-4">
          <div className="text-3xl flex justify-center text-[#B5271E]">
            <AlertTriangle className="w-8 h-8" />
          </div>
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

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 md:p-8 relative pb-24 font-body">
      {/* Centered Desktop Layout Container */}
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header (Aligned & Centered) */}
        <div className="flex items-center justify-between border-b border-[#DDD5C5] pb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="p-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-[#FAF7F2] hover:shadow-hover transition-all active:translate-x-[1px] active:translate-y-[1px]"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-[#1A1208]" />
            </button>
            <h1 className="font-display text-2xl md:text-3xl font-black text-[#1A1208] tracking-tight">Settings</h1>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider border-2 border-[#1A1208] shadow-card ${
            profile.isVerified ? 'bg-[#5C6B3A] text-[#FAF7F2]' : 'bg-[#C4622D] text-[#FAF7F2]'
          }`}>
            {profile.isVerified ? '✓ Account Verified' : 'Unverified Account'}
          </span>
        </div>

        {/* PROFILE & STORE PREFERENCES CARD */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-6">
          <div className="flex items-center gap-2 border-b border-[#DDD5C5] pb-3">
            <User className="w-5 h-5 text-[#C4622D]" />
            <h2 className="font-display font-black text-lg text-[#1A1208]">Store & Profile Details</h2>
          </div>

          {profileSuccess && (
            <div className="p-3 bg-success/15 border-2 border-success text-success text-xs font-bold rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="p-3 bg-error/15 border-2 border-error text-error text-xs font-bold rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Business Name</label>
                <input 
                  type="text" 
                  value={businessName} 
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-[#1A1208] transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Low Balance Alert (cUSD)</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={lowBalanceThreshold} 
                    onChange={(e) => setLowBalanceThreshold(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-[#1A1208] transition-colors"
                    min="0"
                    step="any"
                    required
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-[#7A6B55] bg-[#F2EDE4] px-1.5 py-0.5 rounded border border-[#DDD5C5]">cUSD</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-5 py-2.5 bg-[#C4622D] hover:bg-[#A8501F] text-white font-display font-bold text-sm rounded-md border-2 border-[#1A1208] shadow-card hover:shadow-hover transition-all active:translate-x-[1px] active:translate-y-[1px] flex items-center gap-2"
              >
                {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile Changes
              </button>
            </div>
          </form>

          {/* Read Only Meta Info */}
          <div className="border-t border-[#DDD5C5] pt-4 space-y-3 text-sm">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
              <div>
                <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider">Registered Telephone</span>
                <span className="font-semibold text-[#1A1208]">{profile.phone}</span>
              </div>
              <div>
                <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider md:text-right">Operating Market</span>
                <span className="font-semibold text-[#1A1208] flex items-center gap-1.5 md:justify-end">
                  {profile.country === 'KE' ? (
                    <>🇰🇪 Kenya (KES / M-Pesa)</>
                  ) : (
                    <>🇳🇬 Nigeria (NGN / Banks & OPay)</>
                  )}
                </span>
              </div>
            </div>

            <div>
              <span className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider">Celo Wallet Address</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs text-[#C4622D] break-all bg-[#FAF7F2] px-2.5 py-1.5 rounded border border-[#DDD5C5] flex-1 select-all">
                  {profile.walletAddress}
                </span>
                <button
                  onClick={() => handleCopyAddress(profile.walletAddress)}
                  className="p-2 border-2 border-[#1A1208] bg-[#FAF7F2] rounded-md hover:bg-[#F2EDE4] active:translate-y-0.5"
                  title="Copy Wallet Address"
                >
                  {copied ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4 text-[#1A1208]" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* NOTIFICATION PREFERENCES CARD (With Premium Toggles) */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DDD5C5] pb-3">
            <Shield className="w-5 h-5 text-[#C4622D]" />
            <h2 className="font-display font-black text-lg text-[#1A1208]">Notification Subscriptions</h2>
          </div>

          <div className="divide-y divide-[#DDD5C5]/40">
            <Toggle 
              enabled={profile.dailySummaryEnabled}
              onChange={() => handleToggleSetting('dailySummaryEnabled', profile.dailySummaryEnabled)}
              label="Daily Summary Report"
              description="Compile earnings, payment counts, and agent insights into an 8:00 AM summary."
            />
            <Toggle 
              enabled={profile.weeklyReportEnabled}
              onChange={() => handleToggleSetting('weeklyReportEnabled', profile.weeklyReportEnabled)}
              label="Weekly Report Summary"
              description="Receive weekly cashflow forecasting analysis and breakdown metrics every Sunday."
            />
            <Toggle 
              enabled={profile.paymentAlertsEnabled}
              onChange={() => handleToggleSetting('paymentAlertsEnabled', profile.paymentAlertsEnabled)}
              label="Instant Payment Alerts"
              description="Trigger real-time notifications on your web dashboard and device when payments clear."
            />
          </div>
        </div>

        {/* WITHDRAWAL ACCOUNT DIRECTORY CARD (Full CRUD Account Management) */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-6">
          <div className="flex justify-between items-center border-b border-[#DDD5C5] pb-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-[#C4622D]" />
              <h2 className="font-display font-black text-lg text-[#1A1208]">Settlement Accounts</h2>
            </div>
            {!showAddForm && (
              <button
                onClick={() => {
                  setLinkError('');
                  setLinkSuccess('');
                  setShowAddForm(true);
                }}
                className="text-xs font-bold text-[#C4622D] hover:text-[#A8501F] flex items-center gap-1.5 px-2.5 py-1.5 bg-[#FAF7F2] border-2 border-[#1A1208] rounded-md shadow-card hover:shadow-hover hover:scale-102 active:translate-x-0.5 active:translate-y-0.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Link Account
              </button>
            )}
          </div>

          {linkSuccess && (
            <div className="p-3 bg-success/15 border-2 border-success text-success text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{linkSuccess}</span>
            </div>
          )}

          {/* Collapsible Add Account Form */}
          {showAddForm && (
            <div className="bg-[#FAF7F2] border-2 border-[#1A1208] p-5 rounded-lg space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-[#DDD5C5] pb-2">
                <h3 className="font-display font-bold text-sm text-[#1A1208]">Link New Account</h3>
                <button 
                  onClick={() => setShowAddForm(false)} 
                  className="text-xs text-[#7A6B55] font-bold hover:text-[#1A1208]"
                >
                  Cancel
                </button>
              </div>

              {linkError && (
                <div className="p-3 bg-error/15 border-2 border-error text-error text-xs font-bold rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}

              <form onSubmit={handleLinkAccount} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1.5">Account Type</label>
                  <div className="flex flex-wrap gap-4 bg-[#F2EDE4] p-2.5 rounded-md border border-[#DDD5C5]">
                    {profile.country === 'KE' ? (
                      <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                        <input 
                          type="radio" 
                          name="accType" 
                          value="mpesa" 
                          checked={accType === 'mpesa'} 
                          onChange={() => setAccType('mpesa')}
                          className="text-[#C4622D] focus:ring-[#C4622D]"
                        />
                        🇰🇪 M-Pesa Mobile Wallet
                      </label>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                          <input 
                            type="radio" 
                            name="accType" 
                            value="bank" 
                            checked={accType === 'bank'} 
                            onChange={() => setAccType('bank')}
                            className="text-[#C4622D] focus:ring-[#C4622D]"
                          />
                          🇳🇬 Local Bank Account
                        </label>
                        <label className="flex items-center gap-2 font-bold text-xs cursor-pointer text-[#1A1208] select-none">
                          <input 
                            type="radio" 
                            name="accType" 
                            value="opay" 
                            checked={accType === 'opay'} 
                            onChange={() => setAccType('opay')}
                            className="text-[#C4622D] focus:ring-[#C4622D]"
                          />
                          🇳🇬 OPay Account
                        </label>
                      </>
                    )}
                  </div>
                </div>

                {accType === 'mpesa' ? (
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">M-Pesa Mobile Number</label>
                    <input 
                      type="text"
                      placeholder="e.g. +254 712345678"
                      value={mpesaNumber}
                      onChange={(e) => setMpesaNumber(e.target.value)}
                      className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm"
                      required
                    />
                  </div>
                ) : accType === 'opay' ? (
                  <div>
                    <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">OPay Account Number (Phone)</label>
                    <input 
                      type="text"
                      placeholder="e.g. 08031234567"
                      value={accNumber}
                      onChange={(e) => setAccNumber(e.target.value)}
                      className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm"
                      required
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Account Number</label>
                      <input 
                        type="text"
                        placeholder="e.g. 0123456789"
                        value={accNumber}
                        onChange={(e) => setAccNumber(e.target.value)}
                        className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Name</label>
                        <input 
                          type="text"
                          placeholder="e.g. GTBank, Access, Kuda"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Bank Code (Optional)</label>
                        <input 
                          type="text"
                          placeholder="e.g. 058"
                          value={bankCode}
                          onChange={(e) => setBankCode(e.target.value)}
                          className="w-full px-4 py-2 bg-[#FAF7F2] border-2 border-[#1A1208] focus:border-[#C4622D] outline-none rounded-md font-semibold text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 font-bold text-xs select-none cursor-pointer text-[#1A1208] pt-1">
                  <input
                    type="checkbox"
                    checked={isDefaultAcc}
                    onChange={(e) => setIsDefaultAcc(e.target.checked)}
                    className="rounded border-[#1A1208] text-[#C4622D] focus:ring-[#C4622D] w-4 h-4"
                  />
                  Set as default off-ramp channel
                </label>

                <div className="flex gap-2">
                  <button 
                    type="submit" 
                    disabled={linkLoading}
                    className="flex-1 py-2 bg-[#C4622D] hover:bg-[#A8501F] text-white font-display font-bold text-xs rounded border-2 border-[#1A1208] shadow-card hover:shadow-hover active:translate-y-[1px]"
                  >
                    {linkLoading ? 'Linking Account...' : 'Link Settlement Account'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] font-display font-bold text-xs rounded border-2 border-[#1A1208] shadow-card"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Linked Accounts List */}
          {loadingAccounts ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#C4622D]" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="border-2 border-dashed border-[#DDD5C5] p-8 rounded-lg text-center text-text-muted text-xs">
              <Landmark className="w-8 h-8 text-[#DDD5C5] mx-auto mb-2" />
              No settlement accounts linked. Please link a withdrawal destination to payout your cUSD earnings.
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div 
                  key={acc.id}
                  className="bg-[#FAF7F2] border-2 border-[#1A1208] rounded-lg p-4 shadow-card flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:shadow-hover transition-shadow"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card">
                      {acc.type === 'mpesa' ? <Smartphone className="w-5 h-5 text-[#C4622D]" /> : <Landmark className="w-5 h-5 text-[#C4622D]" />}
                    </div>
                    <div>
                      <div className="font-bold flex items-center gap-2 text-[#1A1208] text-sm">
                        {acc.type === 'mpesa' ? 'M-Pesa Mobile Wallet' : acc.type === 'opay' ? 'OPay Wallet' : acc.bankName}
                        {acc.isDefault && (
                          <span className="bg-[#5C6B3A]/15 text-[#5C6B3A] text-[9px] font-black uppercase px-2 py-0.5 rounded-full border border-[#5C6B3A]/30">
                            Default Off-ramp
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#7A6B55] font-mono mt-0.5">
                        {acc.type === 'mpesa' ? `Mobile No: ${acc.mpesaNumber}` : `Account No: ${acc.accountNumber}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!acc.isDefault && (
                      <button
                        onClick={() => handleSetDefaultAccount(acc.id)}
                        className="text-[10px] font-bold text-[#5C6B3A] hover:underline bg-white px-2 py-1 rounded border border-[#DDD5C5]"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteAccount(acc.id)}
                      className="p-1.5 border border-red-200 bg-red-50 text-[#B5271E] rounded hover:bg-red-100 hover:text-red-900 transition-colors"
                      title="Unlink Account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* DEVELOPER SANDBOX CONTROL CARD */}
        <div className="bg-[#FAF7F2] border-2 border-dashed border-[#C4622D] p-6 rounded-xl shadow-card space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-[#C4622D]" />
            <h3 className="font-display font-black text-[#C4622D] text-base">Developer Sandbox Utilities</h3>
          </div>
          <p className="text-xs text-[#7A6B55] leading-relaxed">
            Use this trigger to toggle SokoPay's currency routing rules dynamically between 🇳🇬 Nigeria (OPay & local commercial banks) and 🇰🇪 Kenya (Safaricom M-Pesa). The entire system — exchange rates, withdrawal methods, and country bridges — adapts automatically for the sandbox experience.
          </p>

          <button
            onClick={handleToggleCountry}
            disabled={isTogglingCountry}
            className="w-full py-2.5 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] border-2 border-[#1A1208] rounded font-display font-bold text-xs shadow-card active:translate-y-0.5 active:shadow-sm flex items-center justify-center gap-2"
          >
            {isTogglingCountry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Switch Country Context to {profile.country === 'KE' ? '🇳🇬 Nigeria' : '🇰🇪 Kenya'}
          </button>
        </div>

        {/* FEATURE INTEGRATION ROADMAP CARD */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-4">
          <button 
            type="button"
            onClick={() => setShowRoadmap(!showRoadmap)}
            className="w-full flex justify-between items-center border-b border-[#DDD5C5] pb-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#C4622D]" />
              <h2 className="font-display font-black text-lg text-[#1A1208]">SokoPay Feature Roadmap</h2>
            </div>
            {showRoadmap ? <ChevronUp className="w-4 h-4 text-[#7A6B55]" /> : <ChevronDown className="w-4 h-4 text-[#7A6B55]" />}
          </button>

          {showRoadmap && (
            <div className="space-y-4">
              <p className="text-xs text-[#7A6B55] leading-relaxed">
                The future expansion pipeline for SokoPay includes the following production bridges and autonomous layer interfaces:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* WhatsApp bot layer */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp Bot Layer
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Coming Q3
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Check wallet balances, review transactions, and request direct payout triggers over standard WhatsApp prompts, designed for mobile-first merchants operating without a laptop.
                  </p>
                </div>

                {/* SMS notifications */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-[#C4622D]" /> SMS Notifications
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Coming Q4
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Automated, offline SMS notifications sent immediately upon payment confirmation, enabling verification on basic feature phones when internet signal is weak.
                  </p>
                </div>

                {/* Credit score + loan integration */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-purple-600" /> Credit Scoring via Muon
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Under Dev
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Deconstructs payment velocity and historical volumes using Muon Oracle signatures to establish a trusted risk score, qualifying vendors for instant, low-interest liquidity loans.
                  </p>
                </div>

                {/* Advanced analytics */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Advanced Analytics
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Coming Q4
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Deep cashflow analytics, customer frequency heatmaps, and automatic revenue predictions powered by Gemini 2.0 to help merchants anticipate peak days and stock inventory accordingly.
                  </p>
                </div>

                {/* Additional country bridges */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-teal-600" /> Additional Country Bridges
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      Documented
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Expanding cross-border bridges to support Ghana (MTN Momo / Telecel), Uganda (Airtel Money), and South Africa (EFT settlement) for expanded pan-African supply chain corridors.
                  </p>
                </div>

                {/* Merchant network directory */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <User className="w-4 h-4 text-indigo-600" /> Merchant Network Directory
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Coming Q1
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    A searchable directory of verified SokoPay businesses, enabling merchants to find B2B distributors and trade directly in stablecoins, bypassing banking delays.
                  </p>
                </div>

                {/* Offline mode */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <WifiOff className="w-4 h-4 text-orange-600" /> Offline Mode (USSD Fallback)
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Under Dev
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    USSD interface to sign and submit Celo blockchain transaction intents completely offline. Transactions sync and broadcast once a local agent node connects to internet.
                  </p>
                </div>

                {/* CSV export */}
                <div className="bg-[#FAF7F2] p-4 rounded-lg border-2 border-[#1A1208]/15 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-slate-600" /> CSV & Ledger Export
                    </span>
                    <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      ⏳ Coming Q3
                    </span>
                  </div>
                  <p className="text-xs text-[#7A6B55] leading-relaxed">
                    Download fully structured, tax-ready CSV files of payment request history, withdrawal records, and local exchange rate conversions at the click of a button.
                  </p>
                </div>

              </div>
            </div>
          )}
        </div>

        {/* SIGN OUT ACTION */}
        <button
          onClick={handleSignOut}
          className="w-full py-3.5 bg-[#B5271E] hover:bg-red-800 text-white font-display font-black rounded-lg border-2 border-[#1A1208] shadow-card hover:shadow-hover transition-all active:translate-x-[1px] active:translate-y-[1px]"
        >
          Sign Out of Account
        </button>

      </div>
    </div>
  );
}
