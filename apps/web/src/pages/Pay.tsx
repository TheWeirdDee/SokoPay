import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ArrowLeft, Send, Calendar, Clock, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

interface ScheduledPayment {
  id: string;
  recipient: string;
  recipientAddress: string | null;
  amountCusd: number;
  description: string | null;
  scheduledAt: string;
  recurrence: string | null;
  executed: boolean;
}

export default function Pay() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'instant' | 'schedule'>('instant');
  const [balance, setBalance] = useState({ cusd: '0.00', currency: 'NGN', local: '0.00' });
  const [loadingBalance, setLoadingBalance] = useState(true);

  // Instant Send Form States
  const [instantAddress, setInstantAddress] = useState('');
  const [instantAmount, setInstantAmount] = useState('');
  const [instantNotes, setInstantNotes] = useState('');
  const [instantPaymentPassword, setInstantPaymentPassword] = useState('');
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState('');
  const [instantSuccess, setInstantSuccess] = useState('');
  const [instantTxHash, setInstantTxHash] = useState('');

  // Schedule Payment Form States
  const [schedRecipient, setSchedRecipient] = useState('');
  const [schedAddress, setSchedAddress] = useState('');
  const [schedAmount, setSchedAmount] = useState('');
  const [schedDescription, setSchedDescription] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedRecurrence, setSchedRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedError, setSchedError] = useState('');
  const [schedSuccess, setSchedSuccess] = useState('');

  // Scheduled Payments List State
  const [scheduledList, setScheduledList] = useState<ScheduledPayment[]>([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);

  const fetchBalanceAndMerchant = async () => {
    try {
      const response = await api.get('/merchant/me');
      setBalance(response.data.balance);
    } catch (err: any) {
      console.error('Error fetching merchant details:', err);
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchScheduled = async () => {
    try {
      const response = await api.get('/payments/scheduled');
      setScheduledList(response.data.scheduledPayments || []);
    } catch (err: any) {
      console.error('Error fetching scheduled payments:', err);
    } finally {
      setLoadingScheduled(false);
    }
  };

  useEffect(() => {
    fetchBalanceAndMerchant();
    fetchScheduled();
  }, []);

  const handleInstantSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setInstantError('');
    setInstantSuccess('');
    setInstantTxHash('');

    if (!instantAddress.startsWith('0x') || instantAddress.length !== 42) {
      setInstantError('Please enter a valid Celo wallet address starting with 0x.');
      return;
    }

    const amount = parseFloat(instantAmount);
    if (isNaN(amount) || amount <= 0) {
      setInstantError('Please enter a valid transfer amount.');
      return;
    }

    if (amount > parseFloat(balance.cusd)) {
      setInstantError('Insufficient balance to complete this transfer.');
      return;
    }

    if (!instantPaymentPassword) {
      setInstantError('Please enter your 4-digit payment PIN.');
      return;
    }

    setInstantLoading(true);
    try {
      const response = await api.post('/payments/send', {
        recipientAddress: instantAddress,
        amountCusd: amount,
        notes: instantNotes,
        paymentPassword: instantPaymentPassword
      });

      setInstantSuccess(`Successfully sent ${amount} cUSD to ${instantAddress.substring(0, 6)}...${instantAddress.substring(38)}!`);
      if (response.data.txHash) {
        setInstantTxHash(response.data.txHash);
      }
      setInstantAddress('');
      setInstantAmount('');
      setInstantNotes('');
      setInstantPaymentPassword('');
      fetchBalanceAndMerchant();
    } catch (err: any) {
      console.error('Instant payment error:', err);
      setInstantError(err.response?.data?.error || 'Failed to send payment.');
    } finally {
      setInstantLoading(false);
    }
  };

  const handleScheduleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedError('');
    setSchedSuccess('');

    if (!schedRecipient.trim()) {
      setSchedError('Recipient name is required.');
      return;
    }

    if (schedAddress && (!schedAddress.startsWith('0x') || schedAddress.length !== 42)) {
      setSchedError('If providing a Celo address, it must start with 0x.');
      return;
    }

    const amount = parseFloat(schedAmount);
    if (isNaN(amount) || amount <= 0) {
      setSchedError('Please enter a valid amount.');
      return;
    }

    if (!schedDate) {
      setSchedError('Please select a scheduled execution date and time.');
      return;
    }

    setSchedLoading(true);
    try {
      await api.post('/payments/schedule', {
        recipient: schedRecipient,
        recipientAddress: schedAddress || null,
        amountCusd: amount,
        description: schedDescription || null,
        scheduledAt: new Date(schedDate).toISOString(),
        recurrence: schedRecurrence === 'none' ? null : schedRecurrence
      });

      setSchedSuccess(`Successfully scheduled payment of ${amount} cUSD to ${schedRecipient}!`);
      setSchedRecipient('');
      setSchedAddress('');
      setSchedAmount('');
      setSchedDescription('');
      setSchedDate('');
      setSchedRecurrence('none');
      fetchScheduled();
    } catch (err: any) {
      console.error('Schedule payment error:', err);
      setSchedError(err.response?.data?.error || 'Failed to schedule payment.');
    } finally {
      setSchedLoading(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled payment?')) return;
    try {
      await api.delete(`/payments/scheduled/${id}`);
      fetchScheduled();
    } catch (err: any) {
      console.error('Cancel scheduled payment error:', err);
      alert(err.response?.data?.error || 'Failed to cancel scheduled payment.');
    }
  };

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
        <h1 className="font-display text-2xl font-bold">Payments</h1>
      </div>

      {/* Balance Card */}
      <div className="bg-bg-dark text-text-light p-5 rounded-xl border-2 border-border shadow-card mb-6 flex justify-between items-center">
        <div>
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Available Balance</span>
          {loadingBalance ? (
            <div className="h-8 w-24 bg-border/20 animate-pulse mt-1 rounded"></div>
          ) : (
            <div className="font-display text-3xl font-black mt-0.5">{Number(balance.cusd).toFixed(2)} <span className="text-lg">cUSD</span></div>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Local Value</span>
          {loadingBalance ? (
            <div className="h-6 w-20 bg-border/20 animate-pulse mt-1 rounded ml-auto"></div>
          ) : (
            <div className="font-mono text-sm mt-0.5 text-accent font-bold">
              {balance.currency === 'KES' ? 'KSh' : '₦'}{Number(balance.local).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b-2 border-border mb-6">
        <button
          onClick={() => setActiveTab('instant')}
          className={`flex-1 pb-3 font-display font-bold text-sm text-center border-b-4 transition-colors ${
            activeTab === 'instant'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <div className="flex justify-center items-center gap-2">
            <Send className="w-4 h-4" /> Instant Transfer
          </div>
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 pb-3 font-display font-bold text-sm text-center border-b-4 transition-colors ${
            activeTab === 'schedule'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <div className="flex justify-center items-center gap-2">
            <Calendar className="w-4 h-4" /> Schedule / Recurring
          </div>
        </button>
      </div>

      {/* Active Form */}
      <div className="bg-bg-card border-2 border-border rounded-xl p-5 shadow-card mb-8">
        {activeTab === 'instant' ? (
          <form onSubmit={handleInstantSend} className="space-y-4">
            <h2 className="font-display font-bold text-lg mb-2">Send Instant Payment</h2>

            {instantError && (
              <div className="p-3 bg-error/10 border border-error text-error text-xs font-semibold rounded-md flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{instantError}</span>
              </div>
            )}

            {instantSuccess && (
              <div className="p-3 bg-success/10 border border-success text-success text-xs font-semibold rounded-md flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <div className="flex-1">
                  <p>{instantSuccess}</p>
                  {instantTxHash && (
                    <a
                      href={`https://celoscan.io/tx/${instantTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-mono text-[10px] block mt-1 hover:text-success/80 flex items-center gap-1"
                    >
                      View on Celoscan
                    </a>
                  )}
                </div>
              </div>
            )}

            <Input
              label="Recipient Celo Wallet Address"
              placeholder="0x..."
              value={instantAddress}
              onChange={(e) => setInstantAddress(e.target.value)}
              required
            />

            <div className="relative">
              <Input
                label="Amount (cUSD)"
                type="number"
                step="any"
                placeholder="0.00"
                value={instantAmount}
                onChange={(e) => setInstantAmount(e.target.value)}
                required
              />
              <span className="absolute right-3 bottom-3 text-xs font-bold text-text-muted">cUSD</span>
            </div>

            <Input
              label="Notes (Optional)"
              placeholder="What is this payment for?"
              value={instantNotes}
              onChange={(e) => setInstantNotes(e.target.value)}
            />

            <Input
              label="4-Digit Payment PIN"
              type="password"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={instantPaymentPassword}
              onChange={(e) => setInstantPaymentPassword(e.target.value.replace(/\D/g, ''))}
              required
            />

            <Button type="submit" isLoading={instantLoading} className="w-full">
              Send Payment
            </Button>
          </form>
        ) : (
          <form onSubmit={handleScheduleSend} className="space-y-4">
            <h2 className="font-display font-bold text-lg mb-2">Schedule Future Payment</h2>

            {schedError && (
              <div className="p-3 bg-error/10 border border-error text-error text-xs font-semibold rounded-md flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{schedError}</span>
              </div>
            )}

            {schedSuccess && (
              <div className="p-3 bg-success/10 border border-success text-success text-xs font-semibold rounded-md flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{schedSuccess}</span>
              </div>
            )}

            <Input
              label="Recipient Name / Business"
              placeholder="e.g. Kola Stores"
              value={schedRecipient}
              onChange={(e) => setSchedRecipient(e.target.value)}
              required
            />

            <Input
              label="Recipient Celo Wallet Address (Optional)"
              placeholder="0x..."
              value={schedAddress}
              onChange={(e) => setSchedAddress(e.target.value)}
            />

            <div className="relative">
              <Input
                label="Amount (cUSD)"
                type="number"
                step="any"
                placeholder="0.00"
                value={schedAmount}
                onChange={(e) => setSchedAmount(e.target.value)}
                required
              />
              <span className="absolute right-3 bottom-3 text-xs font-bold text-text-muted">cUSD</span>
            </div>

            <Input
              label="Description (Optional)"
              placeholder="e.g. Monthly rent or supplier payment"
              value={schedDescription}
              onChange={(e) => setSchedDescription(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block mb-1 text-sm font-semibold text-text-muted">Date & Time</label>
                <input
                  type="datetime-local"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full px-4 py-3 bg-bg border-2 border-border focus:border-accent outline-none rounded-md transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block mb-1 text-sm font-semibold text-text-muted">Recurrence</label>
                <select
                  value={schedRecurrence}
                  onChange={(e: any) => setSchedRecurrence(e.target.value)}
                  className="w-full px-4 py-3 bg-bg border-2 border-border focus:border-accent outline-none rounded-md transition-colors font-semibold"
                >
                  <option value="none">One-time</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            </div>

            <Button type="submit" isLoading={schedLoading} className="w-full mt-2">
              Schedule Payment
            </Button>
          </form>
        )}
      </div>

      {/* Scheduled Payments List */}
      <div className="space-y-4">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-accent" /> Pending Scheduled Payments
        </h2>

        {loadingScheduled ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-bg-card border border-border rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : scheduledList.length === 0 ? (
          <div className="border-2 border-dashed border-border p-6 rounded-lg text-center text-text-muted text-xs">
            No scheduled or recurring payments found.
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledList.map((payment) => (
              <div
                key={payment.id}
                className="bg-bg-card border-2 border-border rounded-lg p-4 shadow-card flex justify-between items-center hover:shadow-hover transition-shadow"
              >
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-2">
                    {payment.recipient}
                    {payment.recurrence && (
                      <span className="bg-secondary/20 text-secondary text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border border-secondary/30">
                        {payment.recurrence}
                      </span>
                    )}
                  </div>
                  {payment.recipientAddress && (
                    <span className="text-[10px] font-mono text-text-muted block">
                      Address: {payment.recipientAddress.substring(0, 6)}...{payment.recipientAddress.substring(38)}
                    </span>
                  )}
                  <span className="text-[10px] text-text-muted block font-semibold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Scheduled: {new Date(payment.scheduledAt).toLocaleString()}
                  </span>
                  {payment.description && (
                    <p className="text-xs italic text-text-muted mt-1">"{payment.description}"</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display font-black text-accent">{payment.amountCusd.toFixed(2)} cUSD</div>
                  </div>
                  <button
                    onClick={() => handleCancelScheduled(payment.id)}
                    className="p-2 border-2 border-error/30 text-error hover:bg-error/10 rounded-md transition-colors"
                    title="Cancel Payment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
