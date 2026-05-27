import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { AlertTriangle, FlaskConical } from 'lucide-react';

interface MerchantProfile {
  businessName: string;
  phone: string;
  country: string;
  walletAddress: string;
  isVerified: boolean;
}

export default function Settings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<MerchantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isToggling, setIsToggling] = useState(false);

  // Mock Notification settings state
  const [dailySummary, setDailySummary] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [paymentAlerts, setPaymentAlerts] = useState(true);

  async function fetchProfile() {
    try {
      const response = await api.get('/merchant/me');
      if (response.data.success) {
        setProfile(response.data.merchant);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleToggleCountry = async () => {
    setIsToggling(true);
    try {
      const response = await api.post('/merchant/toggle-country');
      if (response.data.success) {
        alert(`Country toggled to: ${response.data.country === 'KE' ? 'Kenya (KES)' : 'Nigeria (NGN)'}`);
        fetchProfile();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to toggle country.');
    } finally {
      setIsToggling(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('sokopay_token');
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 font-body">
        <div className="max-w-md mx-auto space-y-6 animate-pulse">
          <div className="h-10 bg-[#F2EDE4] rounded w-1/4"></div>
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
          <h2 className="font-display font-bold text-lg">Error Loading Profile</h2>
          <p className="text-sm text-[#7A6B55]">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-[#C4622D] text-white rounded font-bold border-2 border-[#1A1208] shadow-card">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 md:p-8 relative pb-24 font-body">
      <div className="max-w-md mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-[#FAF7F2] transition-all font-semibold text-sm"
          >
            ← Dashboard
          </button>
          <h1 className="font-display text-2xl font-bold text-[#1A1208]">Settings</h1>
        </div>

        {/* Profile Card */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-4">
          <div className="flex justify-between items-start border-b border-[#DDD5C5] pb-4">
            <div>
              <h2 className="font-display font-bold text-xl text-[#1A1208]">{profile.businessName}</h2>
              <p className="text-xs text-[#7A6B55]">{profile.phone}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
              profile.isVerified ? 'bg-[#5C6B3A] text-white' : 'bg-[#C4622D] text-white'
            }`}>
              {profile.isVerified ? '✓ Verified' : 'Unverified'}
            </span>
          </div>

          {/* Details */}
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-[#7A6B55] uppercase font-semibold">Store Country</div>
              <div className="font-bold text-[#1A1208] mt-0.5">
                {profile.country === 'KE' ? 'Kenya (KES)' : 'Nigeria (NGN)'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#7A6B55] uppercase font-semibold">Celo Wallet Address</div>
              <div className="font-mono text-xs text-[#C4622D] break-all select-all mt-0.5">
                {profile.walletAddress}
              </div>
            </div>
          </div>
        </div>

        {/* Notifications Config (Mocked inputs) */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-4">
          <h3 className="font-display font-bold text-base text-[#1A1208] border-b border-[#DDD5C5] pb-2">Notifications</h3>
          
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold text-[#1A1208]">Daily summary report (8am)</span>
              <input 
                type="checkbox" 
                checked={dailySummary} 
                onChange={(e) => setDailySummary(e.target.checked)}
                className="rounded border-[#DDD5C5] text-[#C4622D] focus:ring-[#C4622D]"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold text-[#1A1208]">Weekly report summary</span>
              <input 
                type="checkbox" 
                checked={weeklyReport} 
                onChange={(e) => setWeeklyReport(e.target.checked)}
                className="rounded border-[#DDD5C5] text-[#C4622D] focus:ring-[#C4622D]"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-semibold text-[#1A1208]">Instant payment alerts</span>
              <input 
                type="checkbox" 
                checked={paymentAlerts} 
                onChange={(e) => setPaymentAlerts(e.target.checked)}
                className="rounded border-[#DDD5C5] text-[#C4622D] focus:ring-[#C4622D]"
              />
            </label>
          </div>
        </div>

        {/* Developer sandbox configuration tool */}
        <div className="bg-[#FAF7F2] border-2 border-dashed border-[#C4622D] p-6 rounded-xl shadow-card space-y-4">
          <h3 className="font-display font-bold text-base text-[#C4622D] flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-accent" /> Developer Sandbox Utilities
          </h3>
          <p className="text-xs text-[#7A6B55]">
            Use this to switch SokoPay's global context between Nigeria (Providus/OPay) and Kenya (M-Pesa) for testing country-dependent layout behaviors.
          </p>

          <button
            onClick={handleToggleCountry}
            disabled={isToggling}
            className="w-full py-2 bg-[#FAF7F2] hover:bg-[#F2EDE4] text-[#1A1208] border-2 border-[#1A1208] rounded font-display font-bold text-xs shadow-card active:translate-y-0.5 active:shadow-sm"
          >
            {isToggling ? 'Toggling Country...' : `Switch Country Context to ${profile.country === 'KE' ? 'NG (Nigeria)' : 'KE (Kenya)'}`}
          </button>
        </div>

        {/* Sign Out Action */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 bg-[#B5271E] hover:bg-red-800 text-white font-display font-bold rounded-md border-2 border-[#1A1208] shadow-card transition-all active:translate-y-0.5 active:shadow-sm"
        >
          Sign Out of Account
        </button>

      </div>
    </div>
  );
}
