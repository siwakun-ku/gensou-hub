import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';

/**
 * Guards the pages that belong to an account rather than to the library. The
 * API enforces this too — this only keeps people out of screens whose every
 * request would come back 401.
 */
export default function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="text-slate-500">Checking your session…</p>;

  // Sign in, then carry on to where they were headed.
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return children;
}
