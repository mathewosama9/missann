import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { Spinner } from '../components/ui/Spinner';

function Loading() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-8 w-8 text-brand-500" />
    </div>
  );
}

// يتطلب تسجيل الدخول (أي دور)
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isReady } = useAuth();
  const location = useLocation();
  if (!isReady) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

// يتطلب دور أدمن أو مساعد
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isReady } = useAuth();
  if (!isReady) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'STUDENT') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
