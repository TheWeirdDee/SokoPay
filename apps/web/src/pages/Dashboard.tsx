import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface Transaction {
  id: string;
  type: string;
  direction: string;
  amountLocal: number | null;
  currencyLocal: string | null;
  amountCusd: number | null;
  txHash: string | null;
  status: string;
  method: string | null;
  counterpart: string | null;
  notes: string | null;
  createdAt: string;
}

interface Merchant {
  id: string;
  phone: string;
  businessName: string;
  country: string;
  walletAddress: string;
  isVerified: boolean;
}

interface Balance {
  cusd: string;
  celo: string;
  local: string;
  currency: string;
}

interface DashboardData {
  merchant: Merchant;
  balance: Balance;
  todayEarnings: {
    local: string;
    cusd: string;
  };
  recentTransactions: Transaction[];
  rate: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const response = await api.get('/merchant/me');
        setData(response.data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to load dashboard data.');
        if (err.response?.status === 401) {
          navigate('/onboarding');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboard();
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md space-y-6 animate-pulse">
          <div className="flex justify-between items-center h-12 bg-[#F2EDE4] rounded-md"></div>
          <div className="h-48 bg-[#F2EDE4] rounded-lg border border-[#DDD5C5]"></div>
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-[#F2EDE4] rounded-md"></div>
            ))}
          </div>
          <div className="h-32 bg-[#F2EDE4] rounded-lg"></div>
          <div className="h-48 bg-[#F2EDE4] rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col justify-center items-center p-6 text-center">
        <div className="bg-[#B5271E]/10 text-[#B5271E] p-4 rounded-lg mb-6 border border-[#B5271E]/20 font-semibold max-w-md">
          {error || 'An unexpected error occurred.'}
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="px-6 py-3 bg-[#C4622D] text-[#FAF7F2] font-display font-semibold rounded-md shadow-card hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  const { merchant, balance, todayEarnings, recentTransactions } = data;
  const currencySymbol = balance.currency === 'KES' ? 'KSh' : '₦';

  const formatCurrency = (val: string | number) => {
    const num = Number(val);
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 7 days: Sunday to Saturday
  // Terracotta bars for filled ones, transparent-white for empty ones
  const weekData = [
    { day: 'S', amount: 12000, height: '30%', isFilled: true },
    { day: 'M', amount: 28000, height: '60%', isFilled: true },
    { day: 'T', amount: 47200, height: '90%', isFilled: true }, // Today
    { day: 'W', amount: 0, height: '0%', isFilled: false },
    { day: 'T', amount: 0, height: '0%', isFilled: false },
    { day: 'F', amount: 0, height: '0%', isFilled: false },
    { day: 'S', amount: 0, height: '0%', isFilled: false }
  ];

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-24 flex flex-col font-body text-[#1A1208] max-w-[430px] mx-auto relative shadow-2xl border-x border-[#DDD5C5]">
      
      {/* Header */}
      <header className="bg-[#FAF7F2] px-6 py-4 flex justify-between items-center border-b border-[#DDD5C5] h-16">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#1A1208]">SokoPay</h1>
        <div className="flex items-center gap-4">
          {/* Bell Icon */}
          <button className="p-2 text-[#1A1208] hover:text-[#C4622D] transition-colors relative" aria-label="Notifications">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#C4622D] rounded-full"></span>
          </button>
          {/* Profile Circle */}
          <button 
            className="w-8 h-8 rounded-full bg-[#C4622D] text-[#FAF7F2] flex items-center justify-center font-display font-bold text-sm"
            aria-label="Profile"
            onClick={() => navigate('/settings')}
          >
            {merchant.businessName.charAt(0).toUpperCase()}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 space-y-6 flex-1">
        
        {/* Greeting & Balance Card */}
        <section 
          className="bg-[#1A1208] text-[#FAF7F2] p-6 rounded-[16px] relative overflow-hidden"
          style={{ padding: '24px' }}
        >
          {/* Grain texture overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-5 mix-blend-overlay">
            <svg width="100%" height="100%">
              <filter id="noise">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.07 0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#noise)" />
            </svg>
          </div>

          <div className="relative z-10 space-y-4">
            <div>
              <p className="font-body text-base text-[#FAF7F2]/90">Good morning, {merchant.businessName.trim()} 👋</p>
              <h2 className="text-xs font-bold text-[#7A6B55] mt-1 uppercase tracking-wider">Today's Earnings</h2>
            </div>
            
            <div>
              <div className="font-display font-extrabold text-[#FAF7F2] text-5xl leading-none flex items-baseline">
                <span className="text-3xl mr-1 font-bold">{currencySymbol}</span>
                {todayEarnings.local !== '0.00' ? formatCurrency(todayEarnings.local) : formatCurrency(Number(balance.local))}
              </div>
              <p className="text-[#7A6B55] font-mono text-sm mt-1.5">
                = {todayEarnings.cusd !== '0.00' ? Number(todayEarnings.cusd).toFixed(2) : Number(balance.cusd).toFixed(2)} cUSD
              </p>
            </div>

            {/* Week bar chart */}
            <div className="pt-4 border-t border-[#FAF7F2]/10">
              <div className="flex justify-between items-end h-16 px-1">
                {weekData.map((w, idx) => (
                  <div key={idx} className="flex flex-col items-center flex-1">
                    {/* Bar */}
                    <div className="w-4 bg-[#FAF7F2]/5 rounded-t-sm h-full flex flex-col justify-end">
                      <div 
                        className="w-full rounded-t-sm transition-all duration-300"
                        style={{ 
                          height: w.height === '0%' ? '100%' : w.height, 
                          backgroundColor: w.isFilled ? '#C4622D' : 'rgba(255, 255, 255, 0.15)' 
                        }}
                      ></div>
                    </div>
                    {/* Day label */}
                    <span className="text-[11px] font-bold text-white mt-1.5">{w.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold text-[#7A6B55] uppercase tracking-wider">Quick Actions</h3>
          <div className="grid grid-cols-4 gap-3">
            
            {/* My QR */}
            <button 
              onClick={() => navigate('/qr')}
              className="aspect-square flex flex-col items-center justify-center p-3 bg-[#F2EDE4] border-[1.5px] border-[#DDD5C5] rounded-[8px] shadow-[2px_2px_0px_#DDD5C5] hover:shadow-[4px_4px_0px_#C4622D] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#DDD5C5] transition-all"
            >
              <div className="text-[#1A1208] mb-1.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <span className="text-[12px] font-body font-semibold text-[#7A6B55] leading-tight">My QR</span>
            </button>

            {/* Pay */}
            <button 
              onClick={() => navigate('/pay')}
              className="aspect-square flex flex-col items-center justify-center p-3 bg-[#F2EDE4] border-[1.5px] border-[#DDD5C5] rounded-[8px] shadow-[2px_2px_0px_#DDD5C5] hover:shadow-[4px_4px_0px_#C4622D] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#DDD5C5] transition-all"
            >
              <div className="text-[#1A1208] mb-1.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <span className="text-[12px] font-body font-semibold text-[#7A6B55] leading-tight">Pay</span>
            </button>

            {/* Withdraw */}
            <button 
              onClick={() => navigate('/withdraw')}
              className="aspect-square flex flex-col items-center justify-center p-3 bg-[#F2EDE4] border-[1.5px] border-[#DDD5C5] rounded-[8px] shadow-[2px_2px_0px_#DDD5C5] hover:shadow-[4px_4px_0px_#C4622D] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#DDD5C5] transition-all"
            >
              <div className="text-[#1A1208] mb-1.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293h3.172a1 1 0 00.707-.293l2.414-2.414a1 1 0 01.707-.293H20" />
                </svg>
              </div>
              <span className="text-[12px] font-body font-semibold text-[#7A6B55] leading-tight">Withdraw</span>
            </button>

            {/* Record Cash */}
            <button 
              onClick={() => navigate('/transactions')}
              className="aspect-square flex flex-col items-center justify-center p-3 bg-[#F2EDE4] border-[1.5px] border-[#DDD5C5] rounded-[8px] shadow-[2px_2px_0px_#DDD5C5] hover:shadow-[4px_4px_0px_#C4622D] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#DDD5C5] transition-all"
            >
              <div className="text-[#1A1208] mb-1.5">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <span className="text-[12px] font-body font-semibold text-[#7A6B55] leading-tight text-center">Record Cash</span>
            </button>

          </div>
        </section>

        {/* Recent Transactions */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-[#7A6B55] uppercase tracking-wider">Recent Transactions</h3>
            <button 
              onClick={() => navigate('/transactions')} 
              className="text-xs font-semibold text-[#C4622D] hover:underline"
            >
              See all →
            </button>
          </div>

          <div className="space-y-2.5">
            {recentTransactions.length === 0 ? (
              <div className="bg-[#F2EDE4] border border-[#DDD5C5] border-dashed p-8 rounded-xl text-center text-[#7A6B55]">
                <svg className="w-8 h-8 mx-auto text-[#7A6B55]/60 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm font-semibold">No transactions yet</p>
                <p className="text-xs mt-1">Incoming payments will show up here automatically.</p>
              </div>
            ) : (
              recentTransactions.map((tx) => {
                const isIncoming = tx.direction === 'in';
                const isCash = tx.method === 'cash';
                
                return (
                  <div 
                    key={tx.id} 
                    className={`bg-[#F2EDE4] border border-[#DDD5C5] p-3 rounded-lg flex items-center justify-between shadow-card hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all ${
                      isIncoming ? 'border-l-4 border-l-[#C4622D]' : 'border-l-4 border-l-[#5C6B3A]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-base ${
                        isCash ? 'bg-[#5C6B3A]/10 text-[#5C6B3A]' : isIncoming ? 'bg-[#C4622D]/10 text-[#C4622D]' : 'bg-[#5C6B3A]/10 text-[#5C6B3A]'
                      }`}>
                        {isCash ? '💵' : isIncoming ? '↓' : '↑'}
                      </div>
                      <div>
                        <p className="font-display font-bold text-sm text-[#1A1208]">
                          {currencySymbol}{formatCurrency(tx.amountLocal || 0)}
                        </p>
                        <p className="text-[11px] text-[#7A6B55] font-medium">
                          {tx.method ? tx.method.toUpperCase() : 'TRANSFER'} • {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    {tx.txHash ? (
                      <a 
                        href={`https://8004scan.io/agent/${merchant.walletAddress}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-[#C4622D] hover:underline flex items-center gap-1 text-xs font-mono font-bold"
                      >
                        {tx.txHash.substring(0, 6)}...{tx.txHash.substring(tx.txHash.length - 4)}
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-[#7A6B55] text-[11px] font-semibold italic">Manual</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Agent Notification Card */}
        <section 
          onClick={() => navigate('/chat')}
          className="bg-[#F2EDE4] border border-[#DDD5C5] border-l-4 border-l-[#C4622D] p-4 rounded-xl shadow-card cursor-pointer hover:shadow-[4px_4px_0px_#C4622D] hover:-translate-x-[1px] hover:-translate-y-[1px] transition-all flex gap-3 items-start"
        >
          <div className="text-2xl mt-0.5">🤖</div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-[#C4622D] uppercase tracking-wider">AI Financial Agent</p>
            <p className="text-xs text-[#1A1208] font-medium leading-relaxed">
              "You made {currencySymbol}{todayEarnings.local !== '0.00' ? formatCurrency(todayEarnings.local) : formatCurrency(Number(balance.local))} today. Your best hour was 12–2pm. Tap to ask me anything about your earnings!"
            </p>
          </div>
        </section>

      </main>

      {/* Bottom Navigation */}
      <nav className="bg-[#1A1208] py-2.5 px-6 fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto flex justify-between items-center z-50 h-16">
        
        {/* Home Link (Active) */}
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#C4622D]"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          <span className="text-[11px] font-body font-semibold">Home</span>
        </button>

        {/* Chat Link */}
        <button 
          onClick={() => navigate('/chat')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#7A6B55] hover:text-[#FAF7F2] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[11px] font-body font-semibold">Chat</span>
        </button>

        {/* Pay Link */}
        <button 
          onClick={() => navigate('/pay')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#7A6B55] hover:text-[#FAF7F2] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[11px] font-body font-semibold">Pay</span>
        </button>

        {/* History Link */}
        <button 
          onClick={() => navigate('/transactions')}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[#7A6B55] hover:text-[#FAF7F2] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[11px] font-body font-semibold">History</span>
        </button>

      </nav>

    </div>
  );
}
