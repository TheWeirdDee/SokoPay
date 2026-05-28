import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCache } from '../context/CacheContext';
import { api } from '../lib/api';
import { 
  TrendingUp, 
  ArrowLeft, 
  Sparkles, 
  Lock, 
  PieChart, 
  Flame, 
  ChevronRight, 
  LineChart as LineChartIcon,
  HelpCircle
} from 'lucide-react';

export default function Analytics() {
  const navigate = useNavigate();
  const { transactions, fetchTransactions, profile } = useCache();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const getChartData = () => {
    const dailyMap: { [dateStr: string]: number } = {};
    // Pre-populate last 7 days with 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyMap[dateStr] = 0;
    }

    // Accumulate confirmed incoming transactions
    if (transactions && transactions.length > 0) {
      transactions.forEach(tx => {
        if (tx.direction === 'in' && tx.status === 'confirmed') {
          const dateStr = new Date(tx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (dailyMap[dateStr] !== undefined) {
            dailyMap[dateStr] += Number(tx.amountCusd);
          }
        }
      });
    }

    return Object.entries(dailyMap).map(([date, amount]) => ({ date, amount }));
  };

  const chartData = getChartData();
  const maxAmount = Math.max(...chartData.map(d => d.amount), 10);

  // SVG Chart Helper Coordinates
  const width = 600;
  const height = 240;
  const paddingX = 40;
  const paddingY = 30;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const points = chartData.map((d, i) => {
    const x = paddingX + (i / (chartData.length - 1)) * chartWidth;
    const y = height - paddingY - (d.amount / maxAmount) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const totalVolume = chartData.reduce((acc, curr) => acc + curr.amount, 0);
  const currencySymbol = profile?.country === 'KE' ? 'KSh' : '₦';
  const localRate = profile?.country === 'KE' ? 150 : 1600; // estimated fallback

  return (
    <div className="min-h-screen bg-[#FAF7F2] p-4 pb-24 font-body text-[#1A1208]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 border-2 border-[#1A1208] bg-[#F2EDE4] rounded-md shadow-card hover:bg-border transition-colors active:translate-x-[1px] active:translate-y-[1px]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display text-2xl font-bold">Sales Analytics</h1>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#FAF7F2] border-2 border-[#1A1208] p-4 rounded-xl shadow-card">
          <span className="text-[10px] uppercase font-bold text-[#7A6B55] tracking-wider block">7-Day Sales Volume</span>
          <div className="font-display text-2xl font-black mt-1 text-[#1A1208]">
            {totalVolume.toFixed(2)} <span className="text-xs">cUSD</span>
          </div>
          <span className="text-[10px] text-[#7A6B55] font-mono mt-0.5 block">
            ≈ {currencySymbol}{(totalVolume * localRate).toLocaleString('en-US', { maximumFractionDigits: 0 })} Value
          </span>
        </div>

        <div className="bg-[#FAF7F2] border-2 border-[#1A1208] p-4 rounded-xl shadow-card">
          <span className="text-[10px] uppercase font-bold text-[#7A6B55] tracking-wider block">Daily Average</span>
          <div className="font-display text-2xl font-black mt-1 text-[#5C6B3A]">
            {(totalVolume / 7).toFixed(2)} <span className="text-xs">cUSD</span>
          </div>
          <span className="text-[10px] text-[#7A6B55] font-mono mt-0.5 block">
            Updated in real-time
          </span>
        </div>
      </div>

      {/* SVG Line Chart Card */}
      <div className="bg-[#FAF7F2] border-2 border-[#1A1208] rounded-xl p-5 shadow-card mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-display font-black text-sm uppercase tracking-wider flex items-center gap-1.5">
            <LineChartIcon className="w-4 h-4 text-[#C4622D]" /> 7-Day Performance Curve
          </h2>
          <span className="text-[9px] text-[#7A6B55] font-mono bg-[#DDD5C5]/30 px-2 py-0.5 rounded border border-[#DDD5C5]">
            cUSD Volume
          </span>
        </div>

        {/* The SVG element */}
        <div className="relative w-full overflow-x-auto scrollbar-none">
          <div className="min-w-[600px] h-[250px] mx-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
              {/* Grid Lines */}
              <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#DDD5C5" strokeWidth={1} strokeDasharray="4 4" />
              <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#1A1208" strokeWidth={1.5} />
              
              {/* Chart Line Path */}
              {pathD && (
                <path 
                  d={pathD} 
                  fill="none" 
                  stroke="#C4622D" 
                  strokeWidth={3} 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                />
              )}

              {/* Data points (circles & labels) */}
              {points.map((p, idx) => (
                <g key={idx}>
                  {/* Hover guideline */}
                  <line x1={p.x} y1={paddingY} x2={p.x} y2={height - paddingY} stroke="#DDD5C5" strokeWidth={1} strokeDasharray="2 2" />
                  
                  {/* Point circles */}
                  <circle 
                    cx={p.x} 
                    cy={p.y} 
                    r={5} 
                    fill="#FAF7F2" 
                    stroke="#C4622D" 
                    strokeWidth={2.5} 
                  />

                  {/* Top value labels */}
                  <text 
                    x={p.x} 
                    y={p.y - 10} 
                    textAnchor="middle" 
                    className="text-[9px] font-mono font-bold fill-[#1A1208]"
                  >
                    {p.amount > 0 ? `${p.amount.toFixed(1)}` : ''}
                  </text>

                  {/* Bottom date labels */}
                  <text 
                    x={p.x} 
                    y={height - paddingY + 18} 
                    textAnchor="middle" 
                    className="text-[9px] font-bold fill-[#7A6B55]"
                  >
                    {p.date}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </div>

      {/* LOCKED PREMIUM SECTIONS */}
      <div className="space-y-4">
        <h2 className="font-display font-black text-sm uppercase tracking-wider text-[#7A6B55]">Advanced Predictions</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Customer Heatmap */}
          <div className="bg-[#F2EDE4] p-5 rounded-xl border-2 border-[#1A1208] shadow-card relative overflow-hidden group">
            {/* Lock Overlay */}
            <div className="absolute inset-0 bg-[#1A1208]/5 backdrop-blur-[1px] flex flex-col justify-center items-center gap-2">
              <div className="p-2 border-2 border-[#1A1208] bg-[#FAF7F2] rounded-full shadow-card">
                <Lock className="w-5 h-5 text-[#C4622D]" />
              </div>
              <span className="text-[10px] font-black uppercase text-[#1A1208] tracking-wider bg-[#FAF7F2] border border-[#1A1208]/10 px-2.5 py-0.5 rounded-full">
                Unlock with Pro
              </span>
            </div>

            <div className="space-y-2 opacity-40">
              <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-600" /> Customer Frequency Heatmap
              </span>
              <p className="text-xs text-[#7A6B55] leading-relaxed">
                Deconstruct repeat shopping patterns, tracking which customer cohorts buy the most stock and what times they visit your stall.
              </p>
            </div>
          </div>

          {/* AI Margins predictions */}
          <div className="bg-[#F2EDE4] p-5 rounded-xl border-2 border-[#1A1208] shadow-card relative overflow-hidden group">
            {/* Lock Overlay */}
            <div className="absolute inset-0 bg-[#1A1208]/5 backdrop-blur-[1px] flex flex-col justify-center items-center gap-2">
              <div className="p-2 border-2 border-[#1A1208] bg-[#FAF7F2] rounded-full shadow-card">
                <Lock className="w-5 h-5 text-[#C4622D]" />
              </div>
              <span className="text-[10px] font-black uppercase text-[#1A1208] tracking-wider bg-[#FAF7F2] border border-[#1A1208]/10 px-2.5 py-0.5 rounded-full">
                Unlock with Pro
              </span>
            </div>

            <div className="space-y-2 opacity-40">
              <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" /> Gemini Predictive Margin Audit
              </span>
              <p className="text-xs text-[#7A6B55] leading-relaxed">
                Gemini 2.0 scans transaction sequences to forecast revenue velocity and alert you on low margin goods before you buy wholesale.
              </p>
            </div>
          </div>

          {/* Weekly Cashflow forecasts */}
          <div className="bg-[#F2EDE4] p-5 rounded-xl border-2 border-[#1A1208] shadow-card relative overflow-hidden group md:col-span-2">
            {/* Lock Overlay */}
            <div className="absolute inset-0 bg-[#1A1208]/5 backdrop-blur-[1px] flex flex-col justify-center items-center gap-2">
              <div className="p-2 border-2 border-[#1A1208] bg-[#FAF7F2] rounded-full shadow-card">
                <Lock className="w-5 h-5 text-[#C4622D]" />
              </div>
              <span className="text-[10px] font-black uppercase text-[#1A1208] tracking-wider bg-[#FAF7F2] border border-[#1A1208]/10 px-2.5 py-0.5 rounded-full">
                Unlock with Pro
              </span>
            </div>

            <div className="space-y-2 opacity-40">
              <span className="text-xs font-bold text-[#1A1208] flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-blue-600" /> Advanced Cashflow Margin Forecasts
              </span>
              <p className="text-xs text-[#7A6B55] leading-relaxed">
                Unlock visual models predicting next month's margins and capital reserves, accounting for inflation indices and wholesale pricing updates on Celo networks.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
