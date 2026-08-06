// Блок "Рекомендации" на главном экране владельца — первый AI-слой продукта
// (принцип компании: минимум сотрудников, максимум ИИ). Сейчас это просто
// правила по датам, но интерфейс — вход "сырые данные компании", выход
// "список рекомендаций" — рассчитан на то, чтобы позже подменить реализацию
// настоящей моделью, не трогая экран вообще. Никакой другой инфраструктуры
// под будущий ИИ здесь специально нет.
const RECOMMEND_WINDOW_DAYS = 30;

function daysBetween(dueDate, today) {
  return Math.round((new Date(`${dueDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
}

// deadlines — как отдаёт GET /platform/deadlines (id, category, title,
// due_date | null, kind, status). subscription — как отдаёт
// GET /platform/companies/current (может быть null, пока не загрузилась).
export function buildRecommendations({ deadlines, subscription, today }) {
  const recommendations = [];

  deadlines
    .filter((d) => d.due_date && d.due_date > today)
    .map((d) => ({ ...d, daysLeft: daysBetween(d.due_date, today) }))
    .filter((d) => d.daysLeft <= RECOMMEND_WINDOW_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .forEach((d) => {
      recommendations.push({
        id: `deadline-${d.id}`,
        text: `Через ${d.daysLeft} дн. истекает «${d.title}» — пора продлить.`,
      });
    });

  if (subscription?.subscription_status === 'trial' && subscription.trial_ends_at) {
    const daysLeft = daysBetween(subscription.trial_ends_at.slice(0, 10), today);
    if (daysLeft > 3 && daysLeft <= 7) {
      recommendations.push({
        id: 'trial-ending',
        text: `Бесплатный период закончится через ${daysLeft} дн. — можно оформить подписку заранее, чтобы доступ не прервался.`,
      });
    }
  }

  return recommendations;
}
