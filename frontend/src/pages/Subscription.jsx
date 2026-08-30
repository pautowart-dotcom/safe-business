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

  function load() {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
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
      const { data } = await api.post('/platform/subscription/checkout');
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать оплату');
      setStarting(false);
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
          <li>Скачивание PDF-отчёта теста безопасности (без подписки — можно купить отдельно один отчёт, см. кнопку на экране результата)</li>
          <li>«Мои сроки» — персональные напоминания о датах документов</li>
          <li>Движок статуса бизнеса и налогов (самозанятый → ИП, патент, режим налогообложения)</li>
          <li>ИИ-ассистент</li>
        </ul>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Сам тест, его результат и индекс безопасности остаются бесплатными и доступны без подписки.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{company?.subscription_price_rub || 1990} ₽/мес</div>
        {company?.subscription_status === 'trial' && (
          <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 10 }}>
            Первая оплата — сразу 2 месяца доступа вместо одного.
          </div>
        )}
        {company?.subscription_status === 'active' ? (
          <>
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
              Продлевается автоматически {periodEnd ? `— следующее списание ${periodEnd}` : 'раз в месяц'}.
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
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
              Оплата через ЮKassa. Дальше списывается автоматически раз в месяц — оформить подписку нужно один раз.
            </div>
            <Btn onClick={startCheckout} disabled={starting}>{starting ? 'Переходим к оплате...' : 'Оформить подписку'}</Btn>
          </>
        )}
      </Card>
    </div>
  );
}
