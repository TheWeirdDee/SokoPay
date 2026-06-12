import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ArrowLeft, BarChart3, TrendingUp, Receipt, Crown, Clock, Loader2 } from 'lucide-react';

interface PeriodStats {
  count: number;
  totalLocal: number;
  totalCusd: number;
  biggestLocal: number;
  biggestCusd: number;
  busiestDay: number | null;
  busiestHour: number | null;
}
interface SummaryData {
  currency: string;
  periods: { daily: PeriodStats; weekly: PeriodStats; monthly: PeriodStats };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TABS: { key: 'daily' | 'weekly' | 'monthly'; label: string; window: string }[] = [
  { key: 'daily', label: 'Daily', window: 'today' },
  { key: 'weekly', label: 'Weekly', window: 'this week' },
  { key: 'monthly', label: 'Monthly', window: 'this month' }
];

const fmtHour = (h: number) => { const s = h >= 12 ? 'pm' : 'am'; const d = h % 12 === 0 ? 12 : h % 12; return `${d}${s}`; };
const partOfDay = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');

export default function Summary() {
  const navigate = useNavigate();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  useEffect(() => {
    api.get('/merchant/summary')
      .then(res => { if (res.data.success) setData(res.data); else setError('Could not load summary.'); })
      .catch(() => setError('Could not load summary. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const sym = data?.currency === 'KES' ? 'KSh' : '₦';
  const money = (n: number) => `${sym}${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const meta = TABS.find(t => t.key === tab)!;
  const p = data?.periods[tab];

  const insight = (() => {
    if (!p || p.count === 0) return null;
    if (tab === 'daily') return p.busiestHour != null ? `Most of your sales came in the ${partOfDay(p.busiestHour)}.` : null;
    if (p.busiestDay == null) return null;
    return `Your busiest day was ${DAYS[p.busiestDay]}${p.busiestHour != null ? `, mostly ${partOfDay(p.busiestHour)} sales` : ''}.`;
  })();

  return (
    <div className="min-h-screen bg-[#FAF7F2] font-body text-[#1A1208]">
      <header className="sticky top-0 z-20 bg-[#FAF7F2] border-b border-[#DDD5C5] h-16 flex items-center px-4 md:px-6 gap-3">
        <button onClick={() => navigate('/chat')} className="p-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-[2px_2px_0px_#1A1208] hover:bg-border transition-all">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#C4622D]" />
          <h1 className="font-display font-black text-sm uppercase tracking-wider">Earnings Summary</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        {/* Period tabs */}
        <div className="flex gap-2">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-md border-2 border-[#1A1208] font-display font-black text-xs uppercase tracking-wider transition-all ${
                tab === t.key ? 'bg-[#1A1208] text-[#FAF7F2] shadow-[2px_2px_0px_#C4622D]' : 'bg-[#F2EDE4] text-[#1A1208] hover:bg-[#DDD5C5]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-[#C4622D]" /></div>
        ) : error ? (
          <div className="bg-[#B5271E]/10 border-2 border-[#B5271E] text-[#B5271E] p-4 rounded-lg font-semibold text-sm">{error}</div>
        ) : !p || p.count === 0 ? (
          // Empty state — real, not faked
          <div className="bg-[#F2EDE4] border-2 border-dashed border-[#DDD5C5] rounded-xl p-10 text-center">
            <Receipt className="w-10 h-10 mx-auto text-[#7A6B55]/50 mb-3" />
            <p className="font-display font-bold text-[#1A1208]">No earnings recorded {meta.window} yet</p>
            <p className="text-xs text-[#7A6B55] mt-1.5">Payments you receive {meta.window} will show up here automatically.</p>
          </div>
        ) : (
          <>
            {/* Headline total */}
            <section className="bg-[#1A1208] text-[#FAF7F2] rounded-xl p-6 border-2 border-[#1A1208] shadow-card">
              <p className="text-[10px] font-bold text-[#7A6B55] uppercase tracking-wider mb-1">Total earned {meta.window}</p>
              <div className="font-display font-extrabold text-4xl leading-none">{money(p.totalLocal)}</div>
              <p className="text-[#7A6B55] font-mono text-xs mt-2">{p.totalCusd.toFixed(4)} cUSD</p>
              {insight && (
                <div className="mt-4 pt-3 border-t border-white/10 flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-[#C4622D] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#FAF7F2]/90 font-medium">{insight}</p>
                </div>
              )}
            </section>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<Receipt className="w-4 h-4" />} label="Transactions" value={String(p.count)} />
              <StatCard icon={<Crown className="w-4 h-4" />} label="Biggest payment" value={money(p.biggestLocal)} sub={`${p.biggestCusd.toFixed(4)} cUSD`} />
              {tab !== 'daily' && p.busiestDay != null && (
                <StatCard icon={<BarChart3 className="w-4 h-4" />} label="Busiest day" value={DAYS[p.busiestDay]} />
              )}
              {p.busiestHour != null && (
                <StatCard icon={<Clock className="w-4 h-4" />} label="Busiest hour" value={`${fmtHour(p.busiestHour)}–${fmtHour((p.busiestHour + 1) % 24)}`} />
              )}
            </div>

            <p className="text-[10px] text-[#7A6B55]/70 text-center font-mono">Figures read directly from your transactions · always live, never AI-generated</p>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#F2EDE4] border-2 border-[#1A1208] rounded-lg p-4 shadow-card">
      <div className="flex items-center gap-1.5 text-[#7A6B55] mb-2">
        <span className="text-[#C4622D]">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="font-display font-extrabold text-xl text-[#1A1208] leading-none">{value}</div>
      {sub && <p className="text-[10px] text-[#7A6B55] font-mono mt-1">{sub}</p>}
    </div>
  );
}
