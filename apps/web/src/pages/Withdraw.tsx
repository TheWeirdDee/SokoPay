import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ArrowLeft, Landmark, Smartphone, Plus, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';

interface WithdrawalAccount {
  id: string;
  type: string;
  accountNumber: string | null;
  bankName: string | null;
  bankCode: string | null;
  mpesaNumber: string | null;
  isDefault: boolean;
}

interface Merchant {
  id: string;
  country: string;
}

interface PreviewData {
  rate: number;
  amountLocal: number;
  feeLocal: number;
  feeCusd: number;
  netSettlementLocal: number;
  currency: string;
}

export default function Withdraw() {
  const navigate = useNavigate();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [balance, setBalance] = useState({ cusd: '0.00', currency: 'NGN', local: '0.00' });
  const [loadingMerchant, setLoadingMerchant] = useState(true);

  // Accounts List State
  const [accounts, setAccounts] = useState<WithdrawalAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Link Account Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [accType, setAccType] = useState<'bank' | 'mpesa'>('bank');
  const [accNumber, setAccNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [mpesaNumber, setMpesaNumber] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');

  // Withdraw execution form state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [paymentPassword, setPaymentPassword] = useState('');
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState('');
  const [execSuccess, setExecSuccess] = useState('');
  const [execTxHash, setExecTxHash] = useState('');
  const [execTrackingId, setExecTrackingId] = useState('');

  // Preview State
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fetchMerchantAndBalance = async () => {
    try {
      const response = await api.get('/merchant/me');
      setMerchant(response.data.merchant);
      setBalance(response.data.balance);
      
      // Default form account type based on country
      if (response.data.merchant.country === 'KE') {
        setAccType('mpesa');
      } else {
        setAccType('bank');
      }
    } catch (err: any) {
      console.error('Error fetching merchant details:', err);
    } finally {
      setLoadingMerchant(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/withdraw/accounts');
      const accountsList = response.data.accounts || [];
      setAccounts(accountsList);
      
      // Auto select default account or first account
      if (accountsList.length > 0) {
        const defaultAcc = accountsList.find((a: WithdrawalAccount) => a.isDefault);
        setSelectedAccountId(defaultAcc ? defaultAcc.id : accountsList[0].id);
      }
    } catch (err: any) {
      console.error('Error fetching withdrawal accounts:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchMerchantAndBalance();
    fetchAccounts();
  }, []);

  // Fetch FX preview when amount changes
  useEffect(() => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setPreview(null);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoadingPreview(true);
      try {
        const response = await api.get(`/withdraw/preview?amountCusd=${amount}`);
        setPreview(response.data);
      } catch (err) {
        console.error('Failed to load preview:', err);
      } finally {
        setLoadingPreview(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [withdrawAmount]);

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError('');
    setLinkSuccess('');
    setLinkLoading(true);

    const payload: any = {
      type: accType,
      isDefault
    };

    if (accType === 'mpesa') {
      if (!mpesaNumber) {
        setLinkError('M-Pesa number is required');
        setLinkLoading(false);
        return;
      }
      payload.mpesaNumber = mpesaNumber;
    } else {
      if (!accNumber || !bankName) {
        setLinkError('Account number and bank name are required');
        setLinkLoading(false);
        return;
      }
      payload.accountNumber = accNumber;
      payload.bankName = bankName;
      payload.bankCode = bankCode || '101';
    }

    try {
      const response = await api.post('/withdraw/accounts', payload);
      setLinkSuccess(`Linked withdrawal account successfully!`);
      setMpesaNumber('');
      setAccNumber('');
      setBankName('');
      setBankCode('');
      setIsDefault(false);
      setShowAddForm(false);
      
      // Refresh list
      await fetchAccounts();
      
      // Auto select the new account
      if (response.data.account) {
        setSelectedAccountId(response.data.account.id);
      }
    } catch (err: any) {
      console.error('Link account error:', err);
      setLinkError(err.response?.data?.error || 'Failed to link account.');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleExecuteWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    setExecError('');
    setExecSuccess('');
    setExecTxHash('');
    setExecTrackingId('');

    if (!selectedAccountId) {
      setExecError('Please select a withdrawal account.');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setExecError('Please enter a valid amount.');
      return;
    }

    if (amount > parseFloat(balance.cusd)) {
      setExecError('Insufficient balance to complete withdrawal.');
      return;
    }

    if (!paymentPassword) {
      setExecError('Please enter your 4-digit payment PIN.');
      return;
    }

    setExecLoading(true);
    try {
      const response = await api.post('/withdraw/execute', {
        amountCusd: amount,
        withdrawalAccountId: selectedAccountId,
        paymentPassword
      });

      setExecSuccess(`Withdrawal executed successfully! Payout processing.`);
      if (response.data.txHash) setExecTxHash(response.data.txHash);
      if (response.data.offramp?.trackingId) setExecTrackingId(response.data.offramp.trackingId);
      
      setWithdrawAmount('');
      setPaymentPassword('');
      setPreview(null);
      
      // Reload balance
      fetchMerchantAndBalance();
    } catch (err: any) {
      console.error('Execute withdrawal error:', err);
      setExecError(err.response?.data?.error || 'Withdrawal execution failed.');
    } finally {
      setExecLoading(false);
    }
  };

  const selectedAccountDetails = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="min-h-screen bg-bg p-4 pb-24 font-body text-text">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 border-2 border-border bg-bg-card rounded-md shadow-card hover:bg-border transition-colors active:translate-x-[1px] active:translate-y-[1px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display text-2xl font-bold">Withdraw Funds</h1>
      </div>

      {/* Balance Box */}
      <div className="bg-bg-dark text-text-light p-5 rounded-xl border-2 border-border shadow-card mb-6 flex justify-between items-center">
        <div>
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Available Balance</span>
          {loadingMerchant ? (
            <div className="h-8 w-24 bg-border/20 animate-pulse mt-1 rounded"></div>
          ) : (
            <div className="font-display text-3xl font-black mt-0.5">{Number(balance.cusd).toFixed(2)} <span className="text-lg">cUSD</span></div>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Local Value</span>
          {loadingMerchant ? (
            <div className="h-6 w-20 bg-border/20 animate-pulse mt-1 rounded ml-auto"></div>
          ) : (
            <div className="font-mono text-sm mt-0.5 text-accent font-bold">
              {balance.currency === 'KES' ? 'KSh' : '₦'}{Number(balance.local).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {/* Main Withdrawal Area */}
      <div className="bg-bg-card border-2 border-border rounded-xl p-5 shadow-card mb-6">
        <h2 className="font-display font-bold text-lg mb-4">Off-ramp Settlement</h2>

        {execError && (
          <div className="p-3 bg-error/10 border border-error text-error text-xs font-semibold rounded-md flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{execError}</span>
          </div>
        )}

        {execSuccess && (
          <div className="p-3 bg-success/10 border border-success text-success text-xs font-semibold rounded-md flex items-center gap-2 mb-4">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <div className="flex-1">
              <p>{execSuccess}</p>
              {execTrackingId && <p className="text-[10px] text-text-muted mt-0.5">Tracking ID: {execTrackingId}</p>}
              {execTxHash && (
                <a
                  href={`https://celoscan.io/tx/${execTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-mono text-[10px] block mt-1 hover:text-success/80"
                >
                  View Celoscan Tx Hash
                </a>
              )}
            </div>
          </div>
        )}

        {accounts.length === 0 && !loadingAccounts ? (
          <div className="border-2 border-dashed border-border p-6 rounded-lg text-center text-text-muted text-xs space-y-4 mb-4">
            <p>You need to link a bank account or mobile wallet first to withdraw funds.</p>
            <Button onClick={() => setShowAddForm(true)} variant="outline" className="text-xs py-2 w-auto mx-auto flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Link Account
            </Button>
          </div>
        ) : (
          <form onSubmit={handleExecuteWithdrawal} className="space-y-4">
            {/* Account Selector */}
            <div>
              <label className="block mb-1 text-sm font-semibold text-text-muted">Receive account</label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-4 py-3 bg-bg border-2 border-border focus:border-accent outline-none rounded-md transition-colors font-semibold"
                required
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.type === 'mpesa' 
                      ? `M-Pesa (${acc.mpesaNumber})` 
                      : `${acc.bankName} - ${acc.accountNumber}`} {acc.isDefault ? '[DEFAULT]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount Input */}
            <div className="relative">
              <Input
                label="Amount to Withdraw (cUSD)"
                type="number"
                step="any"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                required
              />
              <span className="absolute right-3 bottom-3 text-xs font-bold text-text-muted">cUSD</span>
            </div>

            {/* Conversion Preview Box */}
            {loadingPreview ? (
              <div className="bg-bg border border-border p-4 rounded-lg flex items-center justify-center py-6 text-xs text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Calculating conversion details...
              </div>
            ) : preview ? (
              <div className="bg-bg border-2 border-border p-4 rounded-lg space-y-2 text-xs font-semibold">
                <div className="flex justify-between">
                  <span className="text-text-muted">Exchange Rate (Live)</span>
                  <span className="font-mono">1 cUSD = {preview.rate.toFixed(2)} {preview.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Gross Amount</span>
                  <span>{preview.amountLocal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {preview.currency}</span>
                </div>
                <div className="flex justify-between text-error">
                  <span>Off-ramp Fee</span>
                  <span>-{preview.feeLocal.toFixed(2)} {preview.currency}</span>
                </div>
                <hr className="border-border" />
                <div className="flex justify-between text-sm font-bold text-success pt-1">
                  <span>Net Settlement</span>
                  <span>{preview.netSettlementLocal.toLocaleString('en-US', { minimumFractionDigits: 2 })} {preview.currency}</span>
                </div>
              </div>
            ) : null}

            <Input
              label="4-Digit Payment PIN"
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={paymentPassword}
              onChange={(e) => setPaymentPassword(e.target.value.replace(/\D/g, ''))}
              required
            />

            <Button type="submit" isLoading={execLoading} className="w-full">
              Withdraw to {selectedAccountDetails?.type === 'mpesa' ? 'M-Pesa' : 'Bank'}
            </Button>
          </form>
        )}
      </div>

      {/* Withdrawal Accounts Listing & Linking */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="font-display font-bold text-lg">Linked Accounts</h2>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs font-bold text-accent flex items-center gap-1 hover:underline"
            >
              <Plus className="w-4 h-4" /> Link Account
            </button>
          )}
        </div>

        {linkSuccess && (
          <div className="p-3 bg-success/10 border border-success text-success text-xs font-semibold rounded-md flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{linkSuccess}</span>
          </div>
        )}

        {/* Collapsible Add Account Form */}
        {showAddForm && (
          <div className="bg-bg-card border-2 border-border rounded-xl p-5 shadow-card space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-display font-bold text-sm">Link New Withdrawal Account</h3>
              <button 
                onClick={() => setShowAddForm(false)} 
                className="text-xs text-text-muted font-bold hover:text-text"
              >
                Cancel
              </button>
            </div>

            {linkError && (
              <div className="p-3 bg-error/10 border border-error text-error text-xs font-semibold rounded-md flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{linkError}</span>
              </div>
            )}

            <form onSubmit={handleLinkAccount} className="space-y-3">
              <div>
                <label className="block mb-1 text-sm font-semibold text-text-muted">Account Type</label>
                <div className="flex gap-4">
                  {merchant?.country === 'KE' ? (
                    <label className="flex items-center gap-2 font-semibold text-xs cursor-pointer">
                      <input 
                        type="radio" 
                        name="accType" 
                        value="mpesa" 
                        checked={accType === 'mpesa'} 
                        onChange={() => setAccType('mpesa')}
                      />
                      M-Pesa Mobile Money
                    </label>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 font-semibold text-xs cursor-pointer">
                        <input 
                          type="radio" 
                          name="accType" 
                          value="bank" 
                          checked={accType === 'bank'} 
                          onChange={() => setAccType('bank')}
                        />
                        Local Bank Account
                      </label>
                    </>
                  )}
                </div>
              </div>

              {accType === 'mpesa' ? (
                <Input
                  label="M-Pesa phone number"
                  placeholder="e.g. +254 712345678"
                  value={mpesaNumber}
                  onChange={(e) => setMpesaNumber(e.target.value)}
                  required
                />
              ) : (
                <>
                  <Input
                    label="Bank Account Number"
                    placeholder="e.g. 0123456789"
                    value={accNumber}
                    onChange={(e) => setAccNumber(e.target.value)}
                    required
                  />
                  <Input
                    label="Bank Name"
                    placeholder="e.g. GTBank or Zenith Bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                  />
                  <Input
                    label="Bank Code (Optional)"
                    placeholder="e.g. 058 for GTBank"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                  />
                </>
              )}

              <label className="flex items-center gap-2 font-semibold text-xs select-none cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded text-accent focus:ring-accent w-4 h-4"
                />
                Set as default withdrawal account
              </label>

              <Button type="submit" isLoading={linkLoading} className="w-full mt-2">
                Link Account
              </Button>
            </form>
          </div>
        )}

        {/* Linked Accounts List */}
        {loadingAccounts ? (
          <div className="h-16 bg-bg-card border border-border rounded-lg animate-pulse"></div>
        ) : accounts.length === 0 ? (
          <div className="border-2 border-dashed border-border p-6 rounded-lg text-center text-text-muted text-xs">
            No withdrawal accounts linked yet.
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div 
                key={acc.id}
                className="bg-bg-card border-2 border-border rounded-lg p-4 shadow-card flex justify-between items-center hover:shadow-hover transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 border border-border bg-bg rounded-md">
                    {acc.type === 'mpesa' ? <Smartphone className="w-5 h-5 text-accent" /> : <Landmark className="w-5 h-5 text-accent" />}
                  </div>
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      {acc.type === 'mpesa' ? 'M-Pesa Account' : acc.bankName}
                      {acc.isDefault && (
                        <span className="bg-success/20 text-success text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border border-success/30">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted font-mono mt-0.5">
                      {acc.type === 'mpesa' ? acc.mpesaNumber : `Acc No: ${acc.accountNumber}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
