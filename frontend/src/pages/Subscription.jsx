import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
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
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  function load() {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }

  useEffect(() => {
    load();
  }, []);

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

  const periodEnd = company?.subscription_current_period_end
    ? new Date(company.subscription_current_period_end).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

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
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Скачивание PDF-отчёта теста безопасности и другие платные возможности платформы. Сам тест, его результат и
          индекс безопасности остаются бесплатными и доступны без подписки.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{company?.subscription_price_rub || 1490} ₽/мес</div>
        {company?.subscription_status === 'active' ? (
          <div style={{ fontSize: 13, color: C.subtle }}>
            Списывается автоматически {periodEnd ? `до ${periodEnd}` : 'каждый месяц'} — ничего делать не нужно.
          </div>
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
