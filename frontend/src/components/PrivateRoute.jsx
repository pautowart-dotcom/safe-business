import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function PrivateRoute({ children, ownerOnly = false }) {
  const { user, currentCompany, loading, isOwner } = useAuth();

  if (loading) {
    return <div className="page-loading">Загрузка...</div>;
  }
  // user без currentCompany — базовый токен есть, но компания ещё не выбрана
  // (например, при перезагрузке страницы на середине выбора). Отправляем на
  // /login — там это состояние отрисуется как выбор компании, не форма входа.
  if (!user || !currentCompany) {
    return <Navigate to="/login" replace />;
  }
  if (ownerOnly && !isOwner) {
    return <Navigate to="/" replace />;
  }
  return children;
}
