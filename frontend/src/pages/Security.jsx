import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

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
    key: 'beauty',
    label: 'Красота и здоровье',
    niches: [
      { key: 'manicure', label: 'Маникюр и педикюр' },
      { key: 'lashes_brows', label: 'Ресницы и брови' },
      { key: 'hair', label: 'Волосы' },
      { key: 'massage', label: 'Массаж' },
    ],
  },
  {
    key: 'fitness',
    label: 'Фитнес и активность',
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
  'Регистрационные документы',
  'Документы по работе с клиентами',
  'Санитарная документация',
  'Пожарная безопасность',
  'Оборудование',
  'Персонал',
  'Документы по персональным данным',
  'Дополнительно',
];

function riskClass(risk) {
  if (risk >= 9) return 'risk-critical';
  if (risk >= 7) return 'risk-high';
  if (risk >= 5) return 'risk-medium';
  return 'risk-low';
}

const ZONE_LABELS = { green: 'Зелёная зона', yellow: 'Жёлтая зона', red: 'Красная зона' };

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
  const [activeAudit, setActiveAudit] = useState(null); // { session, questions, index, answers }
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
      await api.post(`/modules/security/sessions/${activeAudit.session.id}/answers`, {
        questionCode: question.code,
        answerIndex,
      });
      const nextAnswers = { ...activeAudit.answers, [question.code]: answerIndex };
      if (activeAudit.index + 1 < activeAudit.questions.length) {
        setActiveAudit({ ...activeAudit, index: activeAudit.index + 1, answers: nextAnswers });
      } else {
        await api.post(`/modules/security/sessions/${activeAudit.session.id}/complete`);
        const resultRes = await api.get(`/modules/security/sessions/${activeAudit.session.id}/result`);
        if (activeAudit.session.type === 'free') {
          setFreeResult(resultRes.data);
        } else {
          setPaidResult(resultRes.data);
        }
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
    return (
      <AuditQuestionnaire
        activeAudit={activeAudit}
        onAnswer={submitAnswer}
        onCancel={() => setActiveAudit(null)}
        error={error}
      />
    );
  }

  if (freeResult) {
    return (
      <FreeAuditResult
        result={freeResult}
        onClose={() => setFreeResult(null)}
        onStartPaid={() => {
          setFreeResult(null);
          startAudit('paid');
        }}
      />
    );
  }

  if (paidResult) {
    return (
      <PaidAuditResult
        result={paidResult}
        onClose={() => {
          setPaidResult(null);
        }}
        onDownload={() => downloadPdf(paidResult.session.id, setError)}
      />
    );
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
    <Dashboard
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

// ---------- Сегментация (Файл 01 §6, Файл 02) ----------

function SegmentationForm({ initial, onSaved, onCancel }) {
  const [legalForm, setLegalForm] = useState(initial?.legalForm || '');
  const [workModel, setWorkModel] = useState(initial?.workModel || '');
  const [segment, setSegment] = useState(initial?.segment || '');
  const [niche, setNiche] = useState(initial?.niche || '');
  const [stubMessage, setStubMessage] = useState('');
  const [error, setError] = useState('');

  const segmentContent = SEGMENTS.find((s) => s.key === segment);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/modules/security/profile', { legalForm, workModel, segment, niche: niche || null });
      if (data.stub) {
        setStubMessage(data.message);
      } else {
        onSaved(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить');
    }
  }

  if (stubMessage) {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <h2>Спасибо</h2>
        <p>{stubMessage}</p>
        <button className="btn btn-primary" onClick={() => onSaved(true)}>Понятно</button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Определим сферу деятельности</h1>
      </div>
      <p className="page-subtitle">Это нужно, чтобы не задавать нерелевантные вопросы и не показывать нарушения, которые не относятся к вашему бизнесу.</p>

      <form onSubmit={submit} className="card" style={{ maxWidth: 640 }}>
        <label className="field">
          <span>Как оформлена деятельность?</span>
          <div className="segment-grid">
            {LEGAL_FORM_OPTIONS.map((o) => (
              <button type="button" key={o.value} className={'segment-btn' + (legalForm === o.value ? ' selected' : '')} onClick={() => setLegalForm(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Как вы работаете?</span>
          <div className="segment-grid">
            {WORK_MODEL_OPTIONS.map((o) => (
              <button type="button" key={o.value} className={'segment-btn' + (workModel === o.value ? ' selected' : '')} onClick={() => setWorkModel(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Выберите сферу деятельности</span>
          <div className="segment-grid">
            {SEGMENTS.map((s) => (
              <button
                type="button"
                key={s.key}
                className={'segment-btn' + (segment === s.key ? ' selected' : '')}
                onClick={() => {
                  setSegment(s.key);
                  setNiche('');
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </label>

        {segmentContent && segmentContent.niches.length > 0 && (
          <label className="field">
            <span>Выберите нишу</span>
            <div className="segment-grid">
              {segmentContent.niches.map((n) => (
                <button type="button" key={n.key} className={'segment-btn' + (niche === n.key ? ' selected' : '')} onClick={() => setNiche(n.key)}>
                  {n.label}
                </button>
              ))}
            </div>
          </label>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <div className="modal-actions">
          {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Отмена</button>}
          <button type="submit" className="btn btn-primary" disabled={!legalForm || !workModel || !segment || (segmentContent?.niches.length > 0 && !niche)}>
            Продолжить
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Опросник (общий для бесплатного и платного аудита) ----------

function AuditQuestionnaire({ activeAudit, onAnswer, onCancel, error }) {
  const { questions, index } = activeAudit;
  const question = questions[index];
  const progress = Math.round(((index + 1) / questions.length) * 100);

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <span className="page-subtitle">Вопрос {index + 1} из {questions.length}</span>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Прервать</button>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <h2>{question.text}</h2>
      {question.hint && <p>{question.hint}</p>}
      <div className="option-list">
        {question.answers.map((label, i) => (
          <button key={i} className="option-btn" onClick={() => onAnswer(i)}>
            {label}
          </button>
        ))}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}

// ---------- Результат бесплатного аудита (Файл 04) ----------

function FreeAuditResult({ result, onClose, onStartPaid }) {
  const zone = result.session.zone;
  return (
    <div>
      <div className="page-header">
        <h1>Результат бесплатного аудита</h1>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="stat-card">
          <div className="stat-value">{result.session.index_percent}%</div>
          <div className="stat-label">Индекс безопасности</div>
        </div>
        <span className={`zone-pill zone-${zone}`}>{ZONE_LABELS[zone]}</span>

        {result.top3.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <h3>Главные риски</h3>
            <ul className="list">
              {result.top3.map((v) => (
                <li key={v.code}>
                  <strong>{v.text}</strong>
                  <div>{v.description}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p style={{ marginTop: '1rem' }}>
          Бесплатный аудит охватывает только часть обязательных требований. Полный аудит проверяет дополнительные точки уязвимости, специфичные для вашей ниши, и выдаёт персональную дорожную карту устранения.
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
          <button className="btn btn-primary" onClick={onStartPaid}>Пройти расширенный аудит</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Результат платного аудита ----------

function PaidAuditResult({ result, onClose, onDownload }) {
  const zone = result.session.zone;
  return (
    <div>
      <div className="page-header">
        <h1>Расширенный аудит завершён</h1>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="stat-card">
          <div className="stat-value">{result.session.index_percent}%</div>
          <div className="stat-label">Индекс безопасности</div>
        </div>
        <span className={`zone-pill zone-${zone}`}>{ZONE_LABELS[zone]}</span>
        <p style={{ marginTop: '1rem' }}>Найдено нарушений: {result.violations.length}</p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>К панели безопасности</button>
          <button className="btn btn-primary" onClick={onDownload}>Скачать PDF-отчёт</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Главная панель ----------

function Dashboard({
  profile, sessions, violations, documents, products, isOwner, error,
  onEditProfile, onStartFree, onStartPaid, onResolveViolation, onJoinWaitlist, onDownloadReport, onDocumentsChange,
}) {
  const [tab, setTab] = useState('overview');

  const lastFree = sessions.find((s) => s.type === 'free' && s.status === 'completed');
  const lastPaid = sessions.find((s) => s.type === 'paid' && s.status === 'completed');
  const nicheLabel = SEGMENTS.flatMap((s) => s.niches).find((n) => n.key === profile.niche)?.label || profile.niche;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Безопасность</h1>
          <p className="page-subtitle">{nicheLabel} · {LEGAL_FORM_OPTIONS.find((o) => o.value === profile.legalForm)?.label}</p>
        </div>
        {isOwner && <button className="btn btn-ghost btn-sm" onClick={onEditProfile}>Изменить сферу деятельности</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filters-row">
        <button className={'chip' + (tab === 'overview' ? ' chip-active' : '')} onClick={() => setTab('overview')}>Обзор</button>
        <button className={'chip' + (tab === 'violations' ? ' chip-active' : '')} onClick={() => setTab('violations')}>Нарушения ({violations.filter((v) => v.status === 'open').length})</button>
        <button className={'chip' + (tab === 'documents' ? ' chip-active' : '')} onClick={() => setTab('documents')}>Документы</button>
      </div>

      {tab === 'overview' && (
        <OverviewTab
          lastFree={lastFree}
          lastPaid={lastPaid}
          products={products}
          isOwner={isOwner}
          onStartFree={onStartFree}
          onStartPaid={onStartPaid}
          onJoinWaitlist={onJoinWaitlist}
          onDownloadReport={onDownloadReport}
        />
      )}

      {tab === 'violations' && (
        <ViolationsTab violations={violations} isOwner={isOwner} onResolve={onResolveViolation} />
      )}

      {tab === 'documents' && (
        <DocumentsTab documents={documents} isOwner={isOwner} onChange={onDocumentsChange} />
      )}
    </div>
  );
}

function OverviewTab({ lastFree, lastPaid, products, isOwner, onStartFree, onStartPaid, onJoinWaitlist, onDownloadReport }) {
  return (
    <div>
      <div className="grid grid-2">
        <div className="card">
          <div className="card-header"><h3>Бесплатный аудит</h3></div>
          {lastFree ? (
            <div>
              <span className={`zone-pill zone-${lastFree.zone}`}>{ZONE_LABELS[lastFree.zone]}</span>
              <p>Индекс безопасности: {lastFree.index_percent}%</p>
              {isOwner && <button className="btn btn-sm" onClick={onStartFree}>Пройти ещё раз</button>}
            </div>
          ) : (
            <div>
              <p>12 вопросов, займёт несколько минут. Покажет три главных риска бизнеса.</p>
              {isOwner && <button className="btn btn-primary" onClick={onStartFree}>Пройти бесплатный аудит</button>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><h3>Расширенный аудит</h3></div>
          {lastPaid ? (
            <div>
              <span className={`zone-pill zone-${lastPaid.zone}`}>{ZONE_LABELS[lastPaid.zone]}</span>
              <p>Индекс безопасности: {lastPaid.index_percent}%</p>
              <div className="row-actions">
                {isOwner && <button className="btn btn-sm" onClick={onStartPaid}>Пройти ещё раз</button>}
                {isOwner && <button className="btn btn-sm btn-primary" onClick={() => onDownloadReport(lastPaid.id)}>Скачать PDF</button>}
              </div>
            </div>
          ) : products?.paidAudit.available ? (
            products.paidAudit.subscriptionActive ? (
              <div>
                <p>Полная карта нарушений, дорожная карта устранения и персональный PDF-отчёт.</p>
                {isOwner && <button className="btn btn-primary" onClick={onStartPaid}>Начать расширенный аудит</button>}
              </div>
            ) : (
              <p>Доступно при активной подписке.</p>
            )
          ) : (
            <div>
              <p>Расширенный аудит для вашей ниши сейчас в разработке. Мы уведомим вас о запуске.</p>
              {isOwner && <button className="btn btn-sm" onClick={() => onJoinWaitlist('paid_audit')}>Сообщить о запуске</button>}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><h3>Пакет документов</h3></div>
          <p>Готовый комплект документов под вашу нишу. Скоро запуск.</p>
          {isOwner && <button className="btn btn-sm" onClick={() => onJoinWaitlist('document_package')}>Сообщить о запуске</button>}
        </div>

        <div className="card">
          <div className="card-header"><h3>Подписка «Спокойствие»</h3></div>
          <p>Постоянный контроль изменений требований и документов. Скоро запуск.</p>
          {isOwner && <button className="btn btn-sm" onClick={() => onJoinWaitlist('subscription_calm')}>Сообщить о запуске</button>}
        </div>
      </div>

      <p className="empty-hint">Сервис не заменяет юриста, бухгалтера или специалиста по охране труда. Наша задача — помочь быстро увидеть риски и понять, на что обратить внимание в первую очередь.</p>
    </div>
  );
}

function ViolationsTab({ violations, isOwner, onResolve }) {
  const open = violations.filter((v) => v.status === 'open');
  const resolved = violations.filter((v) => v.status === 'resolved');

  if (violations.length === 0) {
    return <p className="empty-hint">Нарушений не найдено. Пройдите расширенный аудит, чтобы увидеть карту уязвимостей.</p>;
  }

  return (
    <div>
      <h3>Открытые ({open.length})</h3>
      <div className="grid grid-2">
        {open.map((v) => (
          <ViolationCard key={v.id} violation={v} isOwner={isOwner} onResolve={onResolve} />
        ))}
        {open.length === 0 && <p className="empty-hint">Открытых нарушений нет.</p>}
      </div>

      {resolved.length > 0 && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Устранено ({resolved.length})</h3>
          <div className="grid grid-2">
            {resolved.map((v) => (
              <ViolationCard key={v.id} violation={v} isOwner={isOwner} onResolve={onResolve} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ViolationCard({ violation, isOwner, onResolve }) {
  return (
    <div className={`card violation-card ${riskClass(violation.risk)}-border`}>
      <div className="card-header">
        <h3>{violation.title}</h3>
        <span className={`risk-badge ${riskClass(violation.risk)}`}>{violation.risk}/10</span>
      </div>
      <p>{violation.description}</p>
      <p><strong>Штраф:</strong> {violation.fineText}</p>
      <p><strong>Что сделать:</strong> {violation.solution}</p>
      <p><strong>Стоимость:</strong> {violation.free ? 'бесплатно' : money(violation.costMin)} · <strong>Срок:</strong> {violation.daysMin} дн.</p>
      {isOwner && violation.status === 'open' && (
        <button className="btn btn-sm btn-success" onClick={() => onResolve(violation.id)}>Отметить устранённым</button>
      )}
      {violation.status === 'resolved' && <span className="badge badge-completed">Устранено</span>}
    </div>
  );
}

function DocumentsTab({ documents, isOwner, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: DOCUMENT_CATEGORIES[0], name: '', fileUrl: '' });

  const byCategory = {};
  for (const doc of documents) {
    (byCategory[doc.category] ||= []).push(doc);
  }

  async function submit(e) {
    e.preventDefault();
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

  return (
    <div>
      <div className="page-header">
        <p className="page-subtitle">Храните документы студии по категориям</p>
        {isOwner && <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Добавить документ</button>}
      </div>

      {Object.keys(byCategory).length === 0 && <p className="empty-hint">Документов пока нет</p>}

      {DOCUMENT_CATEGORIES.filter((c) => byCategory[c]).map((category) => (
        <div key={category} style={{ marginBottom: '1rem' }}>
          <h3>{category}</h3>
          <ul className="list">
            {byCategory[category].map((doc) => (
              <li key={doc.id}>
                <a className="link" href={doc.file_url} target="_blank" rel="noreferrer">{doc.name}</a>
                {isOwner && <button className="btn btn-sm btn-ghost" onClick={() => remove(doc.id)} style={{ marginLeft: '0.5rem' }}>Удалить</button>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h3>Добавить документ</h3>
            <label className="field">
              <span>Категория</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Название</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Ссылка на файл</span>
              <input required type="url" value={form.fileUrl} onChange={(e) => setForm({ ...form, fileUrl: e.target.value })} placeholder="https://..." />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
