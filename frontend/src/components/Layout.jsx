import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefreshController } from '../context/PullToRefreshContext.jsx';
import Icon from '../ui/Icon.jsx';
import OnboardingModal from './OnboardingModal.jsx';
import { C, F, MAX_WIDTH } from '../ui/theme.js';

const PULL_THRESHOLD = 64;
const PULL_MAX = 100;

// moduleKey — Пакет 3, Этап 1.1: пункт скрывается, если company.hasModule(key)
// вернёт false (модуль visits_clients выключен для этой компании).
// "Безопасность" видна в нижнем меню только владельцу (страница и так
// ownerOnly, см. PrivateRoute в App.jsx) — у владельца свой набор из 4
// вкладок, "Безопасность" замещает собой Клиенты/Смену/Склад, которые ему
// доступны через хаб "Ещё".
const OWNER_NAV = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/security', label: 'Безопасность', icon: 'shield' },
  { to: '/finance', label: 'Финансы', icon: 'finance' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

// Раньше администратор наследовал OWNER_NAV без "Безопасности" (ownerOnly
// отфильтровывался) и оставался с 3 вкладками вместо полноценного набора —
// владелец попросил выровнять кабинет администратора по составу с мастером
// (те же разделы админ и так видит через хаб "Ещё", просто без прямых вкладок).
const ADMIN_NAV = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/clients', label: 'Клиенты', icon: 'clients', moduleKey: 'clients' },
  { to: '/shift', label: 'Смена', icon: 'shift' },
  { to: '/supplies', label: 'Склад', icon: 'supply' },
  { to: '/finance', label: 'Финансы', icon: 'finance' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

const MASTER_NAV = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/clients', label: 'Клиенты', icon: 'clients', moduleKey: 'clients' },
  { to: '/shift', label: 'Смена', icon: 'shift' },
  { to: '/supplies', label: 'Склад', icon: 'supply' },
  { to: '/finance', label: 'Финансы', icon: 'finance' },
  { to: '/more', label: 'Ещё', icon: 'more' },
];

// Разделы, доступные только через хаб "Ещё" (нет прямой вкладки в нижнем
// меню) — используются, чтобы подсвечивать "Ещё" активным, когда открыт
// один из них. '/security' убран отсюда (Этап 6) — теперь у неё своя прямая
// вкладка, подсвечивается сама, а не через "Ещё"; '/clients' и '/visits'
// добавлены — переехали в хаб вместе с остальными.
// '/admin/legal' и '/admin/journal-types' убраны — переехали в отдельное
// приложение (admin-frontend/), их больше нет в этом клиентском SPA.
// '/branches' убран — концепция "филиалов" снята: каждая новая точка это
// отдельная компания/подписка, переключение между ними уже есть как выбор
// компании при входе.
// '/journals' убран из всех трёх списков 05.08.2026 — раздел заморожен,
// пункта меню больше нет (More.jsx), роут остался только как заглушка
// "временно недоступно" для старых ссылок/закладок.
const OWNER_HUB_PATHS = ['/clients', '/visits', '/photo-reports', '/supplies', '/shift', '/knowledge', '/feedback', '/team', '/settings', '/dossier'];
// У администратора теперь свои прямые вкладки на /clients, /shift, /supplies
// (ADMIN_NAV) — не дублируем их здесь, иначе "Ещё" подсвечивалась бы
// активной одновременно со своей прямой вкладкой.
const ADMIN_HUB_PATHS = ['/visits', '/photo-reports', '/knowledge', '/feedback', '/team', '/settings', '/dossier'];
const MASTER_HUB_PATHS = ['/visits', '/photo-reports', '/knowledge', '/settings'];

const TITLES = {
  '/clients': 'Клиенты',
  '/visits': 'Визиты',
  '/photo-reports': 'Фотоотчёты',
  '/finance': 'Финансы',
  '/supplies': 'Склад',
  '/shift': 'Чек-листы',
  '/knowledge': 'База знаний',
  '/security': 'Безопасность',
  '/team': 'Команда',
  '/journals': 'Журналы',
  '/dossier': 'Досье',
  '/settings': 'Настройки',
  '/feedback': 'Обратная связь',
  '/subscription': 'Подписка',
  '/support': 'Поддержка',
  '/deadlines': 'Дедлайны',
  '/more': 'Ещё',
};

export default function Layout() {
  const { user, currentCompany, isManagement, isOwner, hasModule } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const ptr = usePullToRefreshController();
  const scrollRef = useRef(null);
  const touchStartY = useRef(0);
  const pullingRef = useRef(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const nav = (isOwner ? OWNER_NAV : isManagement ? ADMIN_NAV : MASTER_NAV).filter((n) => !n.moduleKey || hasModule(n.moduleKey));
  const hubPaths = isOwner ? OWNER_HUB_PATHS : isManagement ? ADMIN_HUB_PATHS : MASTER_HUB_PATHS;
  const isHome = location.pathname === '/';
  const moreActive = hubPaths.some((p) => location.pathname.startsWith(p));
  const initial = user?.name?.[0]?.toUpperCase() || '?';
  // Разделы, открываемые только из "Ещё" (нет вкладки в нижнем меню, роль-
  // зависимо — например, у мастера "Склад"/"Смена" сами являются вкладками),
  // не имели способа вернуться назад кроме свайпа/системной кнопки браузера.
  const navPaths = nav.map((n) => n.to);
  const showBack = !navPaths.includes(location.pathname);

  // Pull-to-refresh: жест ловится здесь (единственный скролл-контейнер
  // приложения), но данные грузит страница — см. PullToRefreshContext.
  // Работает, только если текущая страница зарегистрировала свою load().
  function handleTouchStart(e) {
    // Быстрый переход между страницами (клик по нижней навигации сразу
    // после начала касания) мог оставить scrollRef указывающим на уже
    // отмонтированный контейнер предыдущей страницы — обращение к нему
    // здесь не должно ронять рендер.
    if (!scrollRef.current) {
      pullingRef.current = false;
      return;
    }
    if (refreshing || !ptr?.hasHandler()) {
      pullingRef.current = false;
      return;
    }
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      pullingRef.current = true;
    } else {
      pullingRef.current = false;
    }
  }

  // React вешает JSX onTouchMove как ПАССИВНЫЙ обработчик — preventDefault()
  // внутри него браузер тихо игнорирует. Без реального preventDefault на
  // touchmove нативная резинка контейнера (даже с overscroll-behavior:
  // contain — то не даёт бонсу уйти на страницу выше, но сам элемент всё
  // равно бонсит) побеждает наш собственный жест: индикатор либо не
  // появляется вовсе, либо появляется "рывками". Поэтому touchmove
  // навешивается отдельно, обычным addEventListener с passive:false — так
  // preventDefault реально работает.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    function onTouchMove(e) {
      if (!pullingRef.current || refreshing) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy <= 0 || el.scrollTop > 0) {
        setPullY(0);
        return;
      }
      e.preventDefault();
      setPullY(Math.min(dy * 0.5, PULL_MAX));
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  async function handleTouchEnd() {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullY >= PULL_THRESHOLD && ptr) {
      setRefreshing(true);
      setPullY(PULL_THRESHOLD);
      try {
        await ptr.trigger();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }

  return (
    // height (не minHeight) — вместе с html/body/#root { height: 100%;
    // overflow: hidden } в styles.css это делает прокручиваемым только
    // внутренний scrollRef ниже, а не страницу целиком (см. комментарий там).
    <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', height: '100vh', background: C.bg, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      {!user?.onboarding_seen_at && <OnboardingModal />}
      <div style={{ padding: '16px 20px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {showBack && (
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/more'))}
              aria-label="Назад"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginLeft: -4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <Icon name="arrow" size={18} color={C.secondary} />
            </button>
          )}
          {isHome ? (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Безопасный бизнес · {currentCompany?.name}
            </div>
          ) : (
            <div style={{ fontSize: 17, fontWeight: 800, color: C.primary, letterSpacing: '-0.3px' }}>{TITLES[location.pathname] || ''}</div>
          )}
        </div>
        {/* Оба круга — одинаковый box-sizing/flexShrink: без flexShrink:0 в
            узкой шапке (длинное название компании) круг личного кабинета
            сжимался по ширине и становился овальным — это и был баг. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div
            onClick={() => navigate('/deadlines')}
            style={{
              width: 34, height: 34, minWidth: 34, minHeight: 34, borderRadius: '50%', boxSizing: 'border-box',
              background: C.surface, border: `1px solid ${C.border}`, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: C.primary, cursor: 'pointer',
            }}
          >
            {new Date().getDate()}
          </div>
          <div
            onClick={() => navigate('/settings')}
            style={{
              width: 34, height: 34, minWidth: 34, minHeight: 34, borderRadius: '50%', boxSizing: 'border-box',
              background: user?.avatar_url ? 'none' : C.primary, flexShrink: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, color: '#FFF', cursor: 'pointer',
            }}
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              initial
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        // overscrollBehaviorY: 'none' — вместе с preventDefault в touchmove
        // (эффект выше) это полностью отключает нативную резинку самого
        // контейнера на верхней границе, чтобы её не было видно поверх
        // нашего собственного индикатора. webkitOverflowScrolling —
        // инерционная прокрутка на старых iOS, безопасно оставить всегда.
        // overflowX: 'hidden' — без него overflowY:'auto' по правилам CSS
        // молча включает и горизонтальную прокрутку тоже (значение 'visible'
        // у второй оси заменяется на 'auto', если первая не 'visible') —
        // ЛЮБОЕ переполнение по ширине где угодно на любой странице (это
        // единственный скролл-контейнер всего приложения, Outlet рендерится
        // внутри него и не пересоздаётся между страницами) включало
        // горизонтальный скролл у ВСЕГО приложения сразу, а сдвинутая
        // позиция потом "тащилась" между страницами, потому что сам
        // контейнер при переходах не пересоздаётся (13.08.2026 — несколько
        // точечных фиксов в отдельных компонентах не помогали именно
        // поэтому: убирали один источник переполнения, а залипшая позиция
        // прокрутки оставалась). Горизонтальный скролл в этом мобильном
        // однострочном макете нигде не задуман, прятать переполнение, а не
        // прокручивать его, — правильное поведение.
        style={{ flex: 1, padding: '20px 20px 90px', overflowY: 'auto', overflowX: 'hidden', overscrollBehaviorY: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: refreshing ? 40 : pullY,
            overflow: 'hidden',
            transition: pullingRef.current ? 'none' : 'height 0.2s ease',
          }}
        >
          <div
            style={{
              width: 20, height: 20, borderRadius: '50%',
              border: `2px solid ${C.border}`, borderTopColor: C.primary,
              opacity: refreshing ? 1 : Math.min(pullY / PULL_THRESHOLD, 1),
              transform: refreshing ? undefined : `rotate(${Math.min(pullY / PULL_THRESHOLD, 1) * 360}deg)`,
              animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
            }}
          />
        </div>
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
