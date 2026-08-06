import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, BackBtn, Badge, Btn, Field, TextInput, Select, Icon, C } from '../ui/components.jsx';
import MyDeadlinesTab from './MyDeadlines.jsx';

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
// multiNiche — единственный сегмент, где выбор нескольких ниш разрешён
// (задача про мультивыбор в "Красота и здоровье"), см. segments.js.
const SEGMENTS = [
  {
    key: 'beauty', label: 'Красота и здоровье', multiNiche: true,
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

function nicheLabel(key) {
  return SEGMENTS.flatMap((s) => s.niches).find((n) => n.key === key)?.label || key;
}

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

// Сам тест и результат (индекс, зона, карта нарушений) бесплатны всем —
// платный барьер стоит только на скачивании файла (backend: 402 на
// /reports/:id/download, см. requirePaidPlan). Раньше 402 сразу уводил
// на /subscription — экран результата пропадал без объяснения. Теперь
// остаёмся на месте и показываем причину + кнопку перехода — сам переход
// делает пользователь, а не код за него.
async function downloadPdf(sessionId, setError, setPdfPaywall) {
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
    if (err.response?.status === 402) {
      setPdfPaywall(true);
      return;
    }
    setError(err.response?.data?.error || 'Не удалось сформировать отчёт');
  }
}

function PdfPaywallNotice({ onSubscribe }) {
  return (
    <div className="alert alert-error" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span>Скачивание PDF доступно по подписке — сам тест и результат остаются бесплатными.</span>
      <button
        type="button"
        onClick={onSubscribe}
        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: C.primary, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 13 }}
      >
        Оформить подписку →
      </button>
    </div>
  );
}

export default function Security() {
  const { isManagement } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(null);
  const [violations, setViolations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [documentSections, setDocumentSections] = useState([]);
  const [products, setProducts] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeAudit, setActiveAudit] = useState(null);
  const [auditResult, setAuditResult] = useState(null);
  // Тест и его результат бесплатны всем, платный барьер только на скачивании
  // PDF (requirePaidPlan — см. downloadPdf выше). Статус подписки нужен
  // здесь только для честной подписи на кнопке/тексте карточки — сама
  // блокировка скачивания всё равно проверяется на backend.
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [pdfPaywall, setPdfPaywall] = useState(false);
  // Пакет 4, Этап 2: два таба верхнего уровня внутри "Безопасности" — "Тест"
  // (существующая панель ниже) и новая "Мои сроки". Таб переключается только
  // в устойчивом состоянии панели — во время прохождения теста/результата/
  // формы сегментации верхних табов нет, это отдельные полноэкранные шаги.
  const [topTab, setTopTab] = useState('test');

  async function loadDashboardData() {
    const [statusRes, violationsRes, documentsRes, sectionsRes, productsRes] = await Promise.all([
      api.get('/modules/security/status'),
      api.get('/modules/security/violations'),
      api.get('/modules/security/documents'),
      api.get('/modules/security/documents/sections'),
      api.get('/modules/security/products'),
    ]);
    setStatus(statusRes.data);
    setViolations(violationsRes.data);
    setDocuments(documentsRes.data);
    setDocumentSections(sectionsRes.data);
    setProducts(productsRes.data);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [profileRes, companyRes] = await Promise.all([
        api.get('/modules/security/profile'),
        api.get('/platform/companies/current'),
      ]);
      setProfile(profileRes.data);
      setHasPaidPlan(!!companyRes.data?.subscription_status && companyRes.data.subscription_status !== 'trial');
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

  // opts: {} — продолжить с непройденных ниш (или начать с первой, если ещё
  // ничего не пройдено); { retakeAll: true } — пройти заново все выбранные
  // ниши. plan в ответе — весь список ниш этого захода целиком (сервер
  // считает его один раз здесь), дальше фронт сам идёт по нему без повторных
  // запросов "что дальше" — см. submitAnswer.
  async function startAudit(opts = {}) {
    setError('');
    try {
      const { data } = await api.post('/modules/security/sessions', opts);
      setActiveAudit({
        session: data.session,
        questions: data.questions,
        index: 0,
        answers: {},
        plan: data.plan,
        planIndex: 0,
        nicheLabel: data.nicheLabel,
      });
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.waitlisted) {
        setError(err.response.data.error);
        await loadDashboardData();
        return;
      }
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
        return;
      }

      await api.post(`/modules/security/sessions/${activeAudit.session.id}/complete`);

      // Ниша пройдена — если в плане этого захода есть ещё ниши, сразу
      // (без промежуточного экрана) переходим к следующей. Эта сессия уже
      // завершена на сервере, назад в неё вернуться нельзя — если старт
      // следующей ниши не удастся (например контент для неё внезапно снят
      // с публикации), выходим на дашборд с ошибкой, а не оставляем экран
      // вопросника "подвисшим" на уже закрытой сессии.
      const { plan, planIndex } = activeAudit;
      const nextIndex = planIndex + 1;
      if (plan && nextIndex < plan.length) {
        try {
          const { data } = await api.post('/modules/security/sessions', { niche: plan[nextIndex] });
          setActiveAudit({
            session: data.session,
            questions: data.questions,
            index: 0,
            answers: {},
            plan,
            planIndex: nextIndex,
            nicheLabel: data.nicheLabel,
          });
        } catch (nextErr) {
          setActiveAudit(null);
          setError(nextErr.response?.data?.error || 'Не удалось начать следующую нишу');
          await loadDashboardData();
        }
        return;
      }

      const resultRes = await api.get(`/modules/security/sessions/${activeAudit.session.id}/result`);
      setAuditResult(resultRes.data);
      setActiveAudit(null);
      await loadDashboardData();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить ответ');
    }
  }

  function goToPreviousQuestion() {
    setActiveAudit({ ...activeAudit, index: activeAudit.index - 1 });
  }

  async function resolveViolation(id) {
    const { data } = await api.patch(`/modules/security/violations/${id}/resolve`);
    setViolations(violations.map((v) => (v.id === id ? { ...v, status: 'resolved' } : v)));
    // Индекс/зона теперь всегда объединённые по всем актуальным нишам
    // (status.js на бэкенде) — просто обновляем ту же строку локально.
    if (data?.indexPercent !== undefined) {
      setStatus((prev) => (prev ? { ...prev, indexPercent: data.indexPercent, zone: data.zone } : prev));
    }
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
        onBack={activeAudit.index > 0 ? goToPreviousQuestion : null}
        onCancel={() => setActiveAudit(null)}
        error={error}
      />
    );
  }
  if (auditResult) {
    return (
      <AuditResult
        result={auditResult}
        hasPaidPlan={hasPaidPlan}
        pdfPaywall={pdfPaywall}
        onClose={() => { setAuditResult(null); setPdfPaywall(false); }}
        onDownload={() => downloadPdf(auditResult.session.id, setError, setPdfPaywall)}
        onGoSubscribe={() => navigate('/subscription')}
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
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Безопасность</div>

      {isManagement && (
        <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, margin: '12px 0 16px' }}>
          {[['test', 'Тест'], ['my_deadlines', 'Мои сроки']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTopTab(k)}
              style={{ flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', background: topTab === k ? C.bg : 'transparent', color: topTab === k ? C.primary : C.subtle, fontSize: 13, fontWeight: topTab === k ? 700 : 500, boxShadow: topTab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {topTab === 'my_deadlines' && isManagement ? (
        <MyDeadlinesTab />
      ) : (
        <SecurityDashboard
          profile={profile}
          status={status}
          violations={violations}
          documents={documents}
          documentSections={documentSections}
          products={products}
          isManagement={isManagement}
          hasPaidPlan={hasPaidPlan}
          pdfPaywall={pdfPaywall}
          error={error}
          onEditProfile={() => setEditingProfile(true)}
          onStartAudit={startAudit}
          onResolveViolation={resolveViolation}
          onJoinWaitlist={joinWaitlist}
          onDownloadReport={(sessionId) => downloadPdf(sessionId, setError, setPdfPaywall)}
          onGoSubscribe={() => navigate('/subscription')}
          onDocumentsChange={loadDashboardData}
          hideTitle
        />
      )}
    </div>
  );
}

// ---------- Сегментация ----------

function Chips({ options, value, onChange, labelKey = 'label', valueKey = 'value', multiple = false }) {
  function isSelected(o) {
    return multiple ? (value || []).includes(o[valueKey]) : value === o[valueKey];
  }
  function handleClick(o) {
    if (!multiple) {
      onChange(o[valueKey]);
      return;
    }
    const current = value || [];
    onChange(current.includes(o[valueKey]) ? current.filter((v) => v !== o[valueKey]) : [...current, o[valueKey]]);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 4 }}>
      {options.map((o) => {
        const selected = isSelected(o);
        return (
          <button
            key={o[valueKey]}
            type="button"
            onClick={() => handleClick(o)}
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

function SegmentationForm({ initial, onSaved, onCancel }) {
  const [legalForm, setLegalForm] = useState(initial?.legalForm || '');
  const [workModel, setWorkModel] = useState(initial?.workModel || '');
  const [segment, setSegment] = useState(initial?.segment || '');
  const [niches, setNiches] = useState(initial?.niches || []);
  const [stubMessage, setStubMessage] = useState('');
  const [error, setError] = useState('');

  const segmentContent = SEGMENTS.find((s) => s.key === segment);
  const multiNiche = !!segmentContent?.multiNiche;

  async function submit() {
    setError('');
    try {
      const { data } = await api.post('/modules/security/profile', { legalForm, workModel, segment, niches });
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
        <Chips options={SEGMENTS} value={segment} onChange={(v) => { setSegment(v); setNiches([]); }} valueKey="key" />
      </Field>
      {segmentContent && segmentContent.niches.length > 0 && (
        <Field label={multiNiche ? 'Ниши (можно выбрать несколько)' : 'Ниша'}>
          <Chips
            options={segmentContent.niches}
            value={multiNiche ? niches : (niches[0] || '')}
            onChange={(v) => setNiches(multiNiche ? v : [v])}
            valueKey="key"
            multiple={multiNiche}
          />
        </Field>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <Btn onClick={submit} disabled={!legalForm || !workModel || !segment || (segmentContent?.niches.length > 0 && niches.length === 0)}>
        Продолжить
      </Btn>
    </div>
  );
}

// ---------- Опросник ----------

function AuditQuestionnaire({ activeAudit, onAnswer, onBack, onCancel, error }) {
  const { questions, index, nicheLabel: currentNicheLabel, plan, planIndex } = activeAudit;
  const question = questions[index];
  const progress = Math.round(((index + 1) / questions.length) * 100);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {onBack ? (
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.secondary, fontSize: 13, cursor: 'pointer', padding: 0 }}>
            <Icon name="arrow" size={14} color={C.secondary} />Назад
          </button>
        ) : (
          <span />
        )}
        <span style={{ fontSize: 13, color: C.subtle }}>Вопрос {index + 1} из {questions.length}</span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 13, cursor: 'pointer' }}>Прервать</button>
      </div>
      {currentNicheLabel && (
        <div style={{ fontSize: 12, color: C.primary, fontWeight: 700, marginBottom: 8 }}>
          {currentNicheLabel}
          {plan && plan.length > 1 ? ` · ниша ${planIndex + 1} из ${plan.length}` : ''}
        </div>
      )}
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

function IndexHero({ percent, zone, subtitle, note }) {
  return (
    <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 12, color: '#FFF' }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Индекс безопасности</div>
      <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', marginBottom: 4 }}>{percent}%</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: note ? 4 : 14 }}>{subtitle}</div>
      {note && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>{note}</div>}
      <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${percent}%`, background: '#FFF', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function AuditResult({ result, hasPaidPlan, pdfPaywall, onClose, onDownload, onGoSubscribe }) {
  const { status, warnings } = result;
  const zone = status.zone;
  return (
    <div>
      <BackBtn onClick={onClose} label="К панели безопасности" />
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Аудит завершён</div>
      <IndexHero percent={status.indexPercent} zone={zone} subtitle={`${ZONE_LABELS[zone]} · Найдено нарушений: ${status.violations.length}`} />
      {warnings?.map((w, i) => (
        <div key={i} className="alert alert-error" style={{ marginBottom: 12 }}>{w}</div>
      ))}
      {pdfPaywall && <PdfPaywallNotice onSubscribe={onGoSubscribe} />}
      <Btn onClick={onDownload}>{hasPaidPlan ? 'Скачать PDF-отчёт' : 'Скачать PDF-отчёт 🔒 по подписке'}</Btn>
    </div>
  );
}

// ---------- Главная панель ----------

function SecurityDashboard({
  profile, status, violations, documents, documentSections, products, isManagement, hasPaidPlan, pdfPaywall, error,
  onEditProfile, onStartAudit, onResolveViolation, onJoinWaitlist, onDownloadReport, onGoSubscribe, onDocumentsChange, hideTitle,
}) {
  const [tab, setTab] = useState('overview');

  const nicheLabels = (profile.niches || []).map(nicheLabel);
  const hasResult = status?.indexPercent != null;
  const openCount = violations.filter((v) => v.status === 'open').length;
  const doneCount = violations.filter((v) => v.status === 'resolved').length;

  return (
    <div>
      {!hideTitle && <div style={{ fontSize: 20, fontWeight: 800 }}>Безопасность</div>}
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        {nicheLabels.join(', ') || '—'} · {LEGAL_FORM_OPTIONS.find((o) => o.value === profile.legalForm)?.label}
        {isManagement && <span onClick={onEditProfile} style={{ color: C.primary, fontWeight: 600, cursor: 'pointer', marginLeft: 8 }}>Изменить</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {hasResult && (
        <IndexHero
          percent={status.indexPercent}
          zone={status.zone}
          subtitle={ZONE_LABELS[status.zone]}
          note={
            status.outstandingNiches?.length > 0
              ? `Пока по ${status.testedNiches.length} из ${profile.niches.length} ниш — не пройдено: ${status.outstandingNiches.map(nicheLabel).join(', ')}`
              : 'Обновляется по мере отметки нарушений устранёнными — не только в момент теста'
          }
        />
      )}
      {hasResult && violations.length > 0 && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 16, padding: '0 4px' }}>
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
        <OverviewTab profile={profile} status={status} products={products} isManagement={isManagement} hasPaidPlan={hasPaidPlan} pdfPaywall={pdfPaywall} onStartAudit={onStartAudit} onJoinWaitlist={onJoinWaitlist} onDownloadReport={onDownloadReport} onGoSubscribe={onGoSubscribe} />
      )}
      {tab === 'violations' && <ViolationsTab violations={violations} isManagement={isManagement} onResolve={onResolveViolation} />}
      {tab === 'documents' && <DocumentsTab documents={documents} sections={documentSections} isManagement={isManagement} onChange={onDocumentsChange} />}
    </div>
  );
}

function OverviewTab({ profile, status, products, isManagement, hasPaidPlan, pdfPaywall, onStartAudit, onJoinWaitlist, onDownloadReport, onGoSubscribe }) {
  const hasResult = status?.indexPercent != null;
  const outstanding = status?.outstandingNiches || [];

  // Три состояния кнопки: ничего не пройдено ("Пройти тест безопасности"),
  // есть непройденные ниши, например только что добавленная ("Пройти тест
  // по новой нише" — идёт только по ним, без повтора уже пройденных), всё
  // уже пройдено (явный повтор всех ниш по кнопке "Пройти заново").
  let continueLabel = 'Пройти ещё раз';
  let continueAction = () => onStartAudit();
  if (hasResult && outstanding.length > 0) {
    continueLabel = outstanding.length === 1
      ? `Пройти тест по нише «${nicheLabel(outstanding[0])}»`
      : 'Пройти тест по новым нишам';
  } else if (hasResult) {
    continueLabel = 'Пройти заново';
    continueAction = () => onStartAudit({ retakeAll: true });
  }

  return (
    <div>
      <Card>
        <ST>Тест безопасности</ST>
        {hasResult ? (
          <div>
            <Badge color={ZONE_COLOR[status.zone]} bg={ZONE_BG[status.zone]}>{ZONE_LABELS[status.zone]}</Badge>
            <div style={{ fontSize: 13, color: C.secondary, margin: '10px 0' }}>Индекс безопасности: {status.indexPercent}%</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isManagement && <Btn small variant="secondary" onClick={continueAction}>{continueLabel}</Btn>}
              {isManagement && (
                <Btn small onClick={() => onDownloadReport(status.anchorSessionId)}>
                  {hasPaidPlan ? 'Скачать PDF' : 'Скачать PDF 🔒'}
                </Btn>
              )}
            </div>
            {pdfPaywall && <div style={{ marginTop: 10 }}><PdfPaywallNotice onSubscribe={onGoSubscribe} /></div>}
          </div>
        ) : products?.audit.available ? (
          <div>
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
              {profile.niches.length > 1
                ? `34 вопроса на каждую из ${profile.niches.length} ниш, бесплатно — полная карта нарушений и дорожная карта устранения. Общий PDF-отчёт для печати — по подписке.`
                : '34 вопроса, бесплатно — полная карта нарушений и дорожная карта устранения. Персональный PDF-отчёт для печати — по подписке.'}
            </div>
            {isManagement && <Btn onClick={() => onStartAudit()}>Пройти тест безопасности</Btn>}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Тест безопасности для вашей ниши сейчас в разработке. Мы уведомим вас о запуске.</div>
            {isManagement && <Btn small variant="secondary" onClick={() => onJoinWaitlist('paid_audit')}>Сообщить о запуске</Btn>}
          </div>
        )}
      </Card>

      <Card>
        <ST>Пакет документов</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Готовый комплект документов под вашу нишу. Скоро запуск.</div>
        {isManagement && <Btn small variant="secondary" onClick={() => onJoinWaitlist('document_package')}>Сообщить о запуске</Btn>}
      </Card>

      <Card>
        <ST>Подписка «Спокойствие»</ST>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Постоянный контроль изменений требований и документов. Скоро запуск.</div>
        {isManagement && <Btn small variant="secondary" onClick={() => onJoinWaitlist('subscription_calm')}>Сообщить о запуске</Btn>}
      </Card>

      <div style={{ fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 }}>
        Сервис не заменяет юриста, бухгалтера или специалиста по охране труда.
      </div>
    </div>
  );
}

function ViolationsTab({ violations, isManagement, onResolve }) {
  const open = violations.filter((v) => v.status === 'open');
  const resolved = violations.filter((v) => v.status === 'resolved');

  if (violations.length === 0) {
    return <div className="empty-hint">Нарушений не найдено. Пройдите тест безопасности, чтобы увидеть карту уязвимостей.</div>;
  }

  return (
    <div>
      <ST>Открытые ({open.length})</ST>
      {open.map((v) => <ViolationCard key={v.id} violation={v} isManagement={isManagement} onResolve={onResolve} />)}
      {open.length === 0 && <div className="empty-hint">Открытых нарушений нет.</div>}

      {resolved.length > 0 && (
        <>
          <div style={{ marginTop: 20 }}><ST>Устранено ({resolved.length})</ST></div>
          {resolved.map((v) => <ViolationCard key={v.id} violation={v} isManagement={isManagement} onResolve={onResolve} />)}
        </>
      )}
    </div>
  );
}

function ViolationCard({ violation, isManagement, onResolve }) {
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
      {isManagement && violation.status === 'open' && <Btn small variant="green" onClick={() => onResolve(violation.id)}>Отметить устранённым</Btn>}
    </Card>
  );
}

// Разделы берём из structure отчёта (sections, GET /documents/sections) —
// тот же порядок и названия категорий, что и в mandatoryDocuments PDF-отчёта
// (report/build.js), так вкладка выглядит как карта требований, а не
// произвольный список. Если для ниши ещё нет контента отчёта (sections
// пустой), используем общий фолбэк-список категорий, чтобы загрузка
// документов всё равно работала.
function DocumentsTab({ documents, sections, isManagement, onChange }) {
  const categories = sections.length > 0 ? sections.map((s) => s.title) : DOCUMENT_CATEGORIES;
  const itemsByCategory = {};
  for (const s of sections) itemsByCategory[s.title] = s.items;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ category: '', name: '', fileUrl: '', file: null });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const byCategory = {};
  for (const doc of documents) (byCategory[doc.category] ||= []).push(doc);

  function openForm() {
    setForm({ category: categories[0] || '', name: '', fileUrl: '', file: null });
    setEditingId(null);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(doc) {
    setForm({ category: doc.category, name: doc.name, fileUrl: doc.file_url, file: null });
    setEditingId(doc.id);
    setFormError('');
    setShowForm(true);
  }

  // Раньше можно было только вставить готовую ссылку — теперь можно
  // сфотографировать/отсканировать документ и загрузить прямо тут.
  async function submit() {
    if (!form.name.trim() || (!form.file && !form.fileUrl.trim())) return;
    setSaving(true);
    setFormError('');
    try {
      let payload;
      let headers = {};
      if (form.file) {
        payload = new FormData();
        payload.append('category', form.category);
        payload.append('name', form.name);
        payload.append('file', form.file);
        headers = { 'Content-Type': 'multipart/form-data' };
      } else {
        payload = { category: form.category, name: form.name, fileUrl: form.fileUrl };
      }
      if (editingId) {
        await api.patch(`/modules/security/documents/${editingId}`, payload, { headers });
      } else {
        await api.post('/modules/security/documents', payload, { headers });
      }
      setShowForm(false);
      onChange();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Не удалось сохранить документ');
    } finally {
      setSaving(false);
    }
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
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>{editingId ? 'Изменить документ' : 'Добавить документ'}</div>
        <Field label="Категория">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Название"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Файл (фото, скан или PDF)">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null, fileUrl: '' })}
          />
        </Field>
        <div style={{ fontSize: 12, color: C.subtle, margin: '-6px 0 14px' }}>или вставьте ссылку, если файл уже где-то размещён</div>
        <Field label="Ссылка на файл">
          <TextInput
            type="url"
            value={form.fileUrl}
            onChange={(e) => setForm({ ...form, fileUrl: e.target.value, file: null })}
            placeholder="https://..."
          />
        </Field>
        {formError && <div className="alert alert-error">{formError}</div>}
        <Btn onClick={submit} disabled={saving}>{saving ? 'Сохраняем...' : editingId ? 'Сохранить изменения' : 'Сохранить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 12 }}>
        Разделы соответствуют структуре отчёта — так видно, какие документы относятся к каждой категории требований.
      </div>
      {isManagement && <div style={{ marginBottom: 16 }}><Btn small onClick={openForm}>+ Добавить документ</Btn></div>}

      {categories.map((category) => (
        <div key={category} style={{ marginBottom: 16 }}>
          <ST>{category}</ST>
          {itemsByCategory[category] && (
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>{itemsByCategory[category].join(' · ')}</div>
          )}
          {byCategory[category] ? (
            <Card style={{ padding: 0 }}>
              {byCategory[category].map((doc, i, arr) => (
                <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: C.primary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="doc" size={15} color={C.secondary} />{doc.name}
                  </a>
                  {isManagement && (
                    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                      <button onClick={() => openEdit(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 12 }}>Изменить</button>
                      <button onClick={() => remove(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>Удалить</button>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          ) : (
            <div className="empty-hint">Пока не загружено</div>
          )}
        </div>
      ))}
    </div>
  );
}
