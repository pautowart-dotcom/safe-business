import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, BackBtn, Badge, Btn, Field, TextInput, Select, Icon, C } from '../ui/components.jsx';

const LEGAL_FORM_OPTIONS = [
  { value: 'self_employed', label: 'Самозанятый' },
  { value: 'ip', label: 'ИП' },
  { value: 'ooo', label: 'ООО' },
];

const WORK_MODEL_OPTIONS = [
  { value: 'alone', label: 'Работаю один' },
  { value: 'employees', label: 'Есть сотрудники' },
  { value: 'sublet', label: 'Сдаю рабочие места' },
  { value: 'mixed', label: 'Смешанная модель' },
];

// Дублирует backend/src/modules/security/content/segments.js для отображения —
// правила видимости и заглушек считает сервер (см. POST /profile, /sessions).
const SEGMENTS = [
  {
    key: 'beauty', label: 'Красота и здоровье',
    niches: [
      { key: 'manicure', label: 'Маникюр и педикюр' },
      { key: 'lashes_brows', label: 'Ресницы и брови' },
      { key: 'hair', label: 'Волосы' },
      { key: 'massage', label: 'Массаж' },
    ],
  },
  {
    key: 'fitness', label: 'Фитнес и активность',
    niches: [
      { key: 'fitness_gym', label: 'Фитнес-студия / тренажёрный зал' },
      { key: 'dance', label: 'Танцы' },
      { key: 'yoga', label: 'Йога / растяжка' },
    ],
  },
  { key: 'retail', label: 'Розничная торговля', niches: [] },
  { key: 'food', label: 'Общепит', niches: [] },
  { key: 'other', label: 'Другое', niches: [] },
];

const DOCUMENT_CATEGORIES = [
  'Регистрационные документы', 'Документы по работе с клиентами', 'Санитарная документация',
  'Пожарная безопасность', 'Оборудование', 'Персонал', 'Документы по персональным данным', 'Дополнительно',
];

const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };
const ZONE_LABELS = { green: 'Зелёная зона', yellow: 'Жёлтая зона', red: 'Красная зона' };

function riskColor(risk) {
  if (risk >= 9) return C.red;
  if (risk >= 7) return C.orange;
  if (risk >= 5) return '#B7950B';
  return C.green;
}

function money(value) {
  if (value == null) return '—';
  return `${Number(value).toLocaleString('ru-RU')} ₽`;
}

async function downloadPdf(sessionId, setError) {
  try {
    const created = await api.post(`/modules/security/sessions/${sessionId}/report`);
    const pdfRes = await api.get(`/modules/security/reports/${created.data.id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([pdfRes.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${created.data.reportNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    setError(err.response?.data?.error || 'Не удалось сформировать отчёт');
  }
}

export default function Security() {
  const { isOwner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [violations, setViolations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [products, setProducts] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeAudit, setActiveAudit] = useState(null);
  const [freeResult, setFreeResult] = useState(null);
  const [paidResult, setPaidResult] = useState(null);

  async function loadDashboardData() {
    const [sessionsRes, violationsRes, documentsRes, productsRes] = await Promise.all([
      api.get('/modules/security/sessions'),
      api.get('/modules/security/violations'),
      api.get('/modules/security/documents'),
      api.get('/modules/security/products'),
    ]);
    setSessions(sessionsRes.data);
    setViolations(violationsRes.data);
    setDocuments(documentsRes.data);
    setProducts(productsRes.data);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const profileRes = await api.get('/modules/security/profile');
      setProfile(profileRes.data);
      if (profileRes.data) await loadDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startAudit(type) {
    setError('');
    try {
      const { data } = await api.post('/modules/security/sessions', { type });
      setActiveAudit({ session: data.session, questions: data.questions, index: 0, answers: {} });
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать аудит');
    }
  }

  async function submitAnswer(answerIndex) {
    const question = activeAudit.questions[activeAudit.index];
    try {
      await api.post(`/modules/security/sessions/${activeAudit.session.id}/answers`, { questionCode: question.code, answerIndex });
      const nextAnswers = { ...activeAudit.answers, [question.code]: answerIndex };
      if (activeAudit.index + 1 < activeAudit.questions.length) {
        setActiveAudit({ ...activeAudit, index: activeAudit.index + 1, answers: nextAnswers });
      } else {
        await api.post(`/modules/security/sessions/${activeAudit.session.id}/complete`);
        const resultRes = await api.get(`/modules/security/sessions/${activeAudit.session.id}/result`);
        if (activeAudit.session.type === 'free') setFreeResult(resultRes.data);
        else setPaidResult(resultRes.data);
        setActiveAudit(null);
        await loadDashboardData();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить ответ');
    }
  }

  async function resolveViolation(id) {
    await api.patch(`/modules/security/violations/${id}/resolve`);
    setViolations(violations.map((v) => (v.id === id ? { ...v, status: 'resolved' } : v)));
  }

  async function joinWaitlist(productKey) {
    await api.post('/modules/security/waitlist', { productKey });
    alert('Записали вас в лист ожидания — уведомим о запуске.');
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (activeAudit) {
    return <AuditQuestionnaire activeAudit={activeAudit} onAnswer={submitAnswer} onCancel={() => setActiveAudit(null)} error={error} />;
  }
  if (freeResult) {
    return <FreeAuditResult result={freeResult} onClose={() => setFreeResult(null)} onStartPaid={() => { setFreeResult(null); startAudit('paid'); }} />;
  }
  if (paidResult) {
    return <PaidAuditResult result={paidResult} onClose={() => setPaidResult(null)} onDownload={() => downloadPdf(paidResult.session.id, setError)} />;
  }
  if (!profile || editingProfile) {
    return (
      <SegmentationForm
        initial={profile}
        onSaved={async (stub) => {
          setEditingProfile(false);
          if (!stub) await loadAll();
          else setProfile(null);
        }}
        onCancel={profile ? () => setEditingProfile(false) : null}
      />
    );
  }

  return (
    <SecurityDashboard
      profile={profile}
      sessions={sessions}
      violations={violations}
      documents={documents}
      products={products}
      isOwner={isOwner}
      error={error}
      onEditProfile={() => setEditingProfile(true)}
      onStartFree={() => startAudit('free')}
      onStartPaid={() => startAudit('paid')}
      onResolveViolation={resolveViolation}
      onJoinWaitlist={joinWaitlist}
      onDownloadReport={(sessionId) => downloadPdf(sessionId, setError)}
      onDocumentsChange={loadDashboardData}
    />
  );
}

// ---------- Сегментация ----------

function SegmentationForm({ initial, onSaved, onCancel }) {
  const [legalForm, setLegalForm] = useState(initial?.legalForm || '');
  const [workModel, setWorkModel] = useState(initial?.workModel || '');
  const [segment, setSegment] = useState(initial?.segment || '');
  const [niche, setNiche] = useState(initial?.niche || '');
  const [stubMessage, setStubMessage] = useState('');
  const [error, setError] = useState('');

  const segmentContent = SEGMENTS.find((s) => s.key === segment);

  async function submit() {
    setError('');
    try {
      const { data } = await api.post('/modules/security/profile', { legalForm, workModel, segment, niche: niche || null });
      if (data.stub) setStubMessage(data.message);
      else onSaved(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  if (stubMessage) {
    return (
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Спасибо</div>
        <p style={{ color: C.secondary }}>{stubMessage}</p>
        <Btn onClick={() => onSaved(true)}>Понятно</Btn>
      </Card>
    );
  }

  function Chips({ options, value, onChange, labelKey = 'label', valueKey = 'value' }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 4 }}>
        {options.map((o) => {
          const selected = value === o[valueKey];
          return (
            <button
              key={o[valueKey]}
              type="button"
              onClick={() => onChange(o[valueKey])}
              style={{
                padding: '11px', borderRadius: 10, border: `1.5px solid ${selected ? C.primary : C.border}`,
                background: selected ? C.primary : C.bg, color: selected ? '#FFF' : C.primary,
                fontWeight: selected ? 700 : 500, cursor: 'pointer', fontSize: 13,
              }}
            >
              {o[labelKey]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {onCancel && <BackBtn onClick={onCancel} />}
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Определим сферу деятельности</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>Чтобы не задавать нерелевантные вопросы и не показывать нарушения, которые не относятся к вашему бизнесу.</div>

      <Field label="Как оформлена деятельность?">
        <Chips options={LEGAL_FORM_OPTIONS} value={legalForm} onChange={setLegalForm} />
      </Field>
      <Field label="Как вы работаете?">
        <Chips options={WORK_MODEL_OPTIONS} value={workModel} onChange={setWorkModel} />
      </Field>
      <Field label="Сфера деятельности">
        <Chips options={SEGMENTS} value={segment} onChange={(v) => { setSegment(v); setNiche(''); }} valueKey="key" />
      </Field>
      {segmentContent && segmentContent.niches.length > 0 && (
        <Field label="Ниша">
          <Chips options={segmentContent.niches} value={niche} onChange={setNiche} valueKey="key" />
        </Field>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <Btn onClick={submit} disabled={!legalForm || !workModel || !segment || (segmentContent?.niches.length > 0 && !niche)}>
        Продолжить
      </Btn>
    </div>
  );
}

// ---------- Опросник ----------

function AuditQuestionnaire({ activeAudit, onAnswer, onCancel, error }) {
  const { questions, index } = activeAudit;
  const question = questions[index];
  const progress = Math.round(((index + 1) / questions.length) * 100);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: C.subtle }}>Вопрос {index + 1} из {questions.length}</span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 13, cursor: 'pointer' }}>Прервать</button>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: C.primary, transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>{question.text}</div>
      {question.hint && <div style={{ fontSize: 13, color: C.subtle, marginBottom: 8 }}>{question.hint}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {question.answers.map((label, i) => (
          <button
            key={i}
            onClick={() => onAnswer(i)}
            style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', fontSize: 15 }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
    </div>
  );
}

// ---------- Результаты ----------

function IndexHero({ percent, zone, subtitle }) {
  return (
    <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Индекс безопасности</div>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', marginBottom: 4 }}>{percent}%</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>{subtitle}</div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent}%`, background: '#FFF', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function FreeAuditResult({ result, onClose, onStartPaid }) {
  const zone = result.session.zone;
  return (
    <div>
      <BackBtn onClick={onClose} label="Закрыть" />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Результат бесплатного аудита</div>
      <IndexHero percent={result.session.index_percent} zone={zone} subtitle={ZONE_LABELS[zone]} />

      {result.top3.length > 0 && (
        <Card>
          <ST>Главные риски</ST>
          {result.top3.map((v, i, arr) => (
            <div key={v.code} style={{ padding: '10px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v.text}</div>
              <div style={{ fontSize: 13, color: C.subtle, marginTop: 2 }}>{v.description}</div>
            </div>
          ))}
        </Card>
      )}

      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 20 }}>
        Бесплатный аудит охватывает только часть обязательных требований. Полный аудит проверяет дополнительные точки уязвимости и выдаёт персональную дорожную карту устранения.
      </div>
      <Btn onClick={onStartPaid}>Пройти расширенный аудит</Btn>
    </div>
  );
}

function PaidAuditResult({ result, onClose, onDownload }) {
  const zone = result.session.zone;
  return (
    <div>
      <BackBtn onClick={onClose} label="К панели безопасности" />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Расширенный аудит завершён</div>
      <IndexHero percent={result.session.index_percent} zone={zone} subtitle={`${ZONE_LABELS[zone]} · Найдено нарушений: ${result.violations.length}`} />
      <Btn onClick={onDownload}>Скачать PDF-отчёт</Btn>
    </div>
  );
}

// ---------- Главная панель ----------

function SecurityDashboard({
  profile, sessions, violations, documents, products, isOwner, error,
  onEditProfile, onStartFree, onStartPaid, onResolveViolation, onJoinWaitlist, onDownloadReport, onDocumentsChange,
}) {
  const [tab, setTab] = useState('overview');

  const lastFree = sessions.find((s) => s.type === 'free' && s.status === 'completed');
  const lastPaid = sessions.find((s) => s.type === 'paid' && s.status === 'completed');
  const nicheLabel = SEGMENTS.flatMap((s) => s.niches).find((n) => n.key === profile.niche)?.label || profile.niche;
  const hero = lastPaid || lastFree;
  const openCount = violations.filter((v) => v.status === 'open').length;
  const doneCount = violations.filter((v) => v.status === 'resolved').length;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>Безопасность</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        {nicheLabel} · {LEGAL_FORM_OPTIONS.find((o) => o.value === profile.legalForm)?.label}
        {isOwner && <span onClick={onEditProfile} style={{ color: C.primary, fontWeight: 600, cursor: 'pointer', marginLeft: 8 }}>Изменить</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {hero && <IndexHero percent={hero.index_percent} zone={hero.zone} subtitle={ZONE_LABELS[hero.zone]} />}
      {hero && violations.length > 0 && (
        <div style={{ display: 'flex', gap: 24, marginTop: -18, marginBottom: 12, padding: '0 4px' }}>
          {[[violations.length, 'Нарушений'], [doneCount, 'Устранено'], [openCount, 'Осталось']].map(([v, l]) => (
            <div key={l}><div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 11, color: C.subtle }}>{l}</div></div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {[['overview', 'Обзор'], ['violations', `Нарушения (${openCount})`], ['documents', 'Документы']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ flex: 1, padding: '8px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', background: tab === k ? C.bg : 'transparent', color: tab === k ? C.primary : C.subtle, fontSize: 12, fontWeight: tab === k ? 700 : 400, boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab lastFree={lastFree} lastPaid={lastPaid} products={products} isOwner={isOwner} onStartFree={onStartFree} onStartPaid={onStartPaid} onJoinWaitlist={onJoinWaitlist} onDownloadReport={onDownloadReport} />
      )}
      {tab === 'violations' && <ViolationsTab violations={violations} isOwner={isOwner} onResolve={onResolveViolation} />}
      {tab === 'documents' && <DocumentsTab documents={documents} isOwner={isOwner} onChange={onDocumentsChange} />}
    </div>
  );
}

function OverviewTab({ lastFree, lastPaid, products, isOwner, onStartFree, onStartPaid, onJoinWaitlist, onDownloadReport }) {
  return (
    <div>
      <Card>
        <ST>Бесплатный аудит</ST>
        {lastFree ? (
          <div>
            <Badge color={ZONE_COLOR[lastFree.zone]} bg={ZONE_BG[lastFree.zone]}>{ZONE_LABELS[lastFree.zone]}</Badge>
            <div style={{ fontSize: 13, color: C.secondary, margin: '10px 0' }}>Индекс безопасности: {lastFree.index_percent}%</div>
            {isOwner && <Btn small variant="secondary" onClick={onStartFree}>Пройти ещё раз</Btn>}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>12 вопросов, займёт несколько минут. Покажет три главных риска бизнеса.</div>
            {isOwner && <Btn onClick={onStartFree}>Пройти бесплатный аудит</Btn>}
          </div>
        )}
      </Card>

      <Card>
        <ST>Расширенный аудит</ST>
        {lastPaid ? (
          <div>
            <Badge color={ZONE_COLOR[lastPaid.zone]} bg={ZONE_BG[lastPaid.zone]}>{ZONE_LABELS[lastPaid.zone]}</Badge>
            <div style={{ fontSize: 13, color: C.secondary, margin: '10px 0' }}>Индекс безопасности: {lastPaid.index_percent}%</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isOwner && <Btn small variant="secondary" onClick={onStartPaid}>Пройти ещё раз</Btn>}
              {isOwner && <Btn small onClick={() => onDownloadReport(lastPaid.id)}>Скачать PDF</Btn>}
            </div>
          </div>
        ) : products?.paidAudit.available ? (
          products.paidAudit.subscriptionActive ? (
            <div>
              <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Полная карта нарушений, дорожная карта устранения и персональный PDF-отчёт.</div>
              {isOwner && <Btn onClick={onStartPaid}>Начать расширенный аудит</Btn>}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.subtle }}>Доступно при активной подписке.</div>
          )
        ) : (
          <div>
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Расширенный аудит для вашей ниши сейчас в разработке. Мы уведомим вас о запуске.</div>
            {isOwner && <Btn small variant="secondary" onClick={() => onJoinWaitlist('paid_audit')}>Сообщить о запуске</Btn>}
          </div>
        )}
      </Card>

      <Card>
        <ST>Пакет документов</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Готовый комплект документов под вашу нишу. Скоро запуск.</div>
        {isOwner && <Btn small variant="secondary" onClick={() => onJoinWaitlist('document_package')}>Сообщить о запуске</Btn>}
      </Card>

      <Card>
        <ST>Подписка «Спокойствие»</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Постоянный контроль изменений требований и документов. Скоро запуск.</div>
        {isOwner && <Btn small variant="secondary" onClick={() => onJoinWaitlist('subscription_calm')}>Сообщить о запуске</Btn>}
      </Card>

      <div style={{ fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 }}>
        Сервис не заменяет юриста, бухгалтера или специалиста по охране труда.
      </div>
    </div>
  );
}

function ViolationsTab({ violations, isOwner, onResolve }) {
  const open = violations.filter((v) => v.status === 'open');
  const resolved = violations.filter((v) => v.status === 'resolved');

  if (violations.length === 0) {
    return <div className="empty-hint">Нарушений не найдено. Пройдите расширенный аудит, чтобы увидеть карту уязвимостей.</div>;
  }

  return (
    <div>
      <ST>Открытые ({open.length})</ST>
      {open.map((v) => <ViolationCard key={v.id} violation={v} isOwner={isOwner} onResolve={onResolve} />)}
      {open.length === 0 && <div className="empty-hint">Открытых нарушений нет.</div>}

      {resolved.length > 0 && (
        <>
          <div style={{ marginTop: 20 }}><ST>Устранено ({resolved.length})</ST></div>
          {resolved.map((v) => <ViolationCard key={v.id} violation={v} isOwner={isOwner} onResolve={onResolve} />)}
        </>
      )}
    </div>
  );
}

function ViolationCard({ violation, isOwner, onResolve }) {
  const color = riskColor(violation.risk);
  return (
    <Card style={{ borderLeft: `3px solid ${violation.status === 'resolved' ? C.green : color}`, opacity: violation.status === 'resolved' ? 0.7 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, textDecoration: violation.status === 'resolved' ? 'line-through' : 'none' }}>{violation.title}</div>
        <Badge color={violation.status === 'resolved' ? C.green : color} bg={violation.status === 'resolved' ? C.greenBg : `${color}1A`}>
          {violation.status === 'resolved' ? '✓' : `${violation.risk}/10`}
        </Badge>
      </div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 8 }}>{violation.description}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 4 }}><strong>Штраф:</strong> {violation.fineText}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 4 }}><strong>Что сделать:</strong> {violation.solution}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
        <strong>Стоимость:</strong> {violation.free ? 'бесплатно' : money(violation.costMin)} · <strong>Срок:</strong> {violation.daysMin} дн.
      </div>
      {isOwner && violation.status === 'open' && <Btn small variant="green" onClick={() => onResolve(violation.id)}>Отметить устранённым</Btn>}
    </Card>
  );
}

function DocumentsTab({ documents, isOwner, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: DOCUMENT_CATEGORIES[0], name: '', fileUrl: '' });

  const byCategory = {};
  for (const doc of documents) (byCategory[doc.category] ||= []).push(doc);

  async function submit() {
    if (!form.name.trim() || !form.fileUrl.trim()) return;
    await api.post('/modules/security/documents', form);
    setForm({ category: DOCUMENT_CATEGORIES[0], name: '', fileUrl: '' });
    setShowForm(false);
    onChange();
  }

  async function remove(id) {
    if (!confirm('Удалить документ?')) return;
    await api.delete(`/modules/security/documents/${id}`);
    onChange();
  }

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Добавить документ</div>
        <Field label="Категория">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Название"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Ссылка на файл"><TextInput type="url" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." /></Field>
        <Btn onClick={submit}>Сохранить</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 12 }}>Храните документы студии по категориям</div>
      {isOwner && <div style={{ marginBottom: 16 }}><Btn small onClick={() => setShowForm(true)}>+ Добавить документ</Btn></div>}

      {Object.keys(byCategory).length === 0 && <div className="empty-hint">Документов пока нет</div>}

      {DOCUMENT_CATEGORIES.filter((c) => byCategory[c]).map((category) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <ST>{category}</ST>
          <Card style={{ padding: 0 }}>
            {byCategory[category].map((doc, i, arr) => (
              <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: C.primary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="doc" size={15} color={C.secondary} />{doc.name}
                </a>
                {isOwner && <button onClick={() => remove(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>Удалить</button>}
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
