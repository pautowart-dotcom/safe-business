import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { Card, Btn, TextArea, ChevronRow, Icon, C } from '../ui/components.jsx';

// Пакет 4, Этап 6: Клиенты/Визиты переехали сюда из нижнего меню (место
// освободила "Безопасность" — новый пункт нижней навигации). moduleKey — та
// же логика, что раньше двигала видимость в нижнем меню (Пакет 3, Этап 1.1).
const OWNER_ITEMS = [
  { label: 'Клиенты', sub: 'База клиентов, история визитов', icon: 'clients', to: '/clients', moduleKey: 'clients' },
  { label: 'Визиты', sub: 'Календарь визитов и услуг', icon: 'visit', to: '/visits', moduleKey: 'visits' },
  { label: 'Склад расходников', sub: 'Остатки, списание, пополнение', icon: 'supply', to: '/supplies' },
  { label: 'Чек-листы смены', sub: 'Открытие, закрытие', icon: 'shift', to: '/shift' },
  { label: 'База знаний', sub: 'Стандарты, правила, инструкции', icon: 'book', to: '/knowledge' },
  { label: 'Безопасность', sub: 'Индекс, документы, нарушения', icon: 'shield', to: '/security' },
  { label: 'Журналы', sub: 'УФ-лампа, инструктаж на рабочем месте', icon: 'doc', to: '/journals' },
  { label: 'Сформировать досье', sub: 'По дате или по мастеру (по клиенту — в его карточке)', icon: 'doc', to: '/dossier' },
  { label: 'Обратная связь', sub: 'Сообщения от мастеров', icon: 'msg', to: '/feedback' },
  { label: 'Команда', sub: 'Мастера, приглашения, удаление', icon: 'team', to: '/team' },
  { label: 'Филиалы', sub: 'Адреса студии, если их несколько', icon: 'home', to: '/branches' },
  { label: 'Настройки', sub: 'Компания, профиль, подписка', icon: 'settings', to: '/settings' },
  { label: 'Поддержка', sub: 'Написать разработчику', icon: 'help', to: '/support' },
];

function OwnerMore() {
  const navigate = useNavigate();
  const { isSuperAdmin, isOwner, hasModule } = useAuth();
  // Безопасность — только владелец (политика конфиденциальности §8.4,
  // делегирования доступа администратору пока нет). Клиенты/Визиты —
  // видимость по модулю компании, как раньше в нижнем меню.
  const base = OWNER_ITEMS
    .filter((i) => !i.moduleKey || hasModule(i.moduleKey))
    .filter((i) => isOwner || i.to !== '/security');
  const items = isSuperAdmin
    ? [
        ...base,
        { label: 'Юридические документы', sub: 'Оферта, политика конфиденциальности (админ)', icon: 'doc', to: '/admin/legal' },
        { label: 'Типы журналов', sub: 'Заголовки и дисклеймеры журналов (админ)', icon: 'doc', to: '/admin/journal-types' },
      ]
    : base;
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Разделы</div>
      {items.map((item) => (
        <Card key={item.to} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }} onClick={() => navigate(item.to)}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={item.icon} size={20} color={C.primary} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{item.sub}</div>
          </div>
          <span style={{ fontSize: 20, color: C.border }}>›</span>
        </Card>
      ))}
    </div>
  );
}

function MasterMore() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!message.trim()) return;
    setError('');
    try {
      await api.post('/modules/feedback', { message });
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Ещё</div>
      <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/knowledge')}>
        <ChevronRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="book" size={20} color={C.primary} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>База знаний</div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>Стандарты, правила, инструкции</div>
            </div>
          </div>
        </ChevronRow>
      </Card>
      <Card style={{ cursor: 'pointer' }} onClick={() => navigate('/journals')}>
        <ChevronRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="doc" size={20} color={C.primary} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Журналы</div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>УФ-лампа, инструктаж на рабочем месте</div>
            </div>
          </div>
        </ChevronRow>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="msg" size={20} color={C.primary} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Обратная связь</div>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>Передаётся владельцу студии</div>
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        {!sent ? (
          <>
            <TextArea placeholder="Напишите предложение или вопрос..." value={message} onChange={(e) => setMessage(e.target.value)} style={{ marginBottom: 12 }} />
            <Btn onClick={send}>Отправить</Btn>
          </>
        ) : (
          <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>✓ Отправлено владельцу</div>
            <button onClick={() => setSent(false)} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 12, marginTop: 6, cursor: 'pointer' }}>Написать ещё</button>
          </div>
        )}
      </Card>
      <Card onClick={() => navigate('/support')} style={{ cursor: 'pointer' }}>
        <ChevronRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="help" size={20} color={C.primary} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Поддержка</div>
          </div>
        </ChevronRow>
      </Card>
      <Card onClick={() => navigate('/settings')} style={{ cursor: 'pointer' }}>
        <ChevronRow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="settings" size={20} color={C.primary} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Настройки и выход</div>
          </div>
        </ChevronRow>
      </Card>
    </div>
  );
}

export default function More() {
  const { isManagement } = useAuth();
  return isManagement ? <OwnerMore /> : <MasterMore />;
}
