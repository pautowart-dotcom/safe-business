import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Btn, C } from '../ui/components.jsx';

const STATUS_LABELS = {
  trial: 'Бесплатный период',
  active: 'Подписка активна',
  past_due: 'Проблема с оплатой',
  cancelled: 'Подписка отменена',
};

export default function Subscription() {
  const [company, setCompany] = useState(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  // includeAi (07.09.2026, вернули на этот экран) — сначала убирали отсюда
  // (не смешивать апсейл с самым чувствительным моментом оплаты), но первый
  // месяц бесплатный — момент "Оформить подписку" наступает не сразу после
  // регистрации, а обычно уже после месяца реального пользования, когда
  // решение и так осознанное. Переключить обратно после оформления по-
  // прежнему можно (togglingAi/toggleAi ниже), выбор здесь не окончательный.
  const [includeAi, setIncludeAi] = useState(false);
  const [togglingAi, setTogglingAi] = useState(false);

  function load() {
    return api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  // Возврат со страницы оплаты ЮKassa (?payment=done) — реальный статус
  // приходит вебхуком асинхронно, иногда с задержкой в несколько секунд,
  // поэтому просто перезагружаем компанию, а не считаем оплату мгновенной.
  useEffect(() => {
    if (searchParams.get('payment') === 'done') load();
  }, [searchParams]);

  async function startCheckout() {
    setStarting(true);
    setError('');
    try {
      const { data } = await api.post('/platform/subscription/checkout', { includeAi });
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать оплату');
      setStarting(false);
    }
  }

  // Включить/выключить ИИ-советник для уже оформленной подписки — без
  // повторной оплаты, новая сумма спишется со следующим продлением
  // (subscription.routes.js /toggle-ai, chargeRecurringSubscriptions.js
  // читает subscription_price_rub напрямую).
  async function toggleAi(next) {
    setTogglingAi(true);
    setError('');
    try {
      await api.post('/platform/subscription/toggle-ai', { includeAi: next });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось изменить ИИ-советник');
    } finally {
      setTogglingAi(false);
    }
  }

  // Отмена не спрашивает подтверждения через window.confirm — предупреждение
  // и так на экране текстом (до какой даты сохранится доступ) перед самой
  // кнопкой, дублировать его нативным confirm() было бы избыточно.
  async function cancelSubscription() {
    setCancelling(true);
    setError('');
    try {
      await api.post('/platform/subscription/cancel');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отменить подписку');
    } finally {
      setCancelling(false);
    }
  }

  async function reactivateSubscription() {
    setCancelling(true);
    setError('');
    try {
      await api.post('/platform/subscription/reactivate');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось восстановить подписку');
    } finally {
      setCancelling(false);
    }
  }

  // Та же константа, что и на бэкенде (core/subscriptionGrace.js) — не
  // импортируется напрямую (разные приложения), держать в синхроне вручную,
  // если там поменяется.
  const PAST_DUE_GRACE_DAYS = 3;
  const periodEnd = company?.subscription_current_period_end
    ? new Date(company.subscription_current_period_end).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;
  // Доступ после отмены сохраняется ровно до конца уже оплаченного периода;
  // после просрочки (past_due) — до конца периода ПЛЮС грейс-период на
  // повторные попытки списания (см. core/middleware/subscription.js —
  // isSubscriptionActive считает точно так же, иначе кнопка тут и реальный
  // доступ на сервере разошлись бы).
  const graceEndDate = company?.subscription_current_period_end
    ? new Date(new Date(company.subscription_current_period_end).getTime() + PAST_DUE_GRACE_DAYS * 86400000)
    : null;
  const graceEnd = graceEndDate ? graceEndDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const accessDeadline = company?.subscription_status === 'past_due' ? graceEndDate : company?.subscription_current_period_end ? new Date(company.subscription_current_period_end) : null;
  const accessStillOpen = accessDeadline && accessDeadline > new Date();

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Подписка</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Статус: {STATUS_LABELS[company?.subscription_status] || '—'}
        {company?.subscription_status === 'trial' && trialDaysLeft != null && ` · осталось ${trialDaysLeft} дн.`}
        {company?.subscription_status === 'active' && periodEnd && ` · продлится ${periodEnd}`}
      </div>

      {searchParams.get('payment') === 'done' && company?.subscription_status === 'trial' && (
        <div className="alert" style={{ marginBottom: 16 }}>
          Оплата обрабатывается — обычно это занимает несколько секунд. Обновите страницу, если статус ещё не изменился.
          {/* 12.09.2026, прямой запрос владельца: способ связаться, если
              что-то пошло не так после оплаты (письмо не пришло и т.п.). */}
          <div style={{ marginTop: 8 }}>
            Если статус не меняется дольше пары минут — напишите в{' '}
            <a href="https://t.me/safe_business_ru" target="_blank" rel="noreferrer">Телеграм</a> или{' '}
            <a href="https://wa.me/message/6KDRP3KLEXT3I1" target="_blank" rel="noreferrer">WhatsApp</a>, разберёмся.
          </div>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Что открывает подписка</div>
        {/* 30.08.2026: раньше здесь была одна размытая фраза "и другие
            платные возможности платформы" — по данным, именно неясность,
            за что платишь, была одной из причин, почему до оплаты доходили
            единицы. Список конкретный, без придуманных цифр. */}
        <ul style={{ fontSize: 13, color: C.secondary, lineHeight: 1.7, margin: '0 0 10px', paddingLeft: 18 }}>
          <li>Скачивание PDF-отчёта теста безопасности</li>
          <li>«Мои сроки» — персональные напоминания о датах документов</li>
          <li>Движок статуса бизнеса и налогов (самозанятый → ИП, патент, режим налогообложения)</li>
        </ul>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Сам тест, его результат и индекс безопасности остаются бесплатными и доступны без подписки. ИИ-советник (расшифровки закона, налоговый агент, ИИ-ассистент) — отдельная надбавка, включается по желанию, см. ниже.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{company?.subscription_price_rub || 1990} ₽/мес</div>
        {company?.subscription_status === 'active' ? (
          <>
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
              Продлевается автоматически {periodEnd ? `— следующее списание ${periodEnd}` : 'раз в месяц'}.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: togglingAi ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={company?.hasAiAccess}
                disabled={togglingAi}
                onChange={(e) => toggleAi(e.target.checked)}
              />
              ИИ-советник (+990 ₽/мес) — расшифровки закона, налоговый агент, ИИ-ассистент{togglingAi ? ' — сохраняем...' : ''}
            </label>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 14 }}>
              Изменение применится со следующего списания, без доплаты/возврата за текущий период.
            </div>
            <Btn variant="secondary" onClick={cancelSubscription} disabled={cancelling}>
              {cancelling ? 'Отменяем...' : 'Отменить подписку'}
            </Btn>
          </>
        ) : accessStillOpen ? (
          // Подписка отменена/не удалось списать, но оплаченный период ещё не
          // кончился — предупреждение с конкретной датой, а не молчаливая
          // потеря доступа (владелец: "конечно хочу [чтобы отмена реально
          // работала], только с предупреждениями").
          <>
            <div className="alert" style={{ marginBottom: 14 }}>
              {company?.subscription_status === 'past_due'
                ? `Не удалось списать оплату. Мы пробуем списать ещё раз в течение ближайших дней — доступ сохранится до ${graceEnd}. Если способ оплаты не обновится, после этой даты подписка закроется.`
                : `Подписка отменена. Доступ к PDF-отчётам и другим платным функциям сохранится до ${periodEnd}, дальше закроется — новых списаний не будет.`}
            </div>
            {company?.subscription_status === 'cancelled' && (
              <Btn onClick={reactivateSubscription} disabled={cancelling}>
                {cancelling ? 'Восстанавливаем...' : 'Возобновить подписку'}
              </Btn>
            )}
          </>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeAi} onChange={(e) => setIncludeAi(e.target.checked)} />
              Включить ИИ-советник (+990 ₽/мес) — расшифровки закона, налоговый агент, ИИ-ассистент
            </label>
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
              {(1990 + (includeAi ? 990 : 0))} ₽/мес. Оплата через ЮKassa. Дальше списывается автоматически раз в месяц — оформить подписку нужно один раз. Передумаете — переключить можно в любой момент здесь же.
            </div>
            <Btn onClick={startCheckout} disabled={starting}>{starting ? 'Переходим к оплате...' : 'Оформить подписку'}</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
