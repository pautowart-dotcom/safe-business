import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { C, F } from '../ui/theme.js';

const NAV = [
  { to: '/', label: 'Обзор', icon: 'home', end: true },
  { to: '/companies', label: 'Компании', icon: 'team' },
  { to: '/support', label: 'Поддержка', icon: 'msg' },
  { to: '/password-resets', label: 'Восстановление пароля', icon: 'key' },
  { to: '/client-errors', label: 'Логи краша', icon: 'bug' },
  { to: '/legal', label: 'Юридические документы', icon: 'doc' },
  { to: '/journal-types', label: 'Типы журналов', icon: 'doc' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  const linkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10,
    textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 700 : 500,
    color: isActive ? C.primary : C.secondary, background: isActive ? C.surface : 'transparent',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: F, background: C.bg }}>
      <aside style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${C.border}`, padding: '24px 14px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 10px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Безопасный бизнес</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Кабинет платформы</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={linkStyle}>
              <Icon name={n.icon} size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: 12, color: C.subtle, padding: '0 10px', marginBottom: 8 }}>{user?.name}</div>
          <button
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, width: '100%', textAlign: 'left' }}
          >
            <Icon name="logout" size={16} color={C.subtle} />
            Выйти
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, padding: '32px 40px', maxWidth: 960, overflowY: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
