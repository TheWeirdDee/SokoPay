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

  const clearCache = () => {
    setProfile(null);
    setBalance(null);
    setRecentTransactions([]);
    setWithdrawalAccounts([]);
    setTransactions([]);
    setTodayEarnings(null);
    setRate(null);
    hasFetchedProfile.current = false;
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
      // Trigger a background silent refresh to get updated stats
      api.get('/merchant/me').then(res => {
        if (res.data.success) {
          setProfile(res.data.merchant);
          setBalance(res.data.balance);
          setRecentTransactions(res.data.recentTransactions || []);
          setTodayEarnings(res.data.todayEarnings);
          setRate(res.data.rate);
        }
      }).catch(err => console.error('Background profile refresh failed:', err));

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
        setBalance(res.data.balance);
        setRecentTransactions(res.data.recentTransactions || []);
        setTodayEarnings(res.data.todayEarnings);
        setRate(res.data.rate);
        hasFetchedProfile.current = true;
        return res.data;
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
      const res = await api.get('/merchant/me');
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
    if (withdrawalAccounts.length > 0 && !force) {
      // Background update silently
      api.get('/withdraw/accounts').then(res => {
        if (res.data.success) {
          setWithdrawalAccounts(res.data.accounts || []);
        }
      }).catch(err => console.error('Silent bg accounts fetch failed:', err));
      
      return withdrawalAccounts;
    }

    const showSkeleton = withdrawalAccounts.length === 0;
    if (showSkeleton) {
      setLoadingAccounts(true);
    }

    try {
      const res = await api.get('/withdraw/accounts');
      if (res.data.success) {
        setWithdrawalAccounts(res.data.accounts || []);
        return res.data.accounts;
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
    if (transactions.length > 0 && !force) {
      // Background update silently
      api.get('/transactions').then(res => {
        if (res.data.success) {
          setTransactions((res.data.transactions || []).slice(0, 20));
        }
      }).catch(err => console.error('Silent bg transactions fetch failed:', err));

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
