import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';

/**
 * Guards the admin-only pages. The API enforces this too — this only keeps
 * people out of screens whose actions would be rejected anyway.
 */
export default function RequireAdmin({ children }) {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="text-slate-500">Checking your session…</p>;

  // Send an anonymous visitor to sign in, then back to where they were headed.
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-lg font-semibold text-amber-900">Admins only</h1>
        <p className="mt-1 text-sm text-amber-800">
          Your account can browse, play and download the library, but only an admin can add or
          edit albums and tracks.
        </p>
      </div>
    );
  }

  return children;
}
