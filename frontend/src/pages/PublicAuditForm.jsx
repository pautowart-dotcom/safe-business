import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Card, Btn, TextInput, TextArea, Field, C } from '../ui/components.jsx';
import StandardsAnswerList from '../components/StandardsAnswerList.jsx';

// Форма проверки точки по ссылке (17.10.2026, миграция 0139) — для
// проверяющего без аккаунта. Не обёрнута в PrivateRoute/Layout, свой
// axios-инстанс — тот же приём, что в PublicLeadForm.jsx: не трогает сессию
// кабинета в этом же браузере. Бэкенд — franchise-audit-public.routes.js.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 });

export default function PublicAuditForm() {
  const { token } = useParams();
  const [form, setForm] = useState(undefined);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState({});
  const [auditorName, setAuditorName] = useState('');
  const [visitedOn, setVisitedOn] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.get(`/platform/franchise-audit-public/${token}`)
      .then(({ data }) => setForm(data))
      .catch((err) => { setForm(null); setLoadError(err.response?.data?.error || 'Не удалось открыть форму'); });
  }, [token]);

  async function submit() {
    setError('');
    const filled = Object.values(answers).filter((a) => a.result).length;
    if (filled < form.standards.length && !window.confirm(`Отмечено ${filled} из ${form.standards.length} пунктов. Отправить так?`)) return;
    setSending(true);
    try {
      await publicApi.post(`/platform/franchise-audit-public/${token}`, {
        answers: Object.entries(answers).map(([standardId, a]) => ({ standardId: Number(standardId), ...a })),
        auditorName,
        visitedOn,
        comment,
      });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить — проверьте интернет и попробуйте ещё раз');
    } finally {
      setSending(false);
    }
  }

  const wrap = (children) => <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px' }}>{children}</div>;

  if (form === undefined) return wrap(<div className="page-loading">Загрузка...</div>);
  if (!form) return wrap(<Card><div style={{ fontSize: 14, color: C.secondary }}>{loadError}</div></Card>);
  if (sent) {
    return wrap(
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Спасибо, проверка отправлена</div>
        <div style={{ fontSize: 13, color: C.secondary }}>Результат уже у сети «{form.networkName}». Эту страницу можно закрыть.</div>
      </Card>
    );
  }

  return wrap(
    <>
      <Card>
        <div style={{ fontSize: 12, color: C.subtle }}>{form.networkName}</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>Проверка точки: {form.pointName}</div>
        <div style={{ fontSize: 12.5, color: C.secondary, marginTop: 8, lineHeight: 1.5 }}>
          Отметьте по каждому пункту, что увидели. Если что-то не так — коротко напишите, что именно. Персональные данные сотрудников и клиентов сюда не пишите.
        </div>
      </Card>
      <Card>
        <Field label={form.auditorLabel ? `Ваше имя или роль (вы — ${form.auditorLabel.toLowerCase()})` : 'Ваше имя или роль'}>
          <TextInput value={auditorName} onChange={(e) => setAuditorName(e.target.value)} maxLength={60} placeholder="Необязательно" />
        </Field>
        <Field label="Дата визита">
          <TextInput type="date" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
        </Field>
        <StandardsAnswerList standards={form.standards} answers={answers} onChange={setAnswers} />
        <Field label="Общий комментарий (точка его увидит)">
          <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
        </Field>
        <Btn onClick={submit} disabled={sending}>{sending ? 'Отправляем…' : 'Отправить проверку'}</Btn>
        {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      </Card>
    </>
  );
}
