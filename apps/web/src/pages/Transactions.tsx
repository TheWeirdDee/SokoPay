import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Banknote, Landmark, Smartphone, ArrowDownLeft, ArrowUpRight, Search, BarChart2, ChevronDown, ArrowLeft, ExternalLink } from 'lucide-react';

interface Transaction {
  id: string;
  type: string;
  direction: string;
  amountLocal: number | null;
  currencyLocal: string | null;
  amountCusd: number | null;
  exchangeRate: number | null;
  muonSignature: string | null;
  muonRequestId: string | null;
  txHash: string | null;
  status: string;
  method: string | null;
  counterpart: string | null;
  notes: string | null;
  createdAt: string;
}

interface Stats {
  totalInflow: number;
  totalOutflow: number;
  totalCash: number;
}

export default function Transactions() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats>({ totalInflow: 0, totalOutflow: 0, totalCash: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('₦');

  // Load first page or reset when filters change
  useEffect(() => {
    async function loadTransactions() {
      setIsLoading(true);
      setError('');
      try {
        // Fetch merchant details first to resolve currency context
        const profileRes = await api.get('/merchant/me');
        const country = profileRes.data.merchant.country;
        setCurrencySymbol(country === 'KE' ? 'KSh' : '₦');

        const params: any = {
          page: 1,
          limit: 10
        };
        if (filterType !== 'all') {
          params.type = filterType;
        }
        if (searchQuery.trim() !== '') {
          params.search = searchQuery;
        }

        const res = await api.get('/transactions', { params });
        setTransactions(res.data.transactions);
        setStats(res.data.stats || { totalInflow: 0, totalOutflow: 0, totalCash: 0 });
        setTotalPages(res.data.pagination.totalPages);
        setPage(1);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to load transaction history.');
      } finally {
        setIsLoading(false);
      }
    }

    loadTransactions();
  }, [filterType, searchQuery]);

  // Load more pages
  const handleLoadMore = async () => {
    if (page >= totalPages || isMoreLoading) return;
    setIsMoreLoading(true);
    try {
      const params: any = {
        page: page + 1,
        limit: 10
      };
      if (filterType !== 'all') {
        params.type = filterType;
      }
      if (searchQuery.trim() !== '') {
        params.search = searchQuery;
      }

      const res = await api.get('/transactions', { params });
      setTransactions((prev) => [...prev, ...res.data.transactions]);
      setPage(page + 1);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load additional transactions.');
    } finally {
      setIsMoreLoading(false);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return '0';
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const renderMethodIcon = (method: string | null, type: string) => {
    if (method === 'cash') return <Banknote className="w-5 h-5 text-[#5C6B3A]" />;
    if (method === 'opay') return <Smartphone className="w-5 h-5 text-red-500" />;
    if (method === 'mpesa') return <Smartphone className="w-5 h-5 text-green-500" />;
    if (method === 'bank') return <Landmark className="w-5 h-5 text-blue-500" />;
    return type === 'incoming' || type === 'cash' ? (
      <ArrowDownLeft className="w-5 h-5 text-[#C4622D]" />
    ) : (
      <ArrowUpRight className="w-5 h-5 text-[#5C6B3A]" />
    );
  };

  const getFilterTypeLabel = (type: string) => {
    switch (type) {
      case 'all': return 'All';
      case 'incoming': return 'Inflow';
      case 'outgoing': return 'Outflow';
      case 'cash': return 'Cash';
      case 'withdrawal': return 'Withdrawals';
      default: return type;
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedTxId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-6 md:p-8 pb-24 font-body text-[#1A1208] relative">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 max-w-[900px] mx-auto w-full">
        <button 
          onClick={() => navigate('/dashboard')} 
          className="px-4 py-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md font-bold hover:bg-border transition-colors shadow-[2px_2px_0px_#1A1208] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_#1A1208] flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <h1 className="font-display text-xl md:text-2xl font-black uppercase tracking-wide">Transaction History</h1>
      </div>

      {error && (
        <div className="bg-[#B5271E]/10 border-2 border-[#B5271E] text-[#B5271E] p-4 rounded-lg mb-6 max-w-[900px] mx-auto font-semibold text-center">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-[900px] mx-auto w-full">
        {/* Total Inflows */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-4 rounded-xl shadow-[4px_4px_0px_#1A1208] flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider">Total Inflows (All)</span>
          <span className="text-xl font-mono font-black text-[#C4622D] mt-1.5">
            {currencySymbol}{formatCurrency(stats.totalInflow)}
          </span>
        </div>
        {/* Total Outflows */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-4 rounded-xl shadow-[4px_4px_0px_#1A1208] flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider">Total Outflows (All)</span>
          <span className="text-xl font-mono font-black text-[#5C6B3A] mt-1.5">
            {currencySymbol}{formatCurrency(stats.totalOutflow)}
          </span>
        </div>
        {/* Total Recorded Cash */}
        <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-4 rounded-xl shadow-[4px_4px_0px_#1A1208] flex flex-col justify-between">
          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider">Total Cash Sales</span>
          <span className="text-xl font-mono font-black text-[#1A1208] mt-1.5">
            {currencySymbol}{formatCurrency(stats.totalCash)}
          </span>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-[#F2EDE4] border-2 border-[#1A1208] p-4 rounded-xl shadow-[4px_4px_0px_#1A1208] max-w-[900px] mx-auto w-full mb-6 space-y-4">
        {/* Search */}
        <div className="relative flex items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes or customers..."
            className="w-full px-4 py-3 pl-10 bg-[#FAF7F2] border-2 border-[#1A1208] rounded-md font-bold focus:outline-none focus:border-[#C4622D]"
          />
          <Search className="absolute left-3.5 w-4 h-4 text-[#7A6B55]" />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          {['all', 'incoming', 'outgoing', 'cash', 'withdrawal'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 border-2 border-[#1A1208] rounded-md text-xs font-black uppercase tracking-wider transition-colors shadow-[2px_2px_0px_#1A1208] active:translate-x-[1px] active:translate-y-[1px] ${
                filterType === type 
                  ? 'bg-[#C4622D] text-[#FAF7F2]' 
                  : 'bg-[#FAF7F2] text-[#1A1208] hover:bg-[#F2EDE4]'
              }`}
            >
              {getFilterTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="max-w-[900px] mx-auto w-full space-y-3">
        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-[#F2EDE4] rounded-lg border-2 border-[#DDD5C5]"></div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-[#F2EDE4] border-2 border-[#1A1208] border-dashed p-12 rounded-xl text-center text-[#7A6B55]">
            <BarChart2 className="w-10 h-10 text-[#7A6B55] mx-auto mb-3" />
            <p className="font-bold text-lg text-[#1A1208]">No transactions matched filters</p>
            <p className="text-xs mt-1">Try recording a cash transaction or clearing the search query.</p>
          </div>
        ) : (
          transactions.map((tx) => {
            const isIncoming = tx.direction === 'in';
            const isCash = tx.type === 'cash';
            const isExpanded = expandedTxId === tx.id;

            return (
              <div 
                key={tx.id}
                className={`bg-[#F2EDE4] border-2 border-[#1A1208] rounded-xl overflow-hidden transition-all shadow-[3px_3px_0px_#1A1208] hover:shadow-[5px_5px_0px_#1A1208] hover:-translate-x-[1px] hover:-translate-y-[1px] ${
                  isIncoming ? 'border-l-8 border-l-[#C4622D]' : 'border-l-8 border-l-[#5C6B3A]'
                }`}
              >
                {/* Row Header */}
                <div 
                  onClick={() => toggleExpand(tx.id)}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-[#1A1208] bg-[#FAF7F2] flex items-center justify-center shadow-[1.5px_1.5px_0px_#1A1208]">
                      {renderMethodIcon(tx.method, tx.type)}
                    </div>
                    <div>
                      <p className="font-display font-black text-base">
                        {isIncoming ? '+' : '-'}{currencySymbol}{formatCurrency(tx.amountLocal)}
                      </p>
                      <p className="text-xs text-[#7A6B55] font-semibold mt-0.5">
                        {tx.counterpart || 'Unknown counterpart'} • {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-[#1A1208] shadow-[1px_1px_0px_#1A1208] ${
                      isCash 
                        ? 'bg-[#5C6B3A]/20 text-[#5C6B3A]'
                        : isIncoming 
                        ? 'bg-[#C4622D]/20 text-[#C4622D]' 
                        : 'bg-[#5C6B3A]/20 text-[#5C6B3A]'
                    }`}>
                      {tx.type}
                    </span>
                    <ChevronDown className="w-4 h-4 text-[#1A1208] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }} />
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t-2 border-[#1A1208] bg-[#FAF7F2] p-4 space-y-4 text-xs font-semibold">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Left Block */}
                      <div className="space-y-2.5">
                        <div>
                          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Transaction ID</span>
                          <span className="font-mono font-bold select-all break-all">{tx.id}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">On-chain Settlement</span>
                          <span className="font-mono text-sm font-black text-[#C4622D]">
                            {tx.amountCusd ? `${tx.amountCusd.toFixed(4)} cUSD` : 'N/A (Cash/Offline)'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Live FX Rate</span>
                          <span>
                            {tx.exchangeRate ? `1 cUSD = ${tx.exchangeRate.toFixed(2)} ${tx.currencyLocal}` : 'N/A'}
                          </span>
                        </div>
                      </div>

                      {/* Right Block */}
                      <div className="space-y-2.5">
                        <div>
                          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Payment Method</span>
                          <span className="uppercase">{tx.method || 'Standard'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Status</span>
                          <span className="uppercase text-[#5C6B3A]">{tx.status}</span>
                        </div>
                        {tx.notes && (
                          <div>
                            <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Notes</span>
                            <p className="italic text-text-muted">{tx.notes}</p>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Cryptographic Web3 Proof (Muon / Celo Link) */}
                    {(tx.txHash || tx.muonSignature) && (
                      <div className="pt-3 border-t border-[#DDD5C5] space-y-2">
                        <span className="text-[10px] font-black text-[#7A6B55] uppercase tracking-wider block">Web3 Verification Proof</span>
                        <div className="flex flex-col sm:flex-row gap-3">
                          {tx.txHash && (
                            <a 
                              href={`https://celoscan.io/tx/${tx.txHash}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-1.5 px-3 py-2 border border-[#1A1208] bg-[#F2EDE4] rounded hover:bg-border transition-colors font-mono font-bold shadow-[1px_1px_0px_#1A1208]"
                            >
                              Explorer: {tx.txHash.substring(0, 10)}...{tx.txHash.substring(tx.txHash.length - 8)} <ExternalLink className="w-3.5 h-3.5 ml-1" />
                            </a>
                          )}
                          {tx.muonSignature && (
                            <div className="flex flex-col gap-1 p-2 border-2 border-dashed border-[#DDD5C5] bg-[#F2EDE4]/30 rounded w-full">
                              <span className="text-[8px] font-black text-[#7A6B55] uppercase tracking-widest">TSS Oracle Proof (CoinGecko / Simulated Muon)</span>
                              <div className="font-mono text-[9px] break-all select-all font-semibold leading-relaxed">
                                <strong>Request ID:</strong> {tx.muonRequestId}<br />
                                <strong>Signature:</strong> {tx.muonSignature}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination "Load More" */}
      {!isLoading && page < totalPages && (
        <div className="text-center mt-8 max-w-[900px] mx-auto w-full">
          <button
            onClick={handleLoadMore}
            disabled={isMoreLoading}
            className="px-6 py-3 border-2 border-[#1A1208] bg-[#F2EDE4] text-[#1A1208] font-display font-black rounded-md shadow-[4px_4px_0px_#1A1208] hover:shadow-[5px_5px_0px_#1A1208] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0px_#1A1208] transition-all uppercase tracking-wider text-xs disabled:opacity-50"
          >
            {isMoreLoading ? 'Loading more...' : 'Load More Transactions'}
          </button>
        </div>
      )}

    </div>
  );
}
