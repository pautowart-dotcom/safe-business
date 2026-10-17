import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import SplashScreen from '../components/SplashScreen.jsx';
import { Card, ST, Btn, C } from '../ui/components.jsx';

// Вступление в сеть по ссылке-приглашению (16.10.2026, этап 2 франшизы).
// Публичный маршрут: без входа запоминаем код и ведём на вход/регистрацию,
// Login.jsx потом возвращает сюда. Вступление — только с явным согласием
// на то, что сеть видит сводку по точке (franchise.routes.js, consent).

const VISIBLE = [
  'название точки',
  'индекс безопасности и зону',
  'сколько нарушений найдено и сколько исправлено',
  'сколько сроков подошло (без названий документов)',
  'шаг подготовки к открытию, если вы ещё не открылись',
  'давно ли в кабинет кто-то заходил',
  'ваши отметки «сделано» и комментарии к задачам от сети',
  'сколько у вас сотрудников и сколько из них оформлены не до конца (без имён)',
  'ваши отметки по стандартам сети и результаты проверок от сети',
];
const HIDDEN = ['имена и документы сотрудников', 'клиенты и записи', 'деньги и выручка', 'тексты ваших документов'];

function clearPending() {
  try { localStorage.removeItem('pendingJoinCode'); } catch { /* приватный режим */ }
}

function JoinForm({ code }) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState(undefined);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/platform/franchise/join-preview/${encodeURIComponent(code)}`)
      .then(({ data }) => setPreview(data))
      .catch((err) => {
        setPreview(null);
        setError(err.response?.data?.error || 'Не удалось открыть приглашение');
      });
  }, [code]);

  async function submit() {
    setSending(true);
    setError('');
    try {
      await api.post('/platform/franchise/join-requests', { joinCode: code, consent: true });
      clearPending();
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить заявку');
    } finally {
      setSending(false);
    }
  }

  function cancel() {
    clearPending();
    navigate('/');
  }

  if (preview === undefined) return <div className="page-loading">Загрузка...</div>;

  if (!preview) {
    return (
      <Card>
        <ST>Приглашение в сеть</ST>
        <div className="alert alert-error">{error}</div>
        <Btn small variant="secondary" onClick={cancel}>На главную</Btn>
      </Card>
    );
  }

  if (preview.isOwnNetwork) {
    return (
      <Card>
        <ST>Приглашение в сеть</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Это ссылка вашей собственной сети «{preview.name}». Отправьте её владельцам точек.</div>
        <Btn small variant="secondary" onClick={cancel}>На главную</Btn>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <ST>Заявка отправлена</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
          Сеть «{preview.name}» подтвердит заявку, и ваша точка появится в её пульте. Выйти из сети можно в любой момент в разделе «Безопасность».
        </div>
        <Btn small onClick={() => navigate('/')}>На главную</Btn>
      </Card>
    );
  }

  return (
    <Card>
      <ST>Вступить в сеть «{preview.name}»</ST>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>Сеть будет видеть по вашей точке:</div>
      <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: C.primary, lineHeight: 1.6 }}>
        {VISIBLE.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 6 }}>Не будет видеть:</div>
      <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13, color: C.primary, lineHeight: 1.6 }}>
        {HIDDEN.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
        Согласен, чтобы сеть видела эту сводку. Выйти из сети можно в любой момент.
      </label>
      {/* 17.10.2026 — состав согласия по ст. 9 152-ФЗ: кто, что, кому, зачем,
          как долго и как отозвать (вопрос А2 в docs/kids-club-voprosy-yuristu.md).
          Название ИП совпадает с ФИО, поэтому это персональные данные. */}
      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: -6, marginBottom: 14, lineHeight: 1.5 }}>
        Обрабатывает данные ИП Паутов Артём Вячеславович (сервис «Безопасный бизнес»). Цель — показать владельцу сети «{preview.name}» и сотрудникам, которым он открыл доступ, сводку по вашей точке. Срок — пока точка в сети; ежемесячные отчёты сети хранятся до 2 лет. Отозвать согласие — кнопкой «Выйти из сети» в разделе «Безопасность»: точка сразу исчезнет из пульта и из всех отчётов сети.
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn small onClick={submit} disabled={!consent || sending}>{sending ? 'Секунду…' : 'Подать заявку'}</Btn>
        <Btn small variant="secondary" onClick={cancel}>Не сейчас</Btn>
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

export default function JoinNetwork() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, currentCompany, loading, isOwner } = useAuth();
  const authed = !!(user && currentCompany);

  useEffect(() => {
    if (loading || authed) return;
    try { localStorage.setItem('pendingJoinCode', code); } catch { /* приватный режим */ }
    navigate('/login', { replace: true });
  }, [loading, authed, code, navigate]);

  if (loading || !authed) return <SplashScreen />;

  return (
    <div style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px' }}>
      {isOwner ? (
        <JoinForm code={code} />
      ) : (
        <Card>
          <ST>Приглашение в сеть</ST>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
            Вступить в сеть может только владелец точки. Перешлите ему эту ссылку или войдите как владелец.
          </div>
          <Btn small variant="secondary" onClick={() => { clearPending(); navigate('/'); }}>На главную</Btn>
        </Card>
      )}
    </div>
  );
}
