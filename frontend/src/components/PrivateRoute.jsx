import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function PrivateRoute({ children, managementOnly = false }) {
  const { user, currentCompany, loading, isManagement } = useAuth();

  if (loading) {
    return <div className="page-loading">Загрузка...</div>;
  }
  // user без currentCompany — базовый токен есть, но компания ещё не выбрана
  // (например, при перезагрузке страницы на середине выбора). Отправляем на
  // /login — там это состояние отрисуется как выбор компании, не форма входа.
  if (!user || !currentCompany) {
    return <Navigate to="/login" replace />;
  }
  if (managementOnly && !isManagement) {
    return <Navigate to="/" replace />;
  }
  return children;
}
