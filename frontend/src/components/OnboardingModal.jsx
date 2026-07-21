import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { Btn } from '../ui/components.jsx';
import { C, F, MAX_WIDTH } from '../ui/theme.js';

// Этап 11 (низкий приоритет): простое модальное окно-инструкция при
// первом входе в аккаунт — без сложной интерактивности, просто текст на
// нескольких экранах-слайдах. Показывается один раз (AuthContext.
// markOnboardingSeen -> users.onboarding_seen_at).
const SLIDES = [
  {
    icon: 'shield',
    title: 'Добро пожаловать в Безопасный бизнес',
    text: 'Сервис для управления студией и снижения рисков — учёт визитов и финансов вместе с бесплатным аудитом безопасности бизнеса, чтобы штрафы и проверки не были сюрпризом.',
  },
  {
    icon: 'visit',
    title: 'Визиты',
    text: 'Ведите визиты клиентов, привязывайте мастера, сохраняйте фото "до/после" и списывайте расходники — заработок мастера считается автоматически.',
  },
  {
    icon: 'finance',
    title: 'Финансы',
    text: 'Выручка, расходы и прибыль студии в одном месте, без сведения таблиц вручную. Каждый мастер видит свои начисления.',
  },
  {
    icon: 'shield',
    title: 'Безопасность',
    text: 'Бесплатный тест безопасности бизнеса покажет индекс безопасности и конкретные нарушения — с чего начать, чтобы снизить риск штрафа или проверки.',
  },
];

export default function OnboardingModal() {
  const { markOnboardingSeen } = useAuth();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  // Раньше без try/catch: если markOnboardingSeen() падал (сеть/сервер),
  // closing навсегда оставался true — кнопка "зависала" задизейбленной, а
  // модалка не закрывалась (она закрывается через user.onboarding_seen_at
  // из контекста, не сама по себе), пока пользователь не обновлял страницу
  // (следующий /auth/me иногда всё же подтягивал уже обновлённый флаг).
  // Теперь ошибка сбрасывает closing — кнопка снова кликабельна, повтор
  // работает без перезагрузки страницы.
  async function finish() {
    if (closing) return;
    setClosing(true);
    setError('');
    try {
      await markOnboardingSeen();
    } catch {
      setError('Не удалось сохранить — попробуйте ещё раз');
      setClosing(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, fontFamily: F }}>
      <div style={{ background: C.bg, borderRadius: 20, padding: 28, width: '100%', maxWidth: Math.min(MAX_WIDTH - 40, 360), textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon name={slide.icon} size={30} color={C.primary} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 10 }}>{slide.title}</div>
        <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.6, marginBottom: 24 }}>{slide.text}</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{ width: i === step ? 18 : 6, height: 6, borderRadius: 3, background: i === step ? C.primary : C.border, transition: 'width 0.2s' }} />
          ))}
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 14, textAlign: 'left' }}>{error}</div>}
        <Btn onClick={() => (isLast ? finish() : setStep(step + 1))} disabled={closing}>
          {closing ? 'Сохраняем...' : isLast ? 'Начать работу' : 'Далее'}
        </Btn>
        {!isLast && (
          <button
            onClick={finish}
            disabled={closing}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 13, marginTop: 14, padding: 0, fontFamily: F }}
          >
            Пропустить
          </button>
        )}
      </div>
    </div>
  );
}
