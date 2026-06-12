import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Transactions from './pages/Transactions';
import Pay from './pages/Pay';
import Withdraw from './pages/Withdraw';
import QR from './pages/QR';
import Analytics from './pages/Analytics';
import Summary from './pages/Summary';
import Layout from './components/Layout';
import PublicPayment from './pages/PublicPayment';
import ResetPassword from './pages/ResetPassword';
import { CacheProvider } from './context/CacheContext';

function App() {
  return (
    <CacheProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/p/:linkToken" element={<PublicPayment />} />
          
          {/* Protected layout wrapped routes */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/pay" element={<Pay />} />
            <Route path="/withdraw" element={<Withdraw />} />
            <Route path="/qr" element={<QR />} />
            <Route path="/analytics" element={<Analytics />} />
          </Route>
        </Routes>
      </Router>
    </CacheProvider>
  );
}

export default App;
