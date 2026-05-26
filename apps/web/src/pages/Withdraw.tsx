import { useNavigate } from 'react-router-dom';

export default function Withdraw() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg p-6 max-w-[430px] mx-auto border-x border-border shadow-2xl relative pb-24 font-body">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/dashboard')} className="p-2 border-2 border-border bg-bg-card rounded-md shadow-card hover:bg-border transition-colors">
          ← Back
        </button>
        <h1 className="font-display text-2xl font-bold">Withdraw</h1>
      </div>
      <div className="bg-bg-card border-2 border-border p-6 rounded-xl shadow-card text-center text-text-muted space-y-4">
        <div className="text-4xl">🏧</div>
        <p className="font-semibold text-text">Withdraw Funds</p>
        <p className="text-xs">Offramp your cUSD to your local bank account or mobile wallet. Coming soon.</p>
      </div>
    </div>
  );
}
