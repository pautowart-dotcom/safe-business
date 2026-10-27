import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { Card, Btn, TextArea, Icon, C, Group, Row } from '../ui/components.jsx';

// Пакет 4, Этап 6: Клиенты/Визиты переехали сюда из нижнего меню (место
// освободила "Безопасность" — новый пункт нижней навигации). moduleKey — та
// же логика, что раньше двигала видимость в нижнем меню (Пакет 3, Этап 1.1).
const OWNER_ITEMS = [
  // "Заявки" (20.08.2026) — отдельный переключаемый модуль, не у всех ниш
  // есть эта боль (у маникюра, например, обычно запись, а не входящая заявка).
  { label: 'Заявки', sub: 'Новый лид → связались → заказ → оплачено', icon: 'inbox', to: '/leads', group: 'work', moduleKey: 'leads' },
  { label: 'Клиенты', sub: 'База клиентов, история визитов', icon: 'clients', to: '/clients', group: 'work', moduleKey: 'clients' },
  { label: 'Визиты', sub: 'Календарь визитов и услуг', icon: 'visit', to: '/visits', group: 'work', moduleKey: 'visits' },
  { label: 'Фотоотчёты', sub: 'Фото до/после по визитам', icon: 'photo', to: '/photo-reports', group: 'work', moduleKey: 'visits' },
  { label: 'Склад расходников', sub: 'Остатки, списание, пополнение', icon: 'supply', to: '/supplies', group: 'work', moduleKey: 'supplies' },
  // moduleKey: 'visits' (06.09.2026) — у "Каталога услуг" никогда не было
  // своего ключа в реестре модулей (не операционка сбивает с толку" (03.09,
  // cohort.js) её тоже не затронуло: пункт продолжал показываться абсолютно
  // всем, включая новую когорту без единого операционного модуля. Услуги
  // осмысленны только вместе с визитами (выбор услуги при записи), поэтому
  // переиспользуем существующий ключ 'visits', а не заводим отдельный —
  // сам API /services при этом не трогаем, это только видимость пункта меню.
  { label: 'Каталог услуг', sub: 'Длительность, оплата мастеру по услугам', icon: 'doc', to: '/services', group: 'work', moduleKey: 'visits' },
  // 19.08.2026: продолжение marginAdvisor — семья ИИ-советников (маржа,
  // скидки, цена ушедшего мастера). Только владелец — все три советника
  // owner-only на бэкенде (finance/index.js), та же граница, что у
  // "Безопасность" ниже.
  // moduleKey убран (07.09.2026) — раньше требовал 'finance', но сама
  // страница (AiAdvisor.jsx) с 05-06.09 умеет показывать новой когорте
  // (нет finance/visits) свою версию — расшифровки закона + налоговый
  // агент (ComplianceAiAdvisor), без единой зависимости от finance. Гейт
  // 'finance' был не обновлён при добавлении этой ветки и просто прятал
  // пункт меню от единственных, кому эта версия и предназначена.
  { label: 'ИИ-советник', sub: 'Чат про ваш бизнес, налоги и изменения закона', icon: 'spark', to: '/ai-advisor', group: 'law' },
  // ИИ-ассистент убран из этого меню 20.08.2026 — теперь плавающий виджет
  // (Layout.jsx → AiAssistantWidget.jsx, доступен на любой странице), не
  // отдельный раздел. Гейт (owner-only + company_modules['ai-assistant'])
  // перенесён туда же, тот же принцип, что и раньше.
  { label: 'Чек-листы смены', sub: 'Открытие, закрытие', icon: 'shift', to: '/shift', group: 'work', moduleKey: 'checklists' },
  { label: 'База знаний', sub: 'Стандарты, правила, инструкции', icon: 'book', to: '/knowledge', group: 'work', moduleKey: 'knowledge' },
  { label: 'Безопасность', sub: 'Индекс, шаги до 100 %, документы', icon: 'shield', to: '/security', group: 'law' },
  // "Журналы" убраны из меню 05.08.2026 — раздел заморожен целиком
  // (владелец: до легализации электронных журналов). Роут /journals
  // остался в App.jsx как заглушка "временно недоступно" — на случай, если
  // кто-то перейдёт по старой ссылке/закладке.
  { label: 'Сформировать досье', sub: 'По дате или по мастеру (по клиенту — в его карточке)', icon: 'doc', to: '/dossier', group: 'work', moduleKey: 'visits' },
  { label: 'Обратная связь', sub: 'Сообщения от мастеров', icon: 'msg', to: '/feedback', group: 'team' },
  { label: 'Команда', sub: 'Сотрудники, приглашения, удаление', icon: 'team', to: '/team', group: 'team' },
  { label: 'Настройки', sub: 'Компания, профиль, подписка', icon: 'settings', to: '/settings', group: 'account' },
  // "Вопросы и ответы" был отдельным пунктом (/legal/faq), объединён с
  // "Поддержкой" в одну страницу (21.08.2026, владелец: "меньше разделов")
  // — FAQ-текст встроен в Support.jsx, отдельного роута в меню больше нет
  // (сам /legal/faq остался в App.jsx, просто на него больше нет ссылки
  // из меню).
  { label: 'Поддержка', sub: 'Вопросы и ответы, написать разработчику', icon: 'help', to: '/support', group: 'account' },
  // "Как пользоваться" и "Подробная справка" были двумя разными пунктами
  // (12.08.2026) — модалка-слайдшоу и отдельная страница /help. Объединены
  // в один пункт (владелец: слишком много позиций в разделе) — модалка
  // теперь показывается только один раз при первом входе (Layout.jsx,
  // !user.onboarding_seen_at), из меню открывается сразу полная страница.
  { label: 'Как пользоваться', sub: 'Каждый раздел с примерами экранов и шагами', icon: 'book', to: '/help', group: 'account' },
];

const MORE_GROUPS = [
  ['network', 'Сеть'],
  ['law', 'Безопасность и закон'],
  ['work', 'Работа точки'],
  ['team', 'Команда'],
  ['account', 'Аккаунт и помощь'],
];

function OwnerMore() {
  const navigate = useNavigate();
  const { isOwner, hasModule } = useAuth();
  // Безопасность — только владелец (политика конфиденциальности §8.4,
  // делегирования доступа администратору пока нет). Клиенты/Визиты —
  // видимость по модулю компании, как раньше в нижнем меню.
  // Кабинет платформы (компании, метрики, поддержка, юр.документы и т.д.)
  // теперь отдельное приложение (admin-frontend/, business-safe.ru/office/),
  // не смешан с клиентским кабинетом — раньше всё было свалено в один
  // список здесь, что было невозможно понять.
  // «Пульт сети» (16.10.2026) — только у владельца сети и его
  // администраторов с выданным доступом (hasNetworkCabinet).
  const [hasNetworkCabinet, setHasNetworkCabinet] = useState(false);
  // «Мои точки» (этап 5) — когда человек владелец/управляющий в 2+ точках.
  const [pointsCount, setPointsCount] = useState(0);
  useEffect(() => {
    api.get('/platform/companies/current').then(({ data }) => setHasNetworkCabinet(!!data.hasNetworkCabinet)).catch(() => {});
    api.get('/platform/my-points').then(({ data }) => setPointsCount(data.length)).catch(() => {});
  }, []);

  const items = [
    ...(hasNetworkCabinet ? [{ label: 'Пульт сети', sub: 'Все точки сети: что горит, кто открывается', icon: 'team', to: '/network', group: 'network' }] : []),
    ...(pointsCount >= 2 ? [{ label: 'Мои точки', sub: 'Сроки и открытие всех ваших точек в одном месте', icon: 'home', to: '/my-points', group: 'network' }] : []),
    ...OWNER_ITEMS,
  ]
    .filter((i) => !i.moduleKey || hasModule(i.moduleKey))
    .filter((i) => isOwner || (i.to !== '/security' && i.to !== '/ai-advisor'));

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 20 }}>Разделы</div>
      {/* 18.10.2026, вид приложения: группы «как в Настройках» вместо
          отдельной карточки на каждый раздел. */}
      {MORE_GROUPS.map(([key, title]) => {
        const list = items.filter((i) => i.group === key);
        if (list.length === 0) return null;
        return (
          <Group key={key} title={title}>
            {list.map((item) => (
              <Row key={item.to} icon={item.icon} title={item.label} subtitle={item.sub} onClick={() => navigate(item.to)} />
            ))}
          </Group>
        );
      })}
    </div>
  );
}

function MasterMore() {
  const navigate = useNavigate();
  const { hasModule } = useAuth();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [error, setError] = useState('');

  async function send() {
    if (!message.trim()) return;
    setError('');
    try {
      const res = await api.post('/modules/feedback', { message });
      setAiResponse(res.data.ai_response || null);
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить');
    }
  }

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 20 }}>Ещё</div>
      {(hasModule('visits') || hasModule('knowledge')) && (
        <Group title="Работа">
          {hasModule('visits') && <Row icon="visit" title="Визиты" subtitle="Календарь визитов и услуг" onClick={() => navigate('/visits')} />}
          {hasModule('visits') && <Row icon="photo" title="Фотоотчёты" subtitle="Фото до/после по своим визитам" onClick={() => navigate('/photo-reports')} />}
          {hasModule('knowledge') && <Row icon="book" title="База знаний" subtitle="Стандарты, правила, инструкции" onClick={() => navigate('/knowledge')} />}
        </Group>
      )}
      {/* "Журналы" убраны 05.08.2026 — раздел заморожен целиком, см. More.jsx OWNER_ITEMS. */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="msg" size={20} color={C.primary} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Обратная связь</div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>Передаётся владельцу</div>
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {!sent ? (
          <>
            <TextArea placeholder="Напишите предложение или вопрос..." value={message} onChange={(e) => setMessage(e.target.value)} style={{ marginBottom: 12 }} />
            <Btn onClick={send}>Отправить</Btn>
          </>
        ) : (
          <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px' }}>
            {aiResponse ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 4 }}>ОТВЕТ (ИИ-черновик)</div>
                <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5 }}>{aiResponse}</div>
              </>
            ) : (
              <div style={{ fontSize: 14, fontWeight: 600, color: C.green, textAlign: 'center' }}>✓ Отправлено владельцу</div>
            )}
            <button onClick={() => { setSent(false); setAiResponse(null); }} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 12, marginTop: 6, cursor: 'pointer', display: 'block', textAlign: aiResponse ? 'left' : 'center', width: '100%' }}>Написать ещё</button>
          </div>
        )}
      </Card>
      <Group title="Аккаунт и помощь" style={{ marginTop: 6 }}>
        <Row icon="help" title="Поддержка" onClick={() => navigate('/support')} />
        <Row icon="settings" title="Настройки и выход" onClick={() => navigate('/settings')} />
        <Row icon="book" title="Как пользоваться" onClick={() => navigate('/help')} />
      </Group>
    </div>
  );
}

export default function More() {
  const { isManagement } = useAuth();
  return isManagement ? <OwnerMore /> : <MasterMore />;
}
