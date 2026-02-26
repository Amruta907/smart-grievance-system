import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import { AuthProvider, useAuth } from "./lib/auth";
import DashboardPage from "./pages/DashboardPage";
import AuthorityComplaintPage from "./pages/AuthorityComplaintPage";
import FileComplaintPage from "./pages/FileComplaintPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import MapPage from "./pages/MapPage";

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-nagar-bg">
        <Navbar />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/track" element={<HomePage />} />
            <Route path="/file-complaint" element={<FileComplaintPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route element={<RequireAuthority />}>
              <Route path="/authority/complaints/:id" element={<AuthorityComplaintPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}

function RequireAuth() {
  const { token, user } = useAuth();
  if (!token || !user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAuthority() {
  const { user } = useAuth();
  if (user?.role !== "authority") return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
