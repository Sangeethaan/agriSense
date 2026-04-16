import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider }    from './context/AuthContext';
import ProtectedRoute      from './components/ProtectedRoute';
import LoginPage           from './pages/LoginPage';
import SignupPage          from './pages/SignupPage';
import DashboardPage       from './pages/DashboardPage';
import OAuthCallback       from './pages/OAuthCallback';
import CompleteProfile     from './pages/CompleteProfile';
import FarmerDirectory     from './pages/supervisor/FarmerDirectory';
import FarmerProfilePage   from './pages/supervisor/FarmerProfilePage';
import FarmDetailPage      from './pages/supervisor/FarmDetailPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Fully public ─────────────────────────────── */}
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/signup"        element={<SignupPage />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

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
              <ProtectedRoute requiredRole="supervisor">
                <FarmDetailPage />
              </ProtectedRoute>
            }
          />

          {/* ── Fallback ────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
