import Icon from '../ui/Icon.jsx';
import { C, F } from '../ui/theme.js';

// Заставка при входе (12.08.2026, пожелание владельца) — только на
// самом первом экране (PrivateRoute: пока AuthContext ещё проверяет
// токен/сессию), не переиспользуется для обычных "Загрузка..." внутри
// страниц (.page-loading в styles.css) — та используется в полутора
// десятках мест для дозагрузки данных внутри уже открытого экрана,
// трогать её не стали, чтобы не плодить анимацию там, где её не просили.
export default function SplashScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, zIndex: 2000 }}>
      <div className="splash-pulse" style={{ width: 72, height: 72, borderRadius: '50%', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="shield" size={34} color={C.primary} />
      </div>
      <div style={{ marginTop: 16, fontSize: 15, fontWeight: 800, color: C.primary, letterSpacing: '0.3px' }}>Безопасный бизнес</div>
    </div>
  );
}
