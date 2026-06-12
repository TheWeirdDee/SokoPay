import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ArrowLeft, Send, Calendar, Clock, Trash2, AlertTriangle, CheckCircle, Search, Building, User } from 'lucide-react';
import { useCache } from '../context/CacheContext';
import PinModal from '../components/PinModal';

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
  const { profile, balance, rate, updateBalance } = useCache();
  const currentRate = rate || (profile?.country === 'KE' ? 150 : 1500);
  const currencyName = profile?.country === 'KE' ? 'KES' : 'NGN';
  const currencySymbol = profile?.country === 'KE' ? 'KSh' : '₦';
  const [activeTab, setActiveTab] = useState<'instant' | 'schedule' | 'directory'>('instant');

  // Instant Send Form States
  const [instantAddress, setInstantAddress] = useState('');
  const [instantAmount, setInstantAmount] = useState('');
  const [instantNotes, setInstantNotes] = useState('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantError, setInstantError] = useState('');
  const [instantSuccess, setInstantSuccess] = useState('');
  const [instantTxHash, setInstantTxHash] = useState('');

  // Recipient resolution
  const [lookupStatus, setLookupStatus] = useState<'idle' | 'looking' | 'found' | 'not_found' | 'wallet' | 'invalid_wallet' | 'self'>('idle');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [resolvedBusinessName, setResolvedBusinessName] = useState('');

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

  // Search filter for directory
  const [searchQuery, setSearchQuery] = useState('');

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
    fetchScheduled();
    updateBalance();
  }, []);

  useEffect(() => {
    const input = instantAddress.trim();

    if (!input) {
      setLookupStatus('idle');
      setResolvedAddress('');
      setResolvedBusinessName('');
      return;
    }

    // Anything starting with 0x is treated as a wallet address attempt
    if (input.startsWith('0x') || input.startsWith('0X')) {
      if (/^0x[0-9a-fA-F]{40}$/i.test(input)) {
        setLookupStatus('wallet');
        setResolvedAddress(input);
        setResolvedBusinessName('');
      } else {
        setLookupStatus('invalid_wallet');
        setResolvedAddress('');
        setResolvedBusinessName('');
      }
      return;
    }

    // Phone-like: optional + then 7–15 digits/spaces/dashes
    if (/^[+]?[\d\s\-]{7,15}$/.test(input)) {
      // Don't hit the API until the number is long enough to be a complete
      // phone (≥10 digits) — avoids noisy 404s on every keystroke while typing.
      const digitsOnly = input.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        setLookupStatus('idle');
        setResolvedAddress('');
        setResolvedBusinessName('');
        return;
      }
      setLookupStatus('looking');
      const timer = setTimeout(async () => {
        try {
          const encoded = encodeURIComponent(input.replace(/[\s\-]/g, ''));
          const res = await api.get(`/merchant/by-phone/${encoded}`);
          if (res.data.success) {
            setResolvedAddress(res.data.walletAddress);
            setResolvedBusinessName(res.data.businessName);
            setLookupStatus('found');
          } else {
            setResolvedAddress('');
            setResolvedBusinessName('');
            setLookupStatus('not_found');
          }
        } catch (err: any) {
          const msg = err?.response?.data?.error || '';
          setResolvedAddress('');
          setResolvedBusinessName(msg === 'Cannot pay yourself' ? '(yourself)' : '');
          setLookupStatus(msg === 'Cannot pay yourself' ? 'self' : 'not_found');
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    setLookupStatus('idle');
    setResolvedAddress('');
    setResolvedBusinessName('');
  }, [instantAddress]);

  const handleInstantSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInstantError('');
    setInstantSuccess('');
    setInstantTxHash('');

    if (lookupStatus === 'self') {
      setInstantError('Cannot pay yourself.');
      return;
    }

    if (lookupStatus === 'invalid_wallet') {
      setInstantError('Invalid wallet address — must be exactly 42 characters: 0x followed by 40 hex digits (0–9, a–f).');
      return;
    }

    if (!resolvedAddress || !/^0x[0-9a-fA-F]{40}$/i.test(resolvedAddress)) {
      if (lookupStatus === 'not_found') {
        setInstantError('No SokoPay merchant found with that phone number. Try a wallet address instead.');
      } else if (lookupStatus === 'looking') {
        setInstantError('Still looking up recipient — please wait a moment.');
      } else {
        setInstantError('Enter a phone number (e.g. 08012345678) or a full wallet address (0x + 40 hex chars).');
      }
      return;
    }

    const localAmt = parseFloat(instantAmount);
    if (isNaN(localAmt) || localAmt <= 0) {
      setInstantError('Please enter a valid transfer amount.');
      return;
    }

    const amountCusd = localAmt / currentRate;
    const GAS_BUFFER_CUSD = 0.01; // mirror the backend's gas reserve
    if (balance && amountCusd + GAS_BUFFER_CUSD > parseFloat(balance.cusd)) {
      const haveLocal = parseFloat(balance.cusd) * currentRate;
      const gasLocal = GAS_BUFFER_CUSD * currentRate;
      setInstantError(`Insufficient balance after network fees. You have ${currencySymbol}${haveLocal.toFixed(2)}; this transfer needs ${currencySymbol}${localAmt.toFixed(2)} plus ~${currencySymbol}${gasLocal.toFixed(0)} for network fees.`);
      return;
    }

    // Demo mode: skip PIN modal, use default PIN
    await executeInstantSend('0000');
  };

  const executeInstantSend = async (verifiedPin: string) => {
    const localAmt = parseFloat(instantAmount);
    const amountCusd = localAmt / currentRate;
    setInstantLoading(true);
    try {
      const response = await api.post('/payments/send', {
        recipientAddress: resolvedAddress,
        amountCusd: amountCusd,
        notes: instantNotes,
        paymentPassword: verifiedPin
      });

      const data = response.data;
      const txHash = data?.txHash;

      if (
        data?.success === true &&
        txHash &&
        typeof txHash === 'string' &&
        txHash.startsWith('0x') &&
        txHash.length === 66
      ) {
        const displayRecipient = resolvedBusinessName || `${resolvedAddress.substring(0, 6)}...${resolvedAddress.substring(38)}`;
        setInstantSuccess(`Successfully sent ${currencySymbol}${localAmt.toFixed(2)} (≈ ${amountCusd.toFixed(2)} cUSD) to ${displayRecipient}!`);
        setInstantTxHash(txHash);
        setInstantAddress('');
        setInstantAmount('');
        setInstantNotes('');
        setResolvedAddress('');
        setResolvedBusinessName('');
        setLookupStatus('idle');
        updateBalance();
      } else {
        const errorMsg = data?.error || 'Invalid transaction hash received from server. Payment might have failed.';
        setInstantError(errorMsg);
      }
    } catch (err: any) {
      console.error('Instant payment error:', err);
      const raw = err.response?.data?.error || err.message || 'Failed to send payment.';
      const friendly = raw.includes('fetch failed') || raw.includes('Network Error')
        ? 'Could not reach the server. Check your connection and try again.'
        : raw;
      setInstantError(friendly);
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

    const localAmt = parseFloat(schedAmount);
    if (isNaN(localAmt) || localAmt <= 0) {
      setSchedError('Please enter a valid amount.');
      return;
    }

    const amountCusd = localAmt / currentRate;

    if (!schedDate) {
      setSchedError('Please select a scheduled execution date and time.');
      return;
    }

    setSchedLoading(true);
    try {
      await api.post('/payments/schedule', {
        recipient: schedRecipient,
        recipientAddress: schedAddress || null,
        amountCusd: amountCusd,
        description: schedDescription || null,
        scheduledAt: new Date(schedDate).toISOString(),
        recurrence: schedRecurrence === 'none' ? null : schedRecurrence
      });

      setSchedSuccess(`Successfully scheduled payment of ${currencySymbol}${localAmt.toFixed(2)} (≈ ${amountCusd.toFixed(2)} cUSD) to ${schedRecipient}!`);
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
          {!balance ? (
            <div className="h-8 w-24 bg-border/20 animate-pulse mt-1 rounded"></div>
          ) : (
            <div className="font-display text-3xl font-black mt-0.5">{Number(balance.cusd).toFixed(2)} <span className="text-lg">cUSD</span></div>
          )}
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Local Value</span>
          {!balance ? (
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
        <button
          onClick={() => setActiveTab('directory')}
          className={`flex-1 pb-3 font-display font-bold text-sm text-center border-b-4 transition-colors ${
            activeTab === 'directory'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text'
          }`}
        >
          <div className="flex justify-center items-center gap-2">
            <Building className="w-4 h-4" /> B2B Directory
          </div>
        </button>
      </div>

      {/* Active Form */}
      <div className="bg-bg-card border-2 border-border rounded-xl p-5 shadow-card mb-8">
        {activeTab === 'instant' ? (
          <form onSubmit={handleInstantSendSubmit} className="space-y-4">
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

            <div className="space-y-1">
              <Input
                label="Recipient (Phone Number or Wallet Address)"
                placeholder="e.g. 08012345678 or 0x..."
                value={instantAddress}
                onChange={(e) => setInstantAddress(e.target.value)}
                required
              />
              {lookupStatus === 'looking' && (
                <p className="text-xs text-text-muted font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 bg-text-muted rounded-full animate-pulse" />
                  Looking up merchant...
                </p>
              )}
              {lookupStatus === 'found' && (
                <div className="text-xs text-success font-bold flex items-start gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    SokoPay merchant found: {resolvedBusinessName}
                    {resolvedAddress && (
                      <span className="block font-mono font-normal text-[10px] text-text-muted mt-0.5">
                        {resolvedAddress.substring(0, 6)}...{resolvedAddress.substring(38)}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {lookupStatus === 'not_found' && (
                <p className="text-xs text-error font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  No SokoPay merchant with this number
                </p>
              )}
              {lookupStatus === 'self' && (
                <p className="text-xs text-error font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Cannot pay yourself
                </p>
              )}
              {lookupStatus === 'wallet' && (
                <p className="text-xs text-text-muted font-semibold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  External wallet address
                </p>
              )}
              {lookupStatus === 'invalid_wallet' && (
                <p className="text-xs text-error font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {instantAddress.length !== 42
                    ? `Wrong length (${instantAddress.length} chars) — wallet address must be exactly 42`
                    : 'Contains invalid characters — only 0–9 and a–f allowed after 0x'}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <div className="relative">
                <Input
                  label={`Amount (${currencyName})`}
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={instantAmount}
                  onChange={(e) => setInstantAmount(e.target.value)}
                  required
                />
                <span className="absolute right-3 bottom-3 text-xs font-bold text-text-muted">{currencyName}</span>
              </div>
              {instantAmount && !isNaN(parseFloat(instantAmount)) && (
                <p className="text-xs text-text-muted font-semibold mt-1">
                  ≈ {(parseFloat(instantAmount) / currentRate).toFixed(2)} cUSD (Rate: 1 cUSD = {currentRate} {currencyName})
                </p>
              )}
            </div>

            <Input
              label="Notes (Optional)"
              placeholder="What is this payment for?"
              value={instantNotes}
              onChange={(e) => setInstantNotes(e.target.value)}
            />

            <Button type="submit" isLoading={instantLoading} className="w-full">
              Send Payment
            </Button>
          </form>
        ) : activeTab === 'schedule' ? (
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

            <div className="space-y-1">
              <div className="relative">
                <Input
                  label={`Amount (${currencyName})`}
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={schedAmount}
                  onChange={(e) => setSchedAmount(e.target.value)}
                  required
                />
                <span className="absolute right-3 bottom-3 text-xs font-bold text-text-muted">{currencyName}</span>
              </div>
              {schedAmount && !isNaN(parseFloat(schedAmount)) && (
                <p className="text-xs text-text-muted font-semibold mt-1">
                  ≈ {(parseFloat(schedAmount) / currentRate).toFixed(2)} cUSD (Rate: 1 cUSD = {currentRate} {currencyName})
                </p>
              )}
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
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-start border-b border-border/40 pb-3">
              <div>
                <h2 className="font-display font-bold text-lg">B2B Merchant Directory</h2>
                <p className="text-xs text-[#7A6B55] font-semibold mt-0.5">Find distributors and pay directly in stablecoins.</p>
              </div>
              <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-[#C4622D] text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                ⏳ Sandbox Mode
              </span>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search verified SokoPay merchants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-bg border-2 border-border focus:border-accent outline-none rounded-md transition-colors font-semibold text-sm"
              />
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-3.5" />
            </div>

            <div className="space-y-3 pt-2">
              {[
                { name: 'Kola Wholesalers Ltd', phone: '+234 803 111 2222', country: 'NG', address: '0x32A1f28b4c798d1a334Bc108873E189680321288', industry: 'Agrochemicals & Fertilizers' },
                { name: 'Amaka Retail Cosmetics', phone: '+234 812 333 4444', country: 'NG', address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', industry: 'Cosmetics & Hair wholesale' },
                { name: 'Nairobi Agro-Suppliers', phone: '+254 712 345 678', country: 'KE', address: '0x1Fd23b8c4d798a1a334Cc108873E189680323399', industry: 'Farm Implements & Feed' },
                { name: 'Mombasa Grain Distributors', phone: '+254 722 999 888', country: 'KE', address: '0x992d35Cc6634C0532925a3b844Bc454e4438f222', industry: 'Cereals & Pulses Wholesaler' },
              ]
                .filter(m => searchQuery === '' || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.industry.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((m, idx) => (
                  <div
                    key={idx}
                    className="bg-bg border-2 border-border rounded-lg p-4 shadow-sm hover:shadow-card hover:bg-bg-card transition-all cursor-pointer flex justify-between items-center"
                    onClick={() => {
                      setInstantAddress(m.address);
                      setActiveTab('instant');
                    }}
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-sm text-[#1A1208] flex items-center gap-1.5">
                        <span>{m.name}</span>
                        <span>{m.country === 'NG' ? '🇳🇬' : '🇰🇪'}</span>
                      </div>
                      <span className="text-[10px] text-[#7A6B55] font-mono block">Address: {m.address.substring(0, 8)}...{m.address.substring(34)}</span>
                      <span className="bg-[#FAF7F2] border border-[#DDD5C5] text-text-muted text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block mt-1">
                        {m.industry}
                      </span>
                    </div>
                    <button className="px-3 py-1.5 bg-[#C4622D]/10 hover:bg-[#C4622D] hover:text-white border border-[#C4622D] text-[#C4622D] text-xs font-bold rounded transition-colors">
                      Select
                    </button>
                  </div>
                ))}
            </div>
          </div>
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
                    <div className="text-[10px] font-mono text-text-muted font-semibold">
                      ≈ {currencySymbol}{(payment.amountCusd * currentRate).toFixed(2)}
                    </div>
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

      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={executeInstantSend}
        description={`Confirm payment of ${currencySymbol}${instantAmount || '0'} (≈ ${(parseFloat(instantAmount || '0') / currentRate).toFixed(2)} cUSD) to ${resolvedBusinessName || (resolvedAddress ? `${resolvedAddress.substring(0, 6)}...${resolvedAddress.substring(38)}` : '—')}`}
      />
    </div>
  );
}
