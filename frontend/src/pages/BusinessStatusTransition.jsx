import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { Card, ST, BackBtn, Badge, Btn, C } from '../ui/components.jsx';

// Универсальная страница перехода статуса бизнеса (Фаза 1) — один экран на
// любой transition_key из business-status/content/repository.js, не по
// экрану на переход. Сейчас единственный заполненный переход —
// self_employed_to_ip, но добавление следующего (ИП→ООО и т.д.) не требует
// нового файла здесь, только новой записи в content-репозитории.

const LEGAL_FORM_LABELS = { self_employed: 'Самозанятый (НПД)', ip: 'ИП', ooo: 'ООО' };

const REASON_LABELS = {
  has_employees: 'У вас есть наёмные сотрудники — самозанятому это не разрешено (ст. 4 422-ФЗ)',
  revenue_exceeded: 'Доход за последние 12 месяцев превысил лимит самозанятости',
  revenue_approaching: 'Доход за последние 12 месяцев приближается к лимиту самозанятости',
};

export default function BusinessStatusTransition() {
  const { transitionKey } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    return api
      .get(`/platform/business-status/${transitionKey}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить переход'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey]);

  async function updateStatus(status) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/platform/business-status/${transitionKey}`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStep(stepIndex) {
    if (!data?.state) return;
    const nextStepsState = { ...data.state.stepsState, [stepIndex]: !data.state.stepsState[stepIndex] };
    setData({ ...data, state: { ...data.state, stepsState: nextStepsState } });
    try {
      await api.patch(`/platform/business-status/${transitionKey}`, { stepsState: nextStepsState });
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
      load();
    }
  }

  if (error && !data) {
    return (
      <div>
        <BackBtn onClick={() => navigate(-1)} />
        <div className="alert alert-error">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="page-loading">Загрузка...</div>;

  const { content, state } = data;

  return (
    <div>
      <BackBtn onClick={() => navigate(-1)} />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{content.title}</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        {LEGAL_FORM_LABELS[content.fromLegalForm]} → {LEGAL_FORM_LABELS[content.toLegalForm]}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {content.status === 'draft' && (
        <Card style={{ borderColor: C.orange }}>
          <div style={{ fontSize: 13, color: C.orange, fontWeight: 600 }}>
            Шаги ниже написаны по общим нормам закона и ещё не проверены юристом — сверьте с бухгалтером или ФНС перед подачей документов, не полагайтесь только на этот список.
          </div>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 13, color: C.secondary }}>{content.intro}</div>
        {content.lawReference && (
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>{content.lawReference}</div>
        )}
      </Card>

      {!state && (
        <Card>
          <div style={{ fontSize: 13, color: C.subtle }}>
            Этот переход пока не предложен вашей компании автоматически — ниже просто справочные шаги.
          </div>
        </Card>
      )}

      {state && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Badge color={C.orange} bg={C.orangeBg}>
              {state.status === 'suggested' && 'Предложено'}
              {state.status === 'in_progress' && 'В работе'}
              {state.status === 'dismissed' && 'Отклонено'}
              {state.status === 'completed' && 'Завершено'}
            </Badge>
          </div>
          {state.triggerReason && REASON_LABELS[state.triggerReason] && (
            <div style={{ fontSize: 13, color: C.secondary, marginTop: 6 }}>{REASON_LABELS[state.triggerReason]}</div>
          )}
        </Card>
      )}

      <div style={{ marginTop: 20 }}><ST>Шаги</ST></div>
      {content.steps.map((step, i) => {
        const done = !!state?.stepsState?.[i];
        return (
          <Card key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {state && (
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggleStep(i)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? C.subtle : C.primary }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: C.subtle, marginTop: 4 }}>{step.description}</div>
              {step.durationNote && (
                <div style={{ fontSize: 12, color: C.primary, marginTop: 4 }}>Срок: {step.durationNote}</div>
              )}
            </div>
          </Card>
        );
      })}

      {state && state.status !== 'completed' && state.status !== 'dismissed' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {state.status === 'suggested' && (
            <Btn disabled={saving} onClick={() => updateStatus('in_progress')}>Взять в работу</Btn>
          )}
          <Btn variant="secondary" disabled={saving} onClick={() => updateStatus('completed')}>Отметить выполненным</Btn>
          <Btn variant="secondary" disabled={saving} onClick={() => updateStatus('dismissed')}>Отклонить</Btn>
        </div>
      )}
      {state && state.status === 'dismissed' && (
        <div style={{ fontSize: 12, color: C.subtle, marginTop: 16 }}>
          Вы отклонили этот переход. Если ситуация станет серьёзнее (например, появятся сотрудники), карточка появится снова.
        </div>
      )}
    </div>
  );
}
