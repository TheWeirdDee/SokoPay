import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AlertTriangle, FlaskConical } from 'lucide-react';

interface PaymentPageData {
  success: boolean;
  type: 'invoice' | 'merchant';
  invoice?: {
    id: string;
    customerName: string | null;
    amountLocal: number;
    currencyLocal: string;
    description: string | null;
    status: string;
    dueDate: string | null;
  };
  merchant: {
    id: string;
    businessName: string;
    country: string;
    isVerified: boolean;
  };
  accounts: {
    bank: { bankName: string; accountNumber: string } | null;
    opay: { accountNumber: string } | null;
    mpesa: { mpesaTill: string } | null;
  };
}

export default function PublicPayment() {
  const { linkToken } = useParams<{ linkToken: string }>();
  const [data, setData] = useState<PaymentPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form inputs (for direct merchant payment)
  const [customerName, setCustomerName] = useState('');
  const [amountLocal, setAmountLocal] = useState('');
  const [description, setDescription] = useState('');
  
  // Payment execution state
  const [phone, setPhone] = useState(''); // For M-Pesa
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [successTx, setSuccessTx] = useState<any>(null);
  const [simulatedMode, setSimulatedMode] = useState(false); // Toggle to simulate cUSD swap directly

  useEffect(() => {
    async function fetchPaymentDetails() {
      try {
        const response = await api.get(`/p/${linkToken}`);
        setData(response.data);
        if (response.data.type === 'invoice' && response.data.invoice) {
          setAmountLocal(response.data.invoice.amountLocal.toString());
          setCustomerName(response.data.invoice.customerName || '');
          setDescription(response.data.invoice.description || '');
        }
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to load payment link.');
      } finally {
        setIsLoading(false);
      }
    }
    if (linkToken) {
      fetchPaymentDetails();
    }
  }, [linkToken]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    const isInvoice = data.type === 'invoice';
    const amountToPay = isInvoice ? data.invoice?.amountLocal : parseFloat(amountLocal);

    if (!amountToPay || isNaN(amountToPay) || amountToPay <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsPaying(true);
    setError('');

    try {
      const response = await api.post(`/p/${linkToken}/pay`, {
        customerName,
        phone,
        amountLocal: amountToPay,
        simulate: simulatedMode || data.merchant.country === 'NG' // Default to direct credit transfer for NG, or if user checked simulation
      });

      if (response.data.success) {
        if (data.merchant.country === 'KE' && !simulatedMode) {
          // M-Pesa STK Push initiated successfully
          alert(response.data.message || 'STK Push sent to your phone. Enter your PIN to complete the transfer.');
        } else {
          // Direct token swap completed (or simulated invoice payment)
          setPaymentSuccess(true);
          setSuccessTx(response.data.transaction || response.data.paymentRequest);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Payment initiation failed.');
    } finally {
      setIsPaying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center font-body p-6">
        <div className="bg-[#F2EDE4] border-2 border-[#DDD5C5] p-8 rounded-xl shadow-card w-full max-w-md text-center space-y-4 animate-pulse">
          <div className="h-8 bg-[#FAF7F2] rounded w-1/3 mx-auto"></div>
          <div className="h-16 bg-[#FAF7F2] rounded w-3/4 mx-auto"></div>
          <div className="h-24 bg-[#FAF7F2] rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center font-body p-6">
        <div className="bg-[#F2EDE4] border-2 border-[#B5271E] p-8 rounded-xl shadow-card w-full max-w-md text-center space-y-4">
          <div className="text-4xl text-[#B5271E] flex justify-center">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h2 className="font-display font-bold text-xl text-[#1A1208]">Payment Error</h2>
          <p className="text-sm text-[#7A6B55]">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isInvoice = data.type === 'invoice';
  const currency = data.merchant.country === 'KE' ? 'KES' : 'NGN';
  const merchantName = data.merchant.businessName;

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center font-body p-6">
        <div className="bg-[#F2EDE4] border-2 border-[#5C6B3A] p-8 rounded-xl shadow-card w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-[#5C6B3A] text-white flex items-center justify-center rounded-full text-3xl font-bold mx-auto border-2 border-[#1A1208] shadow-card">
            ✓
          </div>
          <h2 className="font-display font-bold text-2xl text-[#1A1208]">Payment Successful!</h2>
          <p className="text-sm text-[#7A6B55]">
            Your payment to <span className="font-bold text-[#1A1208]">{merchantName}</span> has been processed.
          </p>

          <div className="bg-[#FAF7F2] border border-[#DDD5C5] rounded p-4 text-left space-y-2">
            <div className="flex justify-between text-xs text-[#7A6B55]">
              <span>Amount Paid:</span>
              <span className="font-bold text-[#1A1208] font-mono">
                {currency} {isInvoice ? data.invoice?.amountLocal.toLocaleString() : parseFloat(amountLocal).toLocaleString()}
              </span>
            </div>
            {successTx?.txHash && (
              <div className="flex flex-col text-xs text-[#7A6B55]">
                <span>Celo Tx Hash:</span>
                <span className="font-mono text-[#C4622D] break-all select-all mt-1">
                  {successTx.txHash}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-[#7A6B55]">Funds are now settled on-chain in cUSD.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center font-body p-4 md:p-8">
      <div className="w-full max-w-md bg-[#F2EDE4] border-2 border-[#DDD5C5] rounded-xl shadow-card overflow-hidden">
        {/* Header banner */}
        <div className="bg-[#1A1208] text-[#FAF7F2] p-6 text-center space-y-2">
          <div className="text-[#C4622D] font-display font-bold text-sm tracking-wider uppercase">SokoPay Checkout</div>
          <h1 className="font-display font-bold text-2xl">{merchantName}</h1>
          <div className="flex items-center justify-center gap-2 text-xs text-[#FAF7F2]/80">
            <span>{data.merchant.country === 'KE' ? 'Kenya' : 'Nigeria'}</span>
            {data.merchant.isVerified && (
              <span className="bg-[#5C6B3A] text-white px-2 py-0.5 rounded text-[10px] font-semibold">
                ✓ Verified Merchant
              </span>
            )}
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handlePay} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-[#B5271E] border border-red-200 text-xs p-3 rounded">
              {error}
            </div>
          )}

          {isInvoice ? (
            // INVOICE PRESET DETAILS
            <div className="text-center space-y-2 pb-2">
              <div className="text-xs text-[#7A6B55] uppercase font-semibold">Invoice Amount</div>
              <div className="font-display text-4xl font-extrabold text-[#1A1208]">
                {currency} {data.invoice?.amountLocal.toLocaleString()}
              </div>
              {data.invoice?.description && (
                <p className="text-sm text-[#7A6B55] italic bg-[#FAF7F2] p-3 border border-[#DDD5C5] rounded-md">
                  "{data.invoice.description}"
                </p>
              )}
            </div>
          ) : (
            // DYNAMIC PAYMENT INPUTS
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1A1208] mb-1">YOUR NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1A1208] mb-1">AMOUNT ({currency})</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amountLocal}
                  onChange={(e) => setAmountLocal(e.target.value)}
                  className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 font-display text-lg text-[#1A1208] focus:outline-none focus:border-[#C4622D]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1A1208] mb-1">PAYMENT NOTE (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="What is this payment for?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                />
              </div>
            </div>
          )}

          {/* PAYMENT DETAILS AND INSTRUCTIONS */}
          <div className="bg-[#FAF7F2] border border-[#DDD5C5] rounded-lg p-4 space-y-4">
            <div className="text-xs font-bold text-[#1A1208] uppercase border-b border-[#DDD5C5] pb-2">
              Payment Instructions
            </div>

            {data.merchant.country === 'NG' ? (
              // NIGERIA: PROVIDUS BANK & OPAY DETAILS
              <div className="space-y-3 text-sm">
                <p className="text-xs text-[#7A6B55]">
                  Please transfer the exact NGN amount above using your regular mobile banking app or OPay wallet:
                </p>
                {data.accounts.bank && (
                  <div className="p-3 bg-white border border-[#DDD5C5] rounded space-y-1">
                    <div className="text-xs text-[#7A6B55]">Providus Bank Virtual Account:</div>
                    <div className="font-mono text-lg font-bold text-[#1A1208] select-all tracking-wider">
                      {data.accounts.bank.accountNumber}
                    </div>
                    <div className="text-xs font-semibold text-[#5C6B3A]">
                      Beneficiary: SokoPay / {merchantName}
                    </div>
                  </div>
                )}
                {data.accounts.opay && (
                  <div className="p-3 bg-white border border-[#DDD5C5] rounded space-y-1">
                    <div className="text-xs text-[#7A6B55]">OPay Wallet Number:</div>
                    <div className="font-mono text-base font-bold text-[#1A1208] select-all">
                      {data.accounts.opay.accountNumber}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // KENYA: MPESA TILL DETAILS & STK PUSH FORM
              <div className="space-y-3 text-sm">
                <p className="text-xs text-[#7A6B55]">
                  Pay directly via your M-Pesa mobile money account. Enter your Safaricom phone number to trigger the STK PIN prompt:
                </p>
                {data.accounts.mpesa && (
                  <div className="p-3 bg-white border border-[#DDD5C5] rounded space-y-1 mb-2">
                    <div className="text-xs text-[#7A6B55]">M-Pesa Buy Goods Till:</div>
                    <div className="font-mono text-base font-bold text-[#1A1208]">
                      {data.accounts.mpesa.mpesaTill}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1208] mb-1">
                    SAFARICOM PHONE NUMBER
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 254712345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                    required={!simulatedMode}
                  />
                </div>
              </div>
            )}
          </div>

          {/* DEV TOOL FOR LOCAL TESTING */}
          {import.meta.env.DEV && (
            <div className="border border-dashed border-[#C4622D] bg-[#FAF7F2] p-3 rounded text-xs flex items-center justify-between">
              <span className="font-bold text-[#C4622D] flex items-center gap-1">
                <FlaskConical className="w-3.5 h-3.5" /> Dev Mode Sandbox:
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulatedMode}
                  onChange={(e) => setSimulatedMode(e.target.checked)}
                  className="rounded border-[#DDD5C5]"
                />
                <span>Direct Chain Swap</span>
              </label>
            </div>
          )}

          {/* ACTION BUTTON */}
          <button
            type="submit"
            disabled={isPaying}
            className={`w-full py-3 px-6 font-display font-bold text-[#FAF7F2] rounded-md transition-all border-2 border-[#1A1208] shadow-card ${
              isPaying
                ? 'bg-[#7A6B55] cursor-not-allowed'
                : 'bg-[#C4622D] hover:bg-[#A8501F] hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm'
            }`}
          >
            {isPaying ? 'Processing Payment...' : data.merchant.country === 'KE' && !simulatedMode ? 'Pay via M-Pesa STK Push' : 'Confirm Payment'}
          </button>
        </form>

        {/* Footer info */}
        <div className="bg-[#FAF7F2]/50 border-t border-[#DDD5C5] px-6 py-4 text-center text-xs text-[#7A6B55]">
          Powered by SokoPay. Real-time Celo cUSD mainnet transaction settlements.
        </div>
      </div>
    </div>
  );
}
