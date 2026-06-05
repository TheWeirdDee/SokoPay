import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';

interface CacheContextProps {
  profile: any | null;
  balance: any | null;
  recentTransactions: any[];
  withdrawalAccounts: any[];
  transactions: any[];
  todayEarnings: { local: string; cusd: string } | null;
  rate: number | null;
  
  loadingProfile: boolean;
  loadingAccounts: boolean;
  loadingTransactions: boolean;
  
  fetchProfile: (force?: boolean) => Promise<any>;
  fetchAccounts: (force?: boolean) => Promise<any>;
  fetchTransactions: (force?: boolean) => Promise<any>;
  
  updateBalance: () => Promise<any>;
  clearCache: () => void;
}

const CacheContext = createContext<CacheContextProps | undefined>(undefined);

export function CacheProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<any | null>(null);
  const [balance, setBalance] = useState<any | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [withdrawalAccounts, setWithdrawalAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [todayEarnings, setTodayEarnings] = useState<{ local: string; cusd: string } | null>(null);
  const [rate, setRate] = useState<number | null>(null);

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const hasFetchedProfile = useRef(false);
  const balanceIntervalRef = useRef<any>(null);
  const lastFetchAccountsTime = useRef<number>(0);
  const lastFetchTransactionsTime = useRef<number>(0);

  const clearCache = () => {
    setProfile(null);
    setBalance(null);
    setRecentTransactions([]);
    setWithdrawalAccounts([]);
    setTransactions([]);
    setTodayEarnings(null);
    setRate(null);
    hasFetchedProfile.current = false;
    lastFetchAccountsTime.current = 0;
    lastFetchTransactionsTime.current = 0;
    localStorage.removeItem('sokopay_qr_details');
    localStorage.removeItem('sokopay_cached_txs');
    localStorage.removeItem('sokopay_cached_stats');
    if (balanceIntervalRef.current) {
      clearInterval(balanceIntervalRef.current);
      balanceIntervalRef.current = null;
    }
  };

  // Fetch/Get profile from cache or load it
  const fetchProfile = async (force = false) => {
    const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
    if (!token) return null;

    // If cached and not forced, return cached instantly
    if (profile && !force) {
      // Trigger background silent refresh for profile and balance
      api.get('/merchant/me').then(res => {
        if (res.data.success) {
          setProfile(res.data.merchant);
        }
      }).catch(err => console.error('Background profile refresh failed:', err));

      api.get('/merchant/balance').then(res => {
        if (res.data.success) {
          setBalance(res.data.balance);
          setRecentTransactions(res.data.recentTransactions || []);
          setTodayEarnings(res.data.todayEarnings);
          setRate(res.data.rate);
        }
      }).catch(err => console.error('Background balance refresh failed:', err));

      return { profile, balance, recentTransactions, todayEarnings, rate };
    }

    const showSkeleton = !profile;
    if (showSkeleton) {
      setLoadingProfile(true);
    }

    try {
      const res = await api.get('/merchant/me');
      if (res.data.success) {
        setProfile(res.data.merchant);
        
        let freshBalance = null;
        let freshRecentTxs = [];
        let freshTodayEarnings = null;
        let freshRate = null;

        // Fetch balance separately
        try {
          const balRes = await api.get('/merchant/balance');
          if (balRes.data.success) {
            setBalance(balRes.data.balance);
            setRecentTransactions(balRes.data.recentTransactions || []);
            setTodayEarnings(balRes.data.todayEarnings);
            setRate(balRes.data.rate);

            freshBalance = balRes.data.balance;
            freshRecentTxs = balRes.data.recentTransactions || [];
            freshTodayEarnings = balRes.data.todayEarnings;
            freshRate = balRes.data.rate;
          }
        } catch (bErr) {
          console.error('Failed to fetch balance in fetchProfile:', bErr);
        }

        hasFetchedProfile.current = true;
        
        return {
          success: true,
          merchant: res.data.merchant,
          balance: freshBalance,
          recentTransactions: freshRecentTxs,
          todayEarnings: freshTodayEarnings,
          rate: freshRate
        };
      }
    } catch (err) {
      console.error('Failed to fetch profile in cache context:', err);
      throw err;
    } finally {
      setLoadingProfile(false);
    }
  };

  // Background balance updates
  const updateBalance = async () => {
    const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await api.get('/merchant/balance');
      if (res.data.success) {
        setBalance(res.data.balance);
        setRecentTransactions(res.data.recentTransactions || []);
        setTodayEarnings(res.data.todayEarnings);
        setRate(res.data.rate);
      }
    } catch (err) {
      console.error('Failed to poll balance updates:', err);
    }
  };

  // Fetch withdrawal accounts
  const fetchAccounts = async (force = false) => {
    const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
    if (!token) return [];

    const now = Date.now();
    const isCacheValid = withdrawalAccounts.length > 0 && (now - lastFetchAccountsTime.current < 5 * 60 * 1000);

    if (isCacheValid && !force) {
      return withdrawalAccounts;
    }

    const showSkeleton = withdrawalAccounts.length === 0;
    if (showSkeleton) {
      setLoadingAccounts(true);
    }

    try {
      const res = await api.get('/withdraw/accounts');
      if (res.data.success) {
        const list = res.data.accounts || [];
        setWithdrawalAccounts(list);
        lastFetchAccountsTime.current = Date.now();
        return list;
      }
    } catch (err) {
      console.error('Failed to fetch accounts in cache:', err);
      throw err;
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Fetch full transaction history
  const fetchTransactions = async (force = false) => {
    const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
    if (!token) return [];

    const now = Date.now();
    const isCacheValid = transactions.length > 0 && (now - lastFetchTransactionsTime.current < 30 * 1000);

    if (isCacheValid && !force) {
      return transactions;
    }

    const showSkeleton = transactions.length === 0;
    if (showSkeleton) {
      setLoadingTransactions(true);
    }

    try {
      const res = await api.get('/transactions');
      if (res.data.success) {
        const list = (res.data.transactions || []).slice(0, 20);
        setTransactions(list);
        lastFetchTransactionsTime.current = Date.now();
        return list;
      }
    } catch (err) {
      console.error('Failed to fetch transactions in cache:', err);
      throw err;
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Polling setup for balance updates (every 30 seconds)
  useEffect(() => {
    const token = localStorage.getItem('sokopay_token') || localStorage.getItem('token');
    if (token) {
      // First load profile immediately
      fetchProfile();
      fetchAccounts();
      fetchTransactions();

      // Poll balance every 30 seconds
      if (balanceIntervalRef.current) {
        clearInterval(balanceIntervalRef.current);
      }
      balanceIntervalRef.current = setInterval(() => {
        updateBalance();
      }, 30000);
    }

    return () => {
      if (balanceIntervalRef.current) {
        clearInterval(balanceIntervalRef.current);
      }
    };
  }, [profile?.id]); // Restart when merchant login switches

  return (
    <CacheContext.Provider value={{
      profile,
      balance,
      recentTransactions,
      withdrawalAccounts,
      transactions,
      todayEarnings,
      rate,
      loadingProfile,
      loadingAccounts,
      loadingTransactions,
      fetchProfile,
      fetchAccounts,
      fetchTransactions,
      updateBalance,
      clearCache
    }}>
      {children}
    </CacheContext.Provider>
  );
}

export function useCache() {
  const context = useContext(CacheContext);
  if (context === undefined) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}
