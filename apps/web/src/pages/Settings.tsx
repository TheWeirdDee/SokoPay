import { useNavigate } from 'react-router-dom';

export default function Settings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-bg p-6 max-w-[430px] mx-auto border-x border-border shadow-2xl relative pb-24 font-body">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/dashboard')} className="p-2 border-2 border-border bg-bg-card rounded-md shadow-card hover:bg-border transition-colors">
          ← Back
        </button>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
      </div>
      <div className="bg-bg-card border-2 border-border p-6 rounded-xl shadow-card space-y-4">
        <div className="border-b border-border pb-3">
          <p className="text-xs text-text-muted font-semibold uppercase">Profile Status</p>
          <p className="font-bold text-text mt-1">Verified Merchant (Self ID) ✓</p>
        </div>
        <button 
          onClick={() => {
            localStorage.removeItem('sokopay_token');
            navigate('/onboarding');
          }}
          className="w-full py-3 bg-error text-text-light rounded-md font-display font-semibold hover:opacity-90 shadow-card"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
