import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider }    from './context/AuthContext';
import ProtectedRoute      from './components/ProtectedRoute';
import LandingPage         from './pages/LandingPage';
import LoginPage           from './pages/LoginPage';
import SignupPage          from './pages/SignupPage';
import DashboardPage       from './pages/DashboardPage';
import OAuthCallback       from './pages/OAuthCallback';
import CompleteProfile     from './pages/CompleteProfile';
import AcceptInvitePage    from './pages/AcceptInvitePage';
import FarmerDirectory     from './pages/supervisor/FarmerDirectory';
import FarmerProfilePage   from './pages/supervisor/FarmerProfilePage';
import FarmDetailPage      from './pages/supervisor/FarmDetailPage';
import FarmerDashboard     from './pages/farmer/FarmerDashboard';
import ManagerDashboard    from './pages/manager/ManagerDashboard';
import SmartChatWidget     from './components/SmartChatWidget';

function GlobalChat() {
  const location = useLocation();
  const hiddenRoutes = ['/', '/login', '/signup', '/auth/callback', '/invite'];
  
  if (hiddenRoutes.includes(location.pathname)) {
    return null;
  }
  
  return <SmartChatWidget />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Landing page ────────────────────────────────── */}
          <Route path="/"              element={<LandingPage />} />

          {/* ── Fully public ─────────────────────────────── */}
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/signup"        element={<SignupPage />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/invite"        element={<AcceptInvitePage />} />

          {/* ── Semi-public: must be authenticated (any role) */}
          <Route path="/complete-profile" element={<CompleteProfile />} />

          {/* ── Fully protected — any authenticated role ──── */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* ── Supervisor module (supervisor role only) ──── */}
          <Route
            path="/supervisor"
            element={
              <ProtectedRoute requiredRole="supervisor">
                <FarmerDirectory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/farmer/:farmerId"
            element={
              <ProtectedRoute requiredRole="supervisor">
                <FarmerProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/supervisor/farmer/:farmerId/farm/:farmId"
            element={
              <ProtectedRoute requiredRole={['supervisor', 'manager']}>
                <FarmDetailPage />
              </ProtectedRoute>
            }
          />

          {/* ── Manager module (manager role only) ───────── */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute requiredRole="manager">
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />

          {/* ── Farmer module (farmer role only) ─────────── */}
          <Route
            path="/farmer/dashboard"
            element={
              <ProtectedRoute requiredRole="farmer">
                <FarmerDashboard />
              </ProtectedRoute>
            }
          />

          {/* ── Fallback ────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <GlobalChat />
      </AuthProvider>
    </BrowserRouter>
  );
}
