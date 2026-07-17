import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function PrivateRoute({ children, ownerOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-loading">Загрузка...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (ownerOnly && user.role !== 'owner') {
    return <Navigate to="/" replace />;
  }
  return children;
}
