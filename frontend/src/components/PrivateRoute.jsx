import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// ownerOnly — строже managementOnly (owner+admin): например, раздел
// "Безопасность" по политике конфиденциальности §8.4 доступен только
// владельцу, администратору — нет (пока нет функционала делегирования).
// requireModule — Пакет 3, Этап 1.1: зеркалит backend requireModule()
// (core/sdk.js) на фронте, чтобы прямой переход по URL на /clients или
// /visits с выключенным модулем не показывал пустой экран/403 от API, а
// сразу уводил на главную — так же, как если бы пункта меню вовсе не было.
export function PrivateRoute({ children, managementOnly = false, ownerOnly = false, requireModule = null }) {
  const { user, currentCompany, loading, isManagement, isOwner, hasModule } = useAuth();

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
  if (managementOnly && !isManagement) {
    return <Navigate to="/" replace />;
  }
  if (requireModule && !hasModule(requireModule)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
