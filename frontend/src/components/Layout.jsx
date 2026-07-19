import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { C, F, MAX_WIDTH } from '../ui/theme.js';

const OWNER_NAV = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/clients', label: 'Клиенты', icon: 'clients' },
  { to: '/visits', label: 'Визиты', icon: 'visit' },
  { to: '/finance', label: 'Финансы', icon: 'finance' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

const MASTER_NAV = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/clients', label: 'Клиенты', icon: 'clients' },
  { to: '/shift', label: 'Смена', icon: 'shift' },
  { to: '/supplies', label: 'Склад', icon: 'supply' },
  { to: '/finance', label: 'Финансы', icon: 'finance' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

// Разделы, доступные только через хаб "Ещё" (нет прямой вкладки в нижнем
// меню) — используются, чтобы подсвечивать "Ещё" активным, когда открыт
// один из них.
const OWNER_HUB_PATHS = ['/supplies', '/shift', '/knowledge', '/security', '/feedback', '/team', '/branches', '/settings', '/admin/legal'];
const MASTER_HUB_PATHS = ['/knowledge', '/settings'];

const TITLES = {
  '/clients': 'Клиенты',
  '/visits': 'Визиты',
  '/finance': 'Финансы',
  '/supplies': 'Склад',
  '/shift': 'Чек-листы',
  '/knowledge': 'База знаний',
  '/security': 'Безопасность',
  '/team': 'Команда',
  '/branches': 'Филиалы',
  '/admin/legal': 'Юридические документы',
  '/settings': 'Настройки',
  '/feedback': 'Обратная связь',
  '/more': 'Ещё',
};

export default function Layout() {
  const { user, currentCompany, isOwner } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const nav = isOwner ? OWNER_NAV : MASTER_NAV;
  const hubPaths = isOwner ? OWNER_HUB_PATHS : MASTER_HUB_PATHS;
  const isHome = location.pathname === '/';
  const moreActive = hubPaths.some((p) => location.pathname.startsWith(p));
  const initial = user?.name?.[0]?.toUpperCase() || '?';

  return (
    <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {isHome ? (
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Безопасный бизнес · {currentCompany?.name}
          </div>
        ) : (
          <div style={{ fontSize: 17, fontWeight: 800, color: C.primary, letterSpacing: '-0.3px' }}>{TITLES[location.pathname] || ''}</div>
        )}
        <div
          onClick={() => navigate('/settings')}
          style={{ width: 34, height: 34, borderRadius: '50%', background: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#FFF', cursor: 'pointer' }}
        >
          {initial}
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px 20px 90px', overflowY: 'auto' }}>
        <Outlet />
      </div>

      <nav style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: MAX_WIDTH, background: C.bg, borderTop: `1px solid ${C.border}`, display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
        {nav.map((n) => {
          const active = n.to === '/more' ? location.pathname === '/more' || moreActive : n.end ? location.pathname === n.to : location.pathname.startsWith(n.to);
          return (
            <NavLink key={n.to} to={n.to} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 8px', textDecoration: 'none', gap: 3 }}>
              <Icon name={n.icon} size={22} color={active ? C.primary : C.subtle} sw={active ? 2.2 : 1.6} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? C.primary : C.subtle }}>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
