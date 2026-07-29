import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Icon from '../ui/Icon.jsx';
import { Btn } from '../ui/components.jsx';
import { C, F, MAX_WIDTH } from '../ui/theme.js';

// Этап 11 (низкий приоритет): простое модальное окно-инструкция при
// первом входе в аккаунт — без сложной интерактивности, просто текст на
// нескольких экранах-слайдах. Показывается один раз (AuthContext.
// markOnboardingSeen -> users.onboarding_seen_at).
//
// Раньше был один и тот же набор слайдов для всех ролей — упоминал
// "Безопасность" Мастеру и Администратору (раздел им недоступен, owner-only)
// и говорил "каждый мастер видит свои начисления", хотя теперь Мастер видит
// ещё и общую сводку компании (Задача 3). Разделено по ролям, чтобы каждый
// видел инструкцию про то, что реально доступно именно ему.
const COMMON_SLIDE = {
  icon: 'shield',
  title: 'Добро пожаловать в Безопасный бизнес',
  text: 'Сервис для управления студией и снижения рисков — учёт визитов и финансов вместе с бесплатным аудитом безопасности бизнеса, чтобы штрафы и проверки не были сюрпризом.',
};

const SLIDES_BY_ROLE = {
  owner: [
    COMMON_SLIDE,
    {
      icon: 'visit',
      title: 'Визиты',
      text: 'Ведите визиты клиентов, привязывайте мастера, сохраняйте фото "до/после" и списывайте расходники — заработок мастера считается автоматически.',
    },
    {
      icon: 'finance',
      title: 'Финансы',
      text: 'Выручка, расходы и чистая прибыль студии в одном месте, без сведения таблиц вручную. Итоговую чистую прибыль видите только вы — администратор и мастер видят выручку/расходы, но не маржу.',
    },
    {
      icon: 'shield',
      title: 'Безопасность',
      text: 'Бесплатный тест безопасности бизнеса (34 вопроса) покажет индекс и конкретные нарушения с планом устранения — навсегда бесплатно, доступно только вам как владельцу. Там же — вкладка "Мои сроки" для дат конкретных документов.',
    },
    {
      icon: 'doc',
      title: 'Журналы и команда',
      text: 'В разделе "Ещё" — печатные журналы с QR-кодом (стерилизация, дезсредства и т.д.), приглашение мастеров и администраторов, дедлайны и обратная связь от команды. Журнал "Дезсредства" заполняется сам — из склада: отметьте расходник тегом "Дезинфицирующее средство", и его приход/списание попадёт в журнал автоматически. Эту инструкцию можно открыть заново там же в любой момент.',
    },
  ],
  admin: [
    COMMON_SLIDE,
    {
      icon: 'visit',
      title: 'Визиты',
      text: 'Ведите визиты клиентов, привязывайте мастера, сохраняйте фото "до/после" и списывайте расходники — заработок мастера считается автоматически.',
    },
    {
      icon: 'finance',
      title: 'Финансы',
      text: 'Выручка и расходы студии видны вам полностью — итоговая чистая прибыль видна только владельцу.',
    },
    {
      icon: 'team',
      title: 'Команда и журналы',
      text: 'Вы можете приглашать Мастеров, вести журналы и дедлайны компании. Журнал "Дезсредства" заполняется сам из склада — отметьте расходник тегом "Дезинфицирующее средство". Раздел "Безопасность" и настройки подписки — только у владельца.',
    },
  ],
  master: [
    COMMON_SLIDE,
    {
      icon: 'visit',
      title: 'Визиты',
      text: 'Ведите визиты клиентов, сохраняйте фото "до/после" и списывайте расходники — ваш заработок считается автоматически.',
    },
    {
      icon: 'finance',
      title: 'Финансы',
      text: 'Видите свою комиссию и корректировки, плюс общую сводку компании на просмотр (без итоговой прибыли — она видна только владельцу).',
    },
    {
      icon: 'doc',
      title: 'Журналы и склад',
      text: 'Отмечайте использование расходников и ведите журналы (УФ-лампа, инструктаж) наравне с Администратором. Журнал "Дезсредства" заполнять вручную не нужно — он сам собирается из прихода/списания расходников с тегом "Дезинфицирующее средство".',
    },
  ],
};

// onClose — Этап 12: раньше модалку можно было увидеть только один раз при
// первом входе, без способа открыть её снова. Если передан onClose (открыли
// вручную из "Ещё"), просто закрываем локально — флаг onboarding_seen_at уже
// стоит, повторный PATCH не нужен. Без onClose — исходное поведение первого
// показа (PATCH + закрытие через user из контекста).
export default function OnboardingModal({ onClose }) {
  const { markOnboardingSeen, isOwner, isManagement } = useAuth();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  const slides = SLIDES_BY_ROLE[isOwner ? 'owner' : isManagement ? 'admin' : 'master'];
  const isLast = step === slides.length - 1;
  const slide = slides[step];

  // Раньше без try/catch: если markOnboardingSeen() падал (сеть/сервер),
  // closing навсегда оставался true — кнопка "зависала" задизейбленной, а
  // модалка не закрывалась (она закрывается через user.onboarding_seen_at
  // из контекста, не сама по себе), пока пользователь не обновлял страницу
  // (следующий /auth/me иногда всё же подтягивал уже обновлённый флаг).
  // Теперь ошибка сбрасывает closing — кнопка снова кликабельна, повтор
  // работает без перезагрузки страницы.
  async function finish() {
    if (onClose) {
      onClose();
      return;
    }
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
          {slides.map((_, i) => (
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
