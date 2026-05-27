import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { AlertTriangle, Smartphone, Link } from 'lucide-react';

interface QRData {
  success: boolean;
  merchant: {
    businessName: string;
    country: string;
    isVerified: boolean;
  };
  paymentLink: string;
  qrCodeUrl: string;
  accountDetails: {
    bank: { bankName: string; accountNumber: string } | null;
    opay: { accountNumber: string } | null;
    mpesa: { mpesaTill: string } | null;
  };
}

interface InvoiceData {
  id: string;
  customerName: string | null;
  amountLocal: number;
  currencyLocal: string;
  description: string | null;
  linkToken: string;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
}

export default function QR() {
  const navigate = useNavigate();
  const [qrDetails, setQrDetails] = useState<QRData | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'qr' | 'invoices'>('qr');

  // Invoice creation form state
  const [customerName, setCustomerName] = useState('');
  const [amountLocal, setAmountLocal] = useState('');
  const [description, setDescription] = useState('');
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  // Copy status
  const [copiedText, setCopiedText] = useState('');

  async function fetchQRData() {
    try {
      const response = await api.get('/merchant/qr');
      setQrDetails(response.data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load QR details.');
    }
  }

  async function fetchInvoices() {
    try {
      const response = await api.get('/payments/requests');
      setInvoices(response.data.paymentRequests);
    } catch (err: any) {
      console.error(err);
    }
  }

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      await Promise.all([fetchQRData(), fetchInvoices()]);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const triggerCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountLocal || isNaN(parseFloat(amountLocal))) {
      alert('Please enter a valid amount');
      return;
    }

    setIsCreatingInvoice(true);
    try {
      const response = await api.post('/payments/request', {
        customerName,
        amountLocal: parseFloat(amountLocal),
        description
      });

      if (response.data.success) {
        // Reset form
        setCustomerName('');
        setAmountLocal('');
        setDescription('');
        // Reload invoices list
        await fetchInvoices();
        alert('Payment link created successfully!');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to create payment link.');
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 font-body">
        <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
          <div className="h-10 bg-[#F2EDE4] rounded-md w-1/4"></div>
          <div className="h-64 bg-[#F2EDE4] rounded-xl border border-[#DDD5C5]"></div>
        </div>
      </div>
    );
  }

  if (error && !qrDetails) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 font-body flex items-center justify-center">
        <div className="bg-[#F2EDE4] border-2 border-[#B5271E] p-8 rounded-xl shadow-card text-center max-w-md space-y-4">
          <div className="text-3xl flex justify-center text-[#B5271E]">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="font-display font-bold text-lg">Error Loading QR Details</h2>
          <p className="text-sm text-[#7A6B55]">{error}</p>
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 bg-[#C4622D] text-white rounded font-bold border-2 border-[#1A1208] shadow-card">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!qrDetails) return null;

  const country = qrDetails.merchant.country;
  const currency = country === 'KE' ? 'KES' : 'NGN';

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 md:p-8 relative pb-24 font-body">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')} 
            className="px-4 py-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-[#FAF7F2] transition-all font-semibold text-sm"
          >
            ← Dashboard
          </button>
          <h1 className="font-display text-2xl font-bold text-[#1A1208]">Accept Payment</h1>
        </div>

        {/* Floating Toast Notification */}
        {copiedText && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-[#1A1208] text-[#FAF7F2] px-4 py-2 rounded-md shadow-card border border-[#C4622D] text-xs font-semibold z-50 animate-bounce">
            Copied {copiedText} to clipboard!
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-[#DDD5C5]">
          <button
            onClick={() => setActiveTab('qr')}
            className={`px-6 py-3 font-display font-bold text-sm border-t-2 border-x-2 transition-all ${
              activeTab === 'qr'
                ? 'bg-[#F2EDE4] border-[#1A1208] text-[#C4622D] translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#7A6B55] hover:text-[#1A1208]'
            }`}
          >
            <Smartphone className="w-4 h-4 inline-block mr-1.5 align-text-bottom" /> Store QR Code
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`px-6 py-3 font-display font-bold text-sm border-t-2 border-x-2 transition-all ${
              activeTab === 'invoices'
                ? 'bg-[#F2EDE4] border-[#1A1208] text-[#C4622D] translate-y-[1px]'
                : 'bg-transparent border-transparent text-[#7A6B55] hover:text-[#1A1208]'
            }`}
          >
            <Link className="w-4 h-4 inline-block mr-1.5 align-text-bottom" /> Custom Payment Links
          </button>
        </div>

        {/* TAB 1: STORE QR & ACCOUNTS */}
        {activeTab === 'qr' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left side: QR Display */}
            <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card text-center flex flex-col items-center justify-between space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg text-[#1A1208]">{qrDetails.merchant.businessName}</h3>
                <p className="text-xs text-[#7A6B55]">Scan QR to pay online instantly</p>
              </div>

              {/* QR Image Frame */}
              <div className="bg-white border-2 border-[#1A1208] p-4 rounded-lg shadow-card">
                <img 
                  src={qrDetails.qrCodeUrl} 
                  alt="Store Payment QR"
                  className="w-48 h-48"
                />
              </div>

              {/* Copy Links Actions */}
              <div className="w-full space-y-2">
                <div className="font-mono text-xs text-[#7A6B55] break-all bg-white/50 p-2 border border-[#DDD5C5] rounded select-all">
                  {qrDetails.paymentLink}
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => triggerCopy(qrDetails.paymentLink, 'Payment Link')}
                    className="flex-1 py-2 bg-[#C4622D] text-white font-bold text-xs rounded border-2 border-[#1A1208] shadow-card hover:bg-[#A8501F] transition-all"
                  >
                    Copy Link
                  </button>
                  <a
                    href={qrDetails.qrCodeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 bg-white text-[#1A1208] font-bold text-xs rounded border-2 border-[#1A1208] shadow-card hover:bg-[#FAF7F2] text-center block"
                  >
                    Download QR
                  </a>
                </div>
              </div>
            </div>

            {/* Right side: Account Details Cards */}
            <div className="space-y-6">
              <h3 className="font-display font-bold text-lg text-[#1A1208]">Receiving Details</h3>

              {country === 'NG' ? (
                // NIGERIA BANK & OPAY WALLET DETAILS
                <div className="space-y-4">
                  {qrDetails.accountDetails.bank && (
                    <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-5 rounded-xl shadow-card space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#C4622D] text-[#FAF7F2] text-[10px] font-bold px-3 py-1 uppercase rounded-bl border-l border-b border-[#1A1208]">
                        Bank Account
                      </div>
                      <div className="text-xs text-[#7A6B55]">BANK NAME</div>
                      <div className="font-display font-semibold text-[#1A1208]">{qrDetails.accountDetails.bank.bankName}</div>
                      
                      <div className="text-xs text-[#7A6B55]">ACCOUNT NUMBER</div>
                      <div className="font-mono text-xl font-bold tracking-wider text-[#1A1208] flex items-center justify-between">
                        <span>{qrDetails.accountDetails.bank.accountNumber}</span>
                        <button 
                          onClick={() => triggerCopy(qrDetails.accountDetails.bank?.accountNumber || '', 'Bank Account')}
                          className="px-2 py-1 bg-white border border-[#1A1208] rounded text-xs font-body font-normal hover:bg-[#FAF7F2]"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-[10px] text-[#7A6B55] italic">
                        * Transfers to this virtual account arrive in cUSD within seconds.
                      </p>
                    </div>
                  )}

                  {qrDetails.accountDetails.opay && (
                    <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-5 rounded-xl shadow-card space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#5C6B3A] text-white text-[10px] font-bold px-3 py-1 uppercase rounded-bl border-l border-b border-[#1A1208]">
                        OPay Wallet
                      </div>
                      <div className="text-xs text-[#7A6B55]">OPAY ACCOUNT NUMBER</div>
                      <div className="font-mono text-xl font-bold tracking-wider text-[#1A1208] flex items-center justify-between">
                        <span>{qrDetails.accountDetails.opay.accountNumber}</span>
                        <button 
                          onClick={() => triggerCopy(qrDetails.accountDetails.opay?.accountNumber || '', 'OPay Account')}
                          className="px-2 py-1 bg-white border border-[#1A1208] rounded text-xs font-body font-normal hover:bg-[#FAF7F2]"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // KENYA MPESA DETAILS
                <div className="space-y-4">
                  {qrDetails.accountDetails.mpesa && (
                    <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-5 rounded-xl shadow-card space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-[#5C6B3A] text-white text-[10px] font-bold px-3 py-1 uppercase rounded-bl border-l border-b border-[#1A1208]">
                        M-Pesa
                      </div>
                      <div className="text-xs text-[#7A6B55]">BUY GOODS TILL NUMBER</div>
                      <div className="font-mono text-2xl font-bold tracking-wider text-[#1A1208] flex items-center justify-between">
                        <span>{qrDetails.accountDetails.mpesa.mpesaTill}</span>
                        <button 
                          onClick={() => triggerCopy(qrDetails.accountDetails.mpesa?.mpesaTill || '', 'M-Pesa Till')}
                          className="px-2 py-1 bg-white border border-[#1A1208] rounded text-xs font-body font-normal hover:bg-[#FAF7F2]"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: CUSTOM INVOICES / PAYMENT LINKS */}
        {activeTab === 'invoices' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: Generate Invoice Form */}
            <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-6 rounded-xl shadow-card space-y-4 h-fit">
              <h3 className="font-display font-bold text-lg text-[#1A1208]">Create Payment Link</h3>
              
              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#1A1208] mb-1">CUSTOMER NAME (OPTIONAL)</label>
                  <input
                    type="text"
                    placeholder="e.g. John K. Lagos"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A1208] mb-1">AMOUNT ({currency})</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={amountLocal}
                    onChange={(e) => setAmountLocal(e.target.value)}
                    className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#1A1208] mb-1">DESCRIPTION / SERVICE</label>
                  <input
                    type="text"
                    placeholder="e.g. 5 Crates of Eggs"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-white border border-[#DDD5C5] rounded px-4 py-2 text-[#1A1208] text-sm focus:outline-none focus:border-[#C4622D]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingInvoice}
                  className="w-full py-2 bg-[#C4622D] text-white font-display font-bold rounded border-2 border-[#1A1208] shadow-card hover:bg-[#A8501F] transition-all disabled:bg-[#7A6B55]"
                >
                  {isCreatingInvoice ? 'Generating Link...' : 'Generate Payment Link'}
                </button>
              </form>
            </div>

            {/* Right Column: Invoice History List */}
            <div className="space-y-4">
              <h3 className="font-display font-bold text-lg text-[#1A1208]">Payment Links Generated</h3>
              
              {invoices.length === 0 ? (
                <div className="bg-[#F2EDE4] border border-dashed border-[#DDD5C5] p-8 rounded-xl text-center text-xs text-[#7A6B55]">
                  No custom payment links generated yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {invoices.map((invoice) => {
                    const invoiceLink = `${window.location.origin}/p/${invoice.linkToken}`;
                    return (
                      <div key={invoice.id} className="bg-[#F2EDE4] border-2 border-[#1A1208] p-4 rounded-xl shadow-card space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-display font-bold text-[#1A1208]">
                              {invoice.currencyLocal} {invoice.amountLocal.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-[#7A6B55]">
                              {invoice.customerName ? `For ${invoice.customerName}` : 'No customer name'}
                            </div>
                          </div>
                          
                          {/* Status Badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            invoice.status === 'paid'
                              ? 'bg-[#5C6B3A] text-white'
                              : 'bg-[#C4622D] text-white'
                          }`}>
                            {invoice.status}
                          </span>
                        </div>

                        {invoice.description && (
                          <div className="text-xs text-[#7A6B55] italic">
                            "{invoice.description}"
                          </div>
                        )}

                        <div className="flex gap-2 pt-2 border-t border-[#DDD5C5]/50">
                          <button
                            onClick={() => triggerCopy(invoiceLink, 'Invoice Link')}
                            className="flex-1 py-1.5 bg-white text-[#1A1208] font-bold text-[11px] rounded border border-[#1A1208] hover:bg-[#FAF7F2]"
                          >
                            Copy Link
                          </button>
                          <a
                            href={invoiceLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 py-1.5 bg-transparent text-[#C4622D] font-bold text-[11px] hover:underline text-center block self-center"
                          >
                            Open Link ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
