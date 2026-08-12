import Icon from '../ui/Icon.jsx';
import { C, F } from '../ui/theme.js';

// Заставка при входе (12.08.2026, пожелание владельца) — только на
// самом первом экране (PrivateRoute: пока AuthContext ещё проверяет
// токен/сессию), не переиспользуется для обычных "Загрузка..." внутри
// страниц (.page-loading в styles.css) — та используется в полутора
// десятках мест для дозагрузки данных внутри уже открытого экрана,
// трогать её не стали, чтобы не плодить анимацию там, где её не просили.
//
// Тёмный фон (C.primary, тот же графитовый, что и manifest.json
// theme_color) — владелец сначала увидел светлую версию, попросил тёмную:
// на телефоне перед этим экраном браузер/ОС и так на долю секунды
// показывает чёрный кадр запуска PWA, светлый фон читался как две разные
// вспышки подряд, тёмный — как один плавный переход. Длительность показа
// (минимум 2.5с) регулируется снаружи, в PrivateRoute.jsx, не здесь —
// сама заставка ничего не знает про таймер.
export default function SplashScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: F, zIndex: 2000 }}>
      <div className="splash-pulse" style={{ width: 76, height: 76, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="shield" size={36} color="#FFFFFF" />
      </div>
      <div style={{ marginTop: 18, fontSize: 15, fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.3px' }}>Безопасный бизнес</div>
    </div>
  );
}
