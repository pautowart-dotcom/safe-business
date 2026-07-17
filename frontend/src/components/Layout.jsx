import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/clients', label: 'Клиенты' },
  { to: '/visits', label: 'Визиты' },
  { to: '/finance', label: 'Финансы', ownerOnly: true },
  { to: '/supplies', label: 'Расходники' },
  { to: '/checklists', label: 'Чек-листы' },
  { to: '/knowledge', label: 'База знаний' },
  { to: '/security', label: 'Безопасность' },
  { to: '/users', label: 'Сотрудники', ownerOnly: true },
];

export default function Layout() {
  const { user, logout, isOwner } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">🛡</span>
          <span>Безопасный бизнес</span>
        </div>
        <nav>
          {NAV_ITEMS.filter((item) => !item.ownerOnly || isOwner).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-badge">
            <div className="user-name">{user?.name}</div>
            <div className="user-role">{isOwner ? 'Владелец' : 'Мастер'}</div>
          </div>
          <button className="btn btn-ghost" onClick={logout}>Выйти</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
