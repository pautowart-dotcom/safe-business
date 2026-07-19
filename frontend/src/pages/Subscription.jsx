import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, BackBtn, Btn, C } from '../ui/components.jsx';

const STATUS_LABELS = {
  trial: 'Бесплатный период',
  active: 'Подписка активна',
  past_due: 'Проблема с оплатой',
  cancelled: 'Подписка отменена',
};

// Заглушка: онлайн-оплаты в проекте пока нет (companies.subscription_status
// переключается вручную, см. requirePaidPlan). Экран описывает, что даёт
// подписка, и служит местом, куда ведёт "Скачать PDF" до появления
// настоящего платёжного провайдера — сама активация пока не для этого экрана.
export default function Subscription() {
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);

  useEffect(() => {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }, []);

  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

  return (
    <div>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Подписка</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Статус: {STATUS_LABELS[company?.subscription_status] || '—'}
        {company?.subscription_status === 'trial' && trialDaysLeft != null && ` · осталось ${trialDaysLeft} дн.`}
      </div>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Что открывает подписка</div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          Скачивание PDF-отчёта теста безопасности и другие платные возможности платформы. Сам тест, его результат и
          индекс безопасности остаются бесплатными и доступны без подписки.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>1 490 ₽/мес</div>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 14 }}>
          Онлайн-оплата пока не подключена. Чтобы оформить подписку, свяжитесь с нами — активируем вручную.
        </div>
        <Btn disabled>Онлайн-оплата скоро</Btn>
      </Card>
    </div>
  );
}
