import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { PostPage } from './pages/PostPage';
import { WeekPage } from './pages/WeekPage';

function ProtectedRoutes(): JSX.Element {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-ink-secondary text-sm">
        Chargement…
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/week/:weekId" element={<WeekPage />} />
      <Route path="/week/:weekId/post/:position" element={<PostPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
