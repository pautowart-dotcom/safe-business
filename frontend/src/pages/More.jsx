import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { Card, Btn, TextArea, ChevronRow, Icon, C } from '../ui/components.jsx';

const OWNER_ITEMS = [
  { label: 'Склад расходников', sub: 'Остатки, списание, пополнение', icon: 'supply', to: '/supplies' },
  { label: 'Чек-листы смены', sub: 'Открытие, закрытие', icon: 'shift', to: '/shift' },
  { label: 'База знаний', sub: 'Стандарты, правила, инструкции', icon: 'book', to: '/knowledge' },
  { label: 'Безопасность', sub: 'Индекс, документы, нарушения', icon: 'shield', to: '/security' },
  { label: 'Обратная связь', sub: 'Сообщения от мастеров', icon: 'msg', to: '/feedback' },
  { label: 'Команда', sub: 'Мастера, приглашения, удаление', icon: 'team', to: '/team' },
  { label: 'Филиалы', sub: 'Адреса студии, если их несколько', icon: 'home', to: '/branches' },
  { label: 'Настройки', sub: 'Компания, профиль, подписка', icon: 'settings', to: '/settings' },
];

function OwnerMore() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const items = isSuperAdmin
    ? [...OWNER_ITEMS, { label: 'Юридические документы', sub: 'Оферта, политика конфиденциальности (админ)', icon: 'doc', to: '/admin/legal' }]
    : OWNER_ITEMS;
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
  const { isOwner } = useAuth();
  return isOwner ? <OwnerMore /> : <MasterMore />;
}
