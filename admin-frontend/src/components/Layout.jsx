import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { C, F } from '../ui/theme.js';

const NAV = [
  { to: '/', label: 'Обзор', icon: 'home', end: true },
  { to: '/analytics', label: 'Аналитика', icon: 'finance' },
  { to: '/companies', label: 'Компании', icon: 'team' },
  { to: '/compliance', label: 'Комплаенс', icon: 'shield' },
  // Монограмма "Б" вместо Icon (21.08.2026) — тот же фирменный знак, что уже
  // принят для клиентского ассистента (AiAssistantWidget.jsx), а не новая
  // иконка: единообразие важнее, третий вариант "как обозначить ИИ" за один
  // день уже был бы перебором.
  { to: '/ai-manager', label: 'ИИ-управляющий', icon: 'ai-monogram' },
  { to: '/support', label: 'Поддержка', icon: 'msg' },
  { to: '/client-errors', label: 'Логи краша', icon: 'bug' },
  { to: '/legal', label: 'Юридические документы', icon: 'doc' },
  { to: '/journal-types', label: 'Типы журналов', icon: 'doc' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  // Сайдбар всегда виден на компьютере (media query в styles.css
  // переопределяет position/transform, этот флаг там не участвует) — нужен
  // только для выезжающей панели на телефоне.
  const [mobileOpen, setMobileOpen] = useState(false);

  const linkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10,
    textDecoration: 'none', fontSize: 14, fontWeight: isActive ? 700 : 500,
    color: isActive ? C.primary : C.secondary, background: isActive ? C.surface : 'transparent',
  });

  return (
    <div className="admin-shell" style={{ display: 'flex', minHeight: '100vh', fontFamily: F, background: C.bg }}>
      {/* Только на телефоне (см. .admin-mobile-only в styles.css) — на
          компьютере сайдбар и так всегда открыт, верхняя панель не нужна. */}
      <div className="admin-mobile-only" style={{ position: 'sticky', top: 0, zIndex: 150, alignItems: 'center', gap: 12, padding: '14px 16px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <Icon name="menu" size={22} color={C.primary} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Кабинет платформы</div>
      </div>

      <div className={`admin-overlay${mobileOpen ? ' admin-overlay--open' : ''}`} onClick={() => setMobileOpen(false)} />

      <aside className={`admin-sidebar${mobileOpen ? ' admin-sidebar--open' : ''}`} style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${C.border}`, padding: '24px 14px', display: 'flex', flexDirection: 'column', background: C.bg }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 10px', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Безопасный бизнес</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Кабинет платформы</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Закрыть меню"
            className="admin-mobile-only"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
          >
            <Icon name="close" size={18} color={C.subtle} />
          </button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} style={linkStyle} onClick={() => setMobileOpen(false)}>
              {n.icon === 'ai-monogram' ? (
                <span style={{ width: 17, height: 17, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, #2563EB)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', lineHeight: 1 }}>Б</span>
                </span>
              ) : (
                <Icon name={n.icon} size={17} />
              )}
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
      <main className="admin-main" style={{ flex: 1, padding: '32px 40px', maxWidth: 960, overflowY: 'auto', minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
