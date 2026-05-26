import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Pay from './pages/Pay';
import Withdraw from './pages/Withdraw';
import QR from './pages/QR';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/qr" element={<QR />} />
      </Routes>
    </Router>
  );
}

export default App;
