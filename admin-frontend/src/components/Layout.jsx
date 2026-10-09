import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { C, F } from '../ui/theme.js';

// 09.10.2026: было 17 пунктов одним списком, у половины одинаковая иконка
// (finance ×4, doc ×6) — нужный раздел приходилось искать глазами каждый
// раз. Разбито на группы по смыслу; countKey — счётчик "ждёт вас" из
// GET /platform/admin/nav-counts.
const NAV_GROUPS = [
  {
    title: null,
    items: [{ to: '/', label: 'Обзор', icon: 'home', end: true }],
  },
  {
    title: 'Клиенты и деньги',
    items: [
      { to: '/companies', label: 'Компании', icon: 'team' },
      { to: '/finance', label: 'Финансы', icon: 'finance' },
      { to: '/analytics', label: 'Аналитика', icon: 'chart' },
      { to: '/promo-codes', label: 'Промокоды', icon: 'tag' },
      { to: '/roadmap-leads', label: 'Роадмап (лиды)', icon: 'route' },
    ],
  },
  {
    title: 'Обращения',
    items: [
      { to: '/support', label: 'Поддержка', icon: 'msg', countKey: 'support' },
      { to: '/ai-unanswered', label: 'Вопросы без ответа', icon: 'help', countKey: 'aiUnanswered' },
      // Монограмма "Б" вместо Icon (21.08.2026) — тот же фирменный знак, что
      // уже принят для клиентского ассистента (AiAssistantWidget.jsx).
      { to: '/ai-manager', label: 'ИИ-управляющий', icon: 'ai-monogram' },
    ],
  },
  {
    title: 'Законы и контент',
    items: [
      { to: '/law-change-candidates', label: 'Мониторинг закона', icon: 'search', countKey: 'law' },
      { to: '/norms-registry', label: 'Реестр норм', icon: 'book' },
      { to: '/compliance', label: 'Комплаенс', icon: 'shield' },
      { to: '/patent-rates', label: 'Ставки патента', icon: 'finance' },
      { to: '/legal', label: 'Юридические документы', icon: 'scale' },
      { to: '/journal-types', label: 'Типы журналов', icon: 'doc' },
    ],
  },
  {
    title: 'Техническое',
    items: [{ to: '/client-errors', label: 'Логи краша', icon: 'bug' }],
  },
];

// Общее сообщение об ошибке запроса (см. api/client.js) — раньше большинство
// экранов глотали ошибки молча. Одно сообщение за раз, само скрывается.
function ApiErrorToast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer;
    function onError(e) {
      setMessage(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(''), 6000);
    }
    window.addEventListener('admin-api-error', onError);
    return () => {
      window.removeEventListener('admin-api-error', onError);
      clearTimeout(timer);
    };
  }, []);
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
        background: C.primary, color: '#FFF', borderRadius: 12, padding: '12px 16px', fontSize: 13,
        boxShadow: '0 6px 24px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 12,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      <span style={{ color: '#FCA5A5', fontWeight: 700 }}>Ошибка</span>
      <span>{message}</span>
      <button onClick={() => setMessage('')} aria-label="Закрыть" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
        <Icon name="close" size={14} color="rgba(255,255,255,0.6)" />
      </button>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  // Сайдбар всегда виден на компьютере (media query в styles.css
  // переопределяет position/transform, этот флаг там не участвует) — нужен
  // только для выезжающей панели на телефоне.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const location = useLocation();

  // Обновляем счётчики при каждом переходе между разделами — ответили на
  // обращение, вернулись в меню, счётчик уже меньше. silent: ошибка
  // счётчика не повод показывать всплывающее сообщение.
  useEffect(() => {
    api.get('/platform/admin/nav-counts', { silent: true }).then((res) => setCounts(res.data)).catch(() => {});
  }, [location.pathname]);

  const linkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap',
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

      <aside className={`admin-sidebar${mobileOpen ? ' admin-sidebar--open' : ''}`} style={{ width: 256, flexShrink: 0, borderRight: `1px solid ${C.border}`, padding: '24px 14px', display: 'flex', flexDirection: 'column', background: C.bg }}>
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
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi} style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: gi === 0 ? 0 : 14 }}>
              {g.title && (
                <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, padding: '0 14px 4px', letterSpacing: '0.3px' }}>{g.title}</div>
              )}
              {g.items.map((n) => {
                const count = n.countKey ? counts[n.countKey] : 0;
                return (
                  <NavLink key={n.to} to={n.to} end={n.end} style={linkStyle} onClick={() => setMobileOpen(false)}>
                    {n.icon === 'ai-monogram' ? (
                      <span style={{ width: 17, height: 17, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}, #2563EB)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', lineHeight: 1 }}>Б</span>
                      </span>
                    ) : (
                      <Icon name={n.icon} size={17} />
                    )}
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.label}</span>
                    {count > 0 && (
                      <span style={{ background: n.countKey === 'support' ? C.red : C.surface, color: n.countKey === 'support' ? '#FFF' : C.secondary, border: n.countKey === 'support' ? 'none' : `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>
                        {count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
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
      <ApiErrorToast />
    </div>
  );
}
