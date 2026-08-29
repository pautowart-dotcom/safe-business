import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, BackBtn, Badge, Btn, Field, TextInput, Select, Icon, C } from '../ui/components.jsx';
import MyDeadlinesTab from './MyDeadlines.jsx';
import { segmentForNiche } from '../ui/nicheOptions.js';

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
      { key: 'tattoo', label: 'Тату, пирсинг и ПМ' },
      { key: 'depilation', label: 'Депиляция' },
      { key: 'solarium', label: 'Солярий' },
      { key: 'barbershop', label: 'Барбершоп' },
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
  {
    key: 'cleaning', label: 'Клининг',
    niches: [
      { key: 'cleaning_basic', label: 'Уборка помещений (жильё и офисы)' },
    ],
  },
  { key: 'retail', label: 'Розничная торговля', niches: [] },
  {
    key: 'food', label: 'Общепит',
    niches: [
      { key: 'cafe_basic', label: 'Кафе, кофейня, столовая (без алкоголя)' },
    ],
  },
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

// Кнопка "купить один раз" убрана отсюда 19.08.2026 (решение владельца) —
// для уже зарегистрированного владельца разовая покупка не нужна: если он
// готов регистрироваться, он либо подписывается, либо нет, отдельного
// промежуточного варианта тут не требуется. Сам механизм разовой покупки
// (checkout-one-time, миграция 0091) не удалён — им пользуется публичный
// анонимный аудит без регистрации (AnonymousAudit.jsx, /lk/audit), для
// которого он и был на самом деле задуман.
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
  const location = useLocation();
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
  // 10.08.2026: "Открытие ещё одной точки" обкатывается тихо — видно только
  // на компаниях, помеченных is_test (владелец ставит флаг вручную через
  // /office, PATCH /admin/companies/:id/test-flag, миграция 0067). Когда
  // решит показать всем — убрать этот флаг из условия рендера карточки ниже,
  // остальной код (роуты/движок) трогать не придётся.
  const [isTestCompany, setIsTestCompany] = useState(false);
  // Ниша, выбранная на регистрации (20.08.2026, companies.signup_niche) —
  // предзаполняет форму сегментации ниже, чтобы не спрашивать нишу дважды.
  const [signupNiche, setSignupNiche] = useState(null);
  const [pdfPaywall, setPdfPaywall] = useState(false);
  // Пакет 4, Этап 2: два таба верхнего уровня внутри "Безопасности" — "Тест"
  // (существующая панель ниже) и новая "Мои сроки". Таб переключается только
  // в устойчивом состоянии панели — во время прохождения теста/результата/
  // формы сегментации верхних табов нет, это отдельные полноэкранные шаги.
  // Переход из "Дедлайнов" (карточка "уточните форму бизнеса") — сразу
  // открываем вкладку "Мои сроки", а не общий тест (location.state, не URL
  // query — тут не нужна постоянная ссылка, только разовая передача при
  // навигации).
  const [topTab, setTopTab] = useState(location.state?.tab || 'test');

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
      setIsTestCompany(!!companyRes.data?.is_test);
      setSignupNiche(companyRes.data?.signup_niche || null);
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
    // Профиля ещё нет (свежая компания) — предзаполняем нишу/сегмент тем,
    // что выбрали на регистрации (companies.signup_niche), чтобы не
    // спрашивать одно и то же дважды; legalForm/workModel всё равно нужно
    // выбрать здесь — их на регистрации не спрашивали (лишняя форма).
    const initial = profile || (signupNiche ? { niches: [signupNiche], segment: segmentForNiche(signupNiche) } : null);
    return (
      <SegmentationForm
        initial={initial}
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
          isTestCompany={isTestCompany}
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
  const { refreshNiches, refreshModules } = useAuth();
  const [legalForm, setLegalForm] = useState(initial?.legalForm || '');
  const [workModel, setWorkModel] = useState(initial?.workModel || '');
  const [segment, setSegment] = useState(initial?.segment || '');
  const [niches, setNiches] = useState(initial?.niches || []);
  const [hairChemicalTreatments, setHairChemicalTreatments] = useState(initial?.hairChemicalTreatments || false);
  const [stubMessage, setStubMessage] = useState('');
  const [error, setError] = useState('');

  const segmentContent = SEGMENTS.find((s) => s.key === segment);
  const multiNiche = !!segmentContent?.multiNiche;
  const showHairChemicalQuestion = niches.includes('hair');

  async function submit() {
    setError('');
    try {
      const { data } = await api.post('/modules/security/profile', {
        legalForm, workModel, segment, niches, hairChemicalTreatments,
      });
      // Термин "Мастер"/"Сотрудник" (ui/roleLabels.js) зависит от ниши, а
      // выбор ниши "Клининг" сам включает модуль "Заявки" на бэкенде
      // (ensureNicheModules, security.routes.js) — обновляем оба сразу, не
      // дожидаясь следующего логина/select-company, иначе ни термин, ни
      // пункт меню "Заявки" не появятся до перезахода в этой же сессии.
      await Promise.all([refreshNiches(), refreshModules()]);
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
      {showHairChemicalQuestion && (
        <Field label="Оказываете кератиновое выпрямление, ботокс для волос или другие процедуры с составами на основе формальдегида?">
          <Chips
            options={[{ key: 'yes', label: 'Да' }, { key: 'no', label: 'Нет' }]}
            value={hairChemicalTreatments ? 'yes' : 'no'}
            onChange={(v) => setHairChemicalTreatments(v === 'yes')}
            valueKey="key"
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
  profile, status, violations, documents, documentSections, products, isManagement, hasPaidPlan, isTestCompany, pdfPaywall, error,
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
        {[['overview', 'Обзор'], ['violations', `Нарушения (${openCount})`], ['documents', 'Документы'], ['inspection', 'Если проверка']].map(([k, l]) => (
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
        <OverviewTab profile={profile} status={status} products={products} isManagement={isManagement} hasPaidPlan={hasPaidPlan} isTestCompany={isTestCompany} pdfPaywall={pdfPaywall} onStartAudit={onStartAudit} onJoinWaitlist={onJoinWaitlist} onDownloadReport={onDownloadReport} onGoSubscribe={onGoSubscribe} />
      )}
      {tab === 'violations' && <ViolationsTab violations={violations} isManagement={isManagement} onResolve={onResolveViolation} />}
      {tab === 'documents' && <DocumentsTab documents={documents} sections={documentSections} isManagement={isManagement} onChange={onDocumentsChange} />}
      {tab === 'inspection' && <InspectionGuidesTab />}
    </div>
  );
}

// "Если проверка" (12.08.2026) — не завязано на нишу/подписку, но роут
// GET /inspection-guides наследует owner-only гейт всего модуля security
// (requireRole('owner') в security.routes.js, политика конфиденциальности
// §8.4) — эта вкладка физически доступна только владельцу, как и остальной
// модуль, хотя по смыслу пригодилась бы любому, кто на месте во время
// реальной проверки. Открыть на другие роли — отдельное решение про
// периметр политики §8.4, не делаем незаметно попутно. Черновик — юрист не
// проверял (см. backend/src/modules/security/content/inspectionGuides.js).
function InspectionGuidesTab() {
  const [data, setData] = useState(undefined);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    api.get('/modules/security/inspection-guides')
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, []);

  if (data === undefined) return <div style={{ fontSize: 13, color: C.subtle, padding: '20px 0' }}>Загрузка…</div>;
  if (!data) return <div style={{ fontSize: 13, color: C.secondary, padding: '20px 0' }}>Не удалось загрузить.</div>;

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <ST>Если пришла проверка</ST>
          <Badge color="#B7950B" bg="#FCF3CF">черновик</Badge>
        </div>
        <div style={{ fontSize: 12, color: '#B7950B', marginBottom: 12 }}>
          Общая инструкция, юрист её не проверял. Не заменяет консультацию юриста, но помогает не растеряться в моменте.
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>Общие права при любой проверке</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          {data.generalRights.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
        </ul>
      </Card>

      {data.guides.map((g) => (
        <Card key={g.key}>
          <div onClick={() => setOpenKey(openKey === g.key ? null : g.key)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ST>{g.authority}</ST>
            <span style={{ fontSize: 18, color: C.subtle }}>{openKey === g.key ? '−' : '+'}</span>
          </div>
          <div style={{ fontSize: 13, color: C.secondary, marginTop: 4 }}>{g.whatTheyCheck}</div>

          {openKey === g.key && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 4 }}>Когда обычно приходят</div>
              <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>{g.typicalTrigger}</div>

              <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 4 }}>Перед тем как впустить</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
                {g.beforeYouLetThemIn.map((x, i) => <li key={i}>{x}</li>)}
              </ul>

              <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 4 }}>Во время проверки</div>
              <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
                {g.duringInspection.map((x, i) => <li key={i}>{x}</li>)}
              </ul>

              <div style={{ fontSize: 11, color: C.subtle }}>Основание: {g.lawReference}</div>
            </div>
          )}
        </Card>
      ))}

      <Card>
        <ST>После проверки</ST>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.secondary, lineHeight: 1.6 }}>
          {data.afterInspection.map((r, i) => <li key={i} style={{ marginBottom: 6 }}>{r}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function OverviewTab({ profile, status, products, isManagement, hasPaidPlan, isTestCompany, pdfPaywall, onStartAudit, onJoinWaitlist, onDownloadReport, onGoSubscribe }) {
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

      <OpeningRoadmapCard isManagement={isManagement} hasPaidPlan={hasPaidPlan} isTestCompany={isTestCompany} onGoSubscribe={onGoSubscribe} />
      <SharePassportCard isManagement={isManagement} isTestCompany={isTestCompany} />
      <FranchiseCard isManagement={isManagement} isTestCompany={isTestCompany} />

      <DocumentTemplatesCard isManagement={isManagement} />
      <DocumentRiskCheckCard isManagement={isManagement} />

      {/* "Подписка «Спокойствие»" убрана как отдельный продукт (12.08.2026,
          решение владельца) — избыточна поверх уже существующей базовой
          подписки. Её смысл распадается на два будущих направления, не один
          продукт: отслеживание изменений закона — отдельный движок (см.
          docs/law-monitoring-engine, law-compliance-monitor), отслеживание
          новых версий шаблонов документов — уведомление клиенту +
          возможная доп.продажа перегенерации, часть document-templates. */}

      <div style={{ fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 }}>
        Сервис не заменяет юриста, бухгалтера или специалиста по охране труда.
      </div>
    </div>
  );
}

// "Открытие ещё одной точки" — 10.08.2026: раздел "Филиалы" убран из продукта
// (Layout.jsx), поэтому это не отдельная сущность/раздел, а бесстейтовая
// карточка внутри уже существующего "Обзора": backend сам берёт нишу/юрформу/
// модель работы из уже сохранённого профиля компании (см.
// modules/security/report.routes.js GET /opening-roadmap) — никаких вопросов
// заново. hasPaidPlan/402 — тот же паттерн, что downloadPdf/PdfPaywallNotice
// выше в этом файле.
// Разовая покупка (см. PdfPaywallNotice/buyOnce) НЕ применяется здесь — она
// привязана к id конкретного отчёта security_reports (миграция 0091), а
// roadmap-PDF ("открытие ещё одной точки") — отдельный ресурс без такого id.
// Этот PDF остаётся доступен только по настоящей подписке.
function OpeningRoadmapCard({ isManagement, hasPaidPlan, isTestCompany, onGoSubscribe }) {
  const [roadmap, setRoadmap] = useState(null);
  const [nicheChoice, setNicheChoice] = useState(null);
  const [selectedNiche, setSelectedNiche] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfPaywall, setPdfPaywall] = useState(false);

  // Тихая обкатка (10.08.2026) — видно только на компаниях с is_test=true.
  if (!isManagement || !isTestCompany) return null;

  async function load(niche) {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/modules/security/opening-roadmap', { params: niche ? { niche } : {} });
      if (data.needNicheChoice) {
        setNicheChoice(data.niches);
        setRoadmap(null);
        return;
      }
      setNicheChoice(null);
      setRoadmap(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось построить чек-лист');
    } finally {
      setLoading(false);
    }
  }

  async function downloadRoadmapPdf() {
    setError('');
    try {
      const res = await api.get('/modules/security/opening-roadmap/pdf', {
        params: selectedNiche ? { niche: selectedNiche } : {},
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'roadmap-novoy-tochki.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 402) {
        setPdfPaywall(true);
        return;
      }
      setError(err.response?.data?.error || 'Не удалось скачать PDF');
    }
  }

  return (
    <Card>
      <ST>Открытие ещё одной точки</ST>

      {!roadmap && !nicheChoice && (
        <div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
            Чек-лист под новый адрес — та же ниша и форма работы, что уже указаны у вас, без повторной регистрации.
          </div>
          <Btn small variant="secondary" onClick={() => load()} disabled={loading}>
            {loading ? 'Считаем…' : 'Показать чек-лист'}
          </Btn>
        </div>
      )}

      {nicheChoice && (
        <div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>У вас несколько ниш — для какой нужен чек-лист?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {nicheChoice.map((n) => (
              <Btn key={n.key} small variant="secondary" onClick={() => { setSelectedNiche(n.key); load(n.key); }}>
                {n.label}
              </Btn>
            ))}
          </div>
        </div>
      )}

      {roadmap && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <Btn small onClick={downloadRoadmapPdf}>{hasPaidPlan ? 'Скачать PDF' : 'Скачать PDF 🔒'}</Btn>
            <Btn small variant="secondary" onClick={() => { setRoadmap(null); setNicheChoice(null); }}>Свернуть</Btn>
          </div>
          {pdfPaywall && <div style={{ marginBottom: 10 }}><PdfPaywallNotice onSubscribe={onGoSubscribe} /></div>}
          {roadmap.stages.map((stage) => (
            <div key={stage.weekLabel} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                {stage.weekLabel} · {stage.title}
              </div>
              {stage.items.map((item, i) => (
                <div key={i} style={{ fontSize: 13, color: C.secondary, padding: '3px 0' }}>
                  · {item.title}{item.durationNote ? ` (${item.durationNote})` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

// "Паспорт бизнеса" — 10.08.2026, тихая обкатка за is_test. Расширяет
// политику конфиденциальности §8.4 явным действием владельца ("поделиться"),
// см. modules/security/security.routes.js GET/POST/DELETE /share и
// businessPassport.routes.js (публичная сторона отдаёт только агрегаты,
// не сами нарушения).
function SharePassportCard({ isManagement, isTestCompany }) {
  const [shareToken, setShareToken] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isManagement || !isTestCompany) return;
    api.get('/modules/security/share')
      .then(({ data }) => setShareToken(data.shareToken))
      .catch(() => setShareToken(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagement, isTestCompany]);

  if (!isManagement || !isTestCompany) return null;

  async function enable() {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/modules/security/share');
      setShareToken(data.shareToken);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать ссылку');
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    setError('');
    try {
      await api.delete('/modules/security/share');
      setShareToken(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отключить');
    } finally {
      setLoading(false);
    }
  }

  const shareUrl = shareToken ? `${window.location.origin}/business-passport.html?token=${shareToken}` : '';
  const badgeUrl = shareToken ? `${window.location.origin}/api/platform/business-passport/${shareToken}/badge.svg` : '';
  const embedCode = shareToken ? `<a href="${shareUrl}"><img src="${badgeUrl}" alt="Безопасный бизнес"></a>` : '';

  return (
    <Card>
      <ST>Паспорт бизнеса</ST>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
        Публичная ссылка со сводкой (индекс безопасности, зона, сколько устранено) — для арендодателя, франчайзера или покупателя. Без деталей нарушений и штрафов.
      </div>
      {shareToken === undefined ? null : shareToken ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <input readOnly value={shareUrl} onClick={(e) => e.target.select()} style={{ flex: 1, minWidth: 200, fontSize: 12, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, color: C.secondary }} />
            <Btn small variant="secondary" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Копировать</Btn>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>Бейдж для сайта или соцсетей</div>
          <img src={badgeUrl} alt="Бейдж «Безопасный бизнес»" style={{ display: 'block', marginBottom: 10, borderRadius: 8 }} />
          <textarea
            readOnly
            value={embedCode}
            onClick={(e) => e.target.select()}
            style={{ width: '100%', fontSize: 11, padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, color: C.secondary, minHeight: 56, resize: 'vertical', marginBottom: 14, fontFamily: 'monospace' }}
          />

          <Btn small variant="secondary" onClick={disable} disabled={loading}>Отключить ссылку</Btn>
        </div>
      ) : (
        <Btn small variant="secondary" onClick={enable} disabled={loading}>{loading ? 'Секунду…' : 'Создать ссылку'}</Btn>
      )}
      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

// "Франшиза" — 11.08.2026, тихая обкатка за is_test (и у владеющей компании,
// и у каждой точки-партнёра — обе стороны сидят за requireTestCompany на
// backend). Франшиза принадлежит КОМПАНИИ, не пользователю — "свой аккаунт"
// у владельца франшизы это его обычный владельческий аккаунт, без нового
// типа входа. Партнёр сам подаёт заявку по коду, франшизер подтверждает —
// см. backend/src/platform/franchise.routes.js.
function FranchiseCard({ isManagement, isTestCompany }) {
  const [data, setData] = useState(undefined);
  const [summary, setSummary] = useState(null);
  const [network, setNetwork] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [mode, setMode] = useState(null); // null | 'create' | 'join'

  function load() {
    return api.get('/platform/franchise')
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }

  useEffect(() => {
    if (!isManagement || !isTestCompany) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagement, isTestCompany]);

  if (!isManagement || !isTestCompany) return null;

  async function createFranchise() {
    setLoading(true);
    setError('');
    try {
      await api.post('/platform/franchise', { name: nameInput });
      setNameInput('');
      setMode(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать франшизу');
    } finally {
      setLoading(false);
    }
  }

  async function joinByCode() {
    setLoading(true);
    setError('');
    try {
      await api.post('/platform/franchise/join-requests', { joinCode: codeInput });
      setCodeInput('');
      setMode(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить заявку');
    } finally {
      setLoading(false);
    }
  }

  async function decide(requestId, status) {
    setLoading(true);
    setError('');
    try {
      await api.patch(`/platform/franchise/join-requests/${requestId}`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось обработать заявку');
    } finally {
      setLoading(false);
    }
  }

  async function leave() {
    setLoading(true);
    setError('');
    try {
      await api.delete('/platform/franchise/membership');
      setSummary(null);
      setNetwork(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось выполнить действие');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const { data } = await api.get('/platform/franchise/summary');
      setSummary(data.members);
      setNetwork(data.network);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить сводку');
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <Card>
      <ST>Франшиза</ST>

      {data === undefined && null}

      {data && data.owned && (
        <div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
            «{data.owned.name}» — код приглашения для партнёров:
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <input readOnly value={data.owned.joinCode} onClick={(e) => e.target.select()} style={{ flex: 1, maxWidth: 160, fontSize: 14, fontWeight: 700, letterSpacing: '1px', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, color: C.primary }} />
            <Btn small variant="secondary" onClick={() => navigator.clipboard?.writeText(data.owned.joinCode)}>Копировать</Btn>
          </div>

          {data.owned.pendingRequests.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>Заявки на вступление</div>
              {data.owned.pendingRequests.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ fontSize: 13 }}>{r.companyName}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn small onClick={() => decide(r.id, 'approved')} disabled={loading}>Принять</Btn>
                    <Btn small variant="secondary" onClick={() => decide(r.id, 'rejected')} disabled={loading}>Отклонить</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>
            Точки франшизы {data.owned.members.length > 0 ? `(${data.owned.members.length})` : ''}
          </div>
          {data.owned.members.length === 0 ? (
            <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>Пока никто не вступил.</div>
          ) : !summary ? (
            <Btn small variant="secondary" onClick={loadSummary} disabled={summaryLoading}>{summaryLoading ? 'Считаем…' : 'Показать сводку по безопасности'}</Btn>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {network && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 10, borderRadius: 10, background: C.surface }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{network.averageIndexPercent != null ? `${network.averageIndexPercent}%` : '—'}</div>
                    <div style={{ fontSize: 11, color: C.subtle }}>средний индекс по сети{network.pointsUntested > 0 ? ` · ${network.pointsUntested} без теста` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {network.zoneCounts.green > 0 && <Badge color={ZONE_COLOR.green} bg={ZONE_BG.green}>{network.zoneCounts.green}</Badge>}
                    {network.zoneCounts.yellow > 0 && <Badge color={ZONE_COLOR.yellow} bg={ZONE_BG.yellow}>{network.zoneCounts.yellow}</Badge>}
                    {network.zoneCounts.red > 0 && <Badge color={ZONE_COLOR.red} bg={ZONE_BG.red}>{network.zoneCounts.red}</Badge>}
                  </div>
                </div>
              )}
              {summary.map((m) => (
                <div key={m.companyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13 }}>{m.companyName}</span>
                  {m.indexPercent != null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge color={ZONE_COLOR[m.zone]} bg={ZONE_BG[m.zone]}>{ZONE_LABELS[m.zone]}</Badge>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{m.indexPercent}%</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: C.subtle }}>ещё не проходили тест</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Btn small variant="secondary" onClick={leave} disabled={loading}>Расформировать франшизу</Btn>
          </div>
        </div>
      )}

      {data && data.memberOf && (
        <div>
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>Вы состоите во франшизе «{data.memberOf.name}».</div>
          <Btn small variant="secondary" onClick={leave} disabled={loading}>Выйти из франшизы</Btn>
        </div>
      )}

      {data && data.pendingRequestSent && (
        <div style={{ fontSize: 13, color: C.secondary }}>
          Заявка на вступление во франшизу «{data.pendingRequestSent.name}» отправлена, ждём подтверждения.
        </div>
      )}

      {data && !data.owned && !data.memberOf && !data.pendingRequestSent && (
        <div>
          {!mode && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn small variant="secondary" onClick={() => setMode('create')}>Создать франшизу</Btn>
              <Btn small variant="secondary" onClick={() => setMode('join')}>Подать заявку по коду</Btn>
            </div>
          )}
          {mode === 'create' && (
            <div>
              <Field label="Название франшизы">
                <TextInput value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Например, «Чистые руки»" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={createFranchise} disabled={loading || !nameInput.trim()}>{loading ? 'Секунду…' : 'Создать'}</Btn>
                <Btn small variant="secondary" onClick={() => setMode(null)}>Отмена</Btn>
              </div>
            </div>
          )}
          {mode === 'join' && (
            <div>
              <Field label="Код приглашения от франшизера">
                <TextInput value={codeInput} onChange={(e) => setCodeInput(e.target.value)} placeholder="Например, A1B2C3D4" />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={joinByCode} disabled={loading || !codeInput.trim()}>{loading ? 'Секунду…' : 'Подать заявку'}</Btn>
                <Btn small variant="secondary" onClick={() => setMode(null)}>Отмена</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </Card>
  );
}

const RISK_CHECK_DOCUMENT_TYPES = [
  ['labor_contract', 'Трудовой договор'],
  ['lease', 'Договор аренды'],
  ['supplier_contract', 'Договор с поставщиком/подрядчиком'],
  ['other', 'Другой документ'],
];

// "Проверка документа на риски" (19.08.2026, п.6 плана, часть B) — в
// отличие от "Объяснить простыми словами" у шаблонов документов (которая
// работает с текстом ШАБЛОНА, без данных компании), здесь владелец сам
// загружает произвольный документ (например, договор с арендодателем) —
// ИИ ищет только отсутствующие ОБЯЗАТЕЛЬНЫЕ ПО ЗАКОНУ пункты, не оценивает
// выгодность условий (см. system-промпт в document-risk-check.routes.js).
// Бесплатно — тот же принцип, что у остального ИИ-контента в этом разделе.
function DocumentRiskCheckCard({ isManagement }) {
  const [checks, setChecks] = useState(null);
  const [documentType, setDocumentType] = useState('other');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);

  function load() {
    api.get('/modules/security/document-risk-checks').then((res) => setChecks(res.data));
  }

  useEffect(() => {
    if (!isManagement) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagement]);

  // Пока есть проверки в статусе "обрабатывается" — досчитываем в фоне
  // (POST отвечает сразу с id, сам вызов ИИ идёт после ответа, см. backend).
  useEffect(() => {
    if (!checks || !checks.some((c) => c.status === 'pending')) return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [checks]);

  if (!isManagement) return null;

  async function upload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      await api.post('/modules/security/document-risk-checks', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить документ');
    } finally {
      setUploading(false);
    }
  }

  async function openCheck(id) {
    if (openId === id) {
      setOpenId(null);
      setOpenDetail(null);
      return;
    }
    setOpenId(id);
    setOpenDetail(null);
    const { data } = await api.get(`/modules/security/document-risk-checks/${id}`);
    setOpenDetail(data);
  }

  async function remove(id) {
    if (!confirm('Удалить проверку? Загруженный файл тоже удалится.')) return;
    await api.delete(`/modules/security/document-risk-checks/${id}`);
    if (openId === id) {
      setOpenId(null);
      setOpenDetail(null);
    }
    load();
  }

  return (
    <Card>
      <ST>Проверка документа на риски</ST>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
        Загрузите договор (PDF или DOCX с текстовым слоем, не скан/фото) — ИИ проверит, каких обязательных
        по закону пунктов не хватает. Это не юридическая консультация, только сигнал, на что обратить
        внимание перед подписанием.
      </div>

      <Field label="Тип документа">
        <Select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          {RISK_CHECK_DOCUMENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Файл (PDF или DOCX)">
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Field>
      {error && <div className="alert alert-error">{error}</div>}
      <Btn small onClick={upload} disabled={!file || uploading}>{uploading ? 'Загружаем…' : 'Загрузить и проверить'}</Btn>

      {checks && checks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {checks.map((c) => (
            <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{c.originalFilename}</div>
                  <div style={{ fontSize: 12, color: C.subtle }}>{c.documentTypeLabel} · {new Date(c.createdAt).toLocaleDateString('ru-RU')}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  {c.status === 'pending' && <span style={{ fontSize: 12, color: C.subtle }}>Обрабатывается…</span>}
                  {c.status === 'failed' && <span style={{ fontSize: 12, color: C.red }}>Ошибка</span>}
                  {c.status === 'done' && (
                    <button onClick={() => openCheck(c.id)} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, cursor: 'pointer', fontSize: 12, padding: 0 }}>
                      {openId === c.id ? 'Скрыть' : 'Показать результат'}
                    </button>
                  )}
                  <button onClick={() => remove(c.id)} style={{ background: 'none', border: 'none', color: C.subtle, cursor: 'pointer', fontSize: 12, padding: 0 }}>Удалить</button>
                </div>
              </div>
              {c.status === 'failed' && c.errorMessage && (
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>{c.errorMessage}</div>
              )}
              {openId === c.id && (
                openDetail?.id === c.id ? (
                  <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', marginTop: 8, fontSize: 13, color: C.secondary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {openDetail.riskAnalysis}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>Загрузка…</div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Тихая обкатка снята 13.08.2026 (решение владельца) — доступно всем
// компаниям, вместе с backend-гейтом в document-templates.routes.js.
function DocumentTemplatesCard({ isManagement }) {
  const [templates, setTemplates] = useState(null);
  const [generated, setGenerated] = useState([]);
  const [addon, setAddon] = useState(null);
  const [payingAddon, setPayingAddon] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  // Объяснения по ключу шаблона (19.08.2026, п.6 плана) — { loading, text,
  // error } на каждый t.key, запрашивается лениво по клику, не все сразу.
  const [explanations, setExplanations] = useState({});

  async function explainTemplate(key) {
    if (explanations[key]?.text || explanations[key]?.loading) return;
    setExplanations((prev) => ({ ...prev, [key]: { loading: true } }));
    try {
      const { data } = await api.get(`/modules/document-templates/templates/${key}/explain`);
      if (!data.aiConfigured) {
        setExplanations((prev) => ({ ...prev, [key]: { loading: false, error: 'Объяснения от ИИ пока не подключены' } }));
      } else if (data.error || !data.explanation) {
        setExplanations((prev) => ({ ...prev, [key]: { loading: false, error: data.error || 'Не удалось получить объяснение' } }));
      } else {
        setExplanations((prev) => ({ ...prev, [key]: { loading: false, text: data.explanation } }));
      }
    } catch (err) {
      setExplanations((prev) => ({ ...prev, [key]: { loading: false, error: err.response?.data?.error || 'Не удалось получить объяснение' } }));
    }
  }

  function load() {
    Promise.all([
      api.get('/modules/document-templates/templates'),
      api.get('/modules/document-templates/generated'),
      api.get('/platform/addons'),
    ])
      .then(([t, g, a]) => {
        setTemplates(t.data);
        setGenerated(g.data);
        setAddon(a.data.find((x) => x.addonKey === 'document_templates') || null);
        setError('');
      })
      .catch((err) => {
        setTemplates([]);
        setError(err.response?.data?.error || `Не удалось загрузить шаблоны (${err.response?.status || 'ошибка сети'})`);
      });
  }

  async function payForAddon() {
    setPayingAddon(true);
    setError('');
    try {
      const { data } = await api.post('/platform/addons/document_templates/checkout');
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать оплату');
      setPayingAddon(false);
    }
  }

  useEffect(() => {
    if (!isManagement) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManagement]);

  if (!isManagement) return null;

  async function submit(template) {
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/modules/document-templates/generate', {
        templateKey: template.key,
        data: formData,
      });
      setLastResult(data);
      setOpenKey(null);
      setFormData({});
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сформировать документ');
    } finally {
      setSubmitting(false);
    }
  }

  // Не добавляем документ в "Мои документы" автоматически сразу при
  // генерации — владелец мог сформировать его "на пробу". Спрашиваем явно
  // (и здесь, сразу после генерации, и в списке "Ранее сгенерированные"
  // для тех, кто пропустил вопрос в первый раз) — без этого клиент может
  // не понять, что документ вообще нужно куда-то добавлять.
  async function addToDocuments(id, setLocalId) {
    setError('');
    try {
      const { data } = await api.post(`/modules/document-templates/generated/${id}/add-to-documents`);
      setLocalId(data.securityDocumentId);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось добавить в «Мои документы»');
    }
  }

  // Удаляет только запись из истории генерации — если документ уже
  // добавлен в "Мои документы", та копия остаётся (у неё своя кнопка
  // удаления во вкладке "Документы").
  async function removeGenerated(id) {
    if (!confirm('Удалить документ из истории генерации? Файл, который вы уже скачали, останется у вас на компьютере.')) return;
    setError('');
    try {
      await api.delete(`/modules/document-templates/generated/${id}`);
      if (lastResult?.id === id) setLastResult(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось удалить документ');
    }
  }

  return (
    <Card>
      <ST>Шаблоны документов</ST>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 12 }}>
        Документы, заполненные данными вашего бизнеса, по вашей нише. Это не свободная генерация текста ИИ — фиксированные шаблоны с полями.
      </div>

      {templates === null && <div style={{ fontSize: 13, color: C.subtle }}>Загрузка…</div>}
      {templates && templates.length === 0 && (
        <div style={{ fontSize: 13, color: C.secondary }}>Для вашей ниши шаблонов пока нет.</div>
      )}

      {addon && !addon.purchased && templates && templates.length > 0 && (
        <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Доступ ко всем документам вашей ниши — разовая оплата {addon.priceRub.toLocaleString('ru-RU')} ₽, без подписки. Оплачивается один раз, дальше документы доступны без ограничений.
          </div>
          <Btn small onClick={payForAddon} disabled={payingAddon}>{payingAddon ? 'Секунду…' : `Оплатить доступ — ${addon.priceRub.toLocaleString('ru-RU')} ₽`}</Btn>
        </div>
      )}

      {templates && templates.map((t) => (
        <div key={t.key} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
            {t.status === 'draft' ? (
              <Badge color="#B7950B" bg="#FCF3CF">бета</Badge>
            ) : (
              <Badge color={C.green} bg={C.greenBg}>проверено юристом</Badge>
            )}
          </div>
          {t.status === 'draft' && (
            <div style={{ fontSize: 12, color: '#B7950B', marginBottom: 6 }}>
              Бета-версия шаблона — дорабатывается и уточняется. Не является юридической консультацией и не гарантирует прохождение проверки или суда.
            </div>
          )}
          {t.lawReference && <div style={{ fontSize: 11, color: C.subtle, marginBottom: 6 }}>Основание: {t.lawReference}</div>}

          {!explanations[t.key]?.text && (
            <button
              type="button"
              onClick={() => explainTemplate(t.key)}
              disabled={explanations[t.key]?.loading}
              style={{ display: 'block', background: 'none', border: 'none', color: C.primary, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 12, marginBottom: 8 }}
            >
              {explanations[t.key]?.loading ? 'Спрашиваем ИИ…' : 'Объяснить простыми словами'}
            </button>
          )}
          {explanations[t.key]?.error && (
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>{explanations[t.key].error}</div>
          )}
          {explanations[t.key]?.text && (
            <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', marginBottom: 8, fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
              {explanations[t.key].text}
            </div>
          )}

          {!addon || !addon.purchased ? (
            <Btn small variant="secondary" disabled>Заполнить и сгенерировать 🔒</Btn>
          ) : openKey !== t.key ? (
            <Btn small variant="secondary" onClick={() => { setOpenKey(t.key); setFormData({}); setError(''); }}>Заполнить и сгенерировать</Btn>
          ) : (
            <div style={{ marginTop: 8 }}>
              {t.fields.map((f) => (
                <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                  <TextInput
                    value={formData[f.key] || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </Field>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={() => submit(t)} disabled={submitting}>{submitting ? 'Секунду…' : 'Сгенерировать PDF'}</Btn>
                <Btn small variant="secondary" onClick={() => setOpenKey(null)}>Отмена</Btn>
              </div>
            </div>
          )}
        </div>
      ))}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}

      {lastResult && (
        <div className="alert" style={{ marginTop: 10 }}>
          <div style={{ marginBottom: lastResult.securityDocumentId ? 0 : 8 }}>
            «{lastResult.templateTitle}» готов — <a href={lastResult.downloadUrl} target="_blank" rel="noreferrer">скачать PDF</a>
          </div>
          {lastResult.securityDocumentId ? (
            <div style={{ fontSize: 12, color: C.secondary }}>Добавлен в «Мои документы».</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13 }}>Добавить его в «Мои документы»?</span>
              <Btn small onClick={() => addToDocuments(lastResult.id, (id) => setLastResult((prev) => ({ ...prev, securityDocumentId: id })))}>Да, добавить</Btn>
            </div>
          )}
        </div>
      )}

      {generated.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>Ранее сгенерированные</div>
          {generated.map((g) => (
            <div key={g.id} style={{ padding: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13 }}>{g.templateTitle} · {new Date(g.generatedAt).toLocaleDateString('ru-RU')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <a href={g.downloadUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.primary, fontWeight: 700 }}>Скачать</a>
                  <button
                    type="button"
                    onClick={() => removeGenerated(g.id)}
                    style={{ background: 'none', border: 'none', color: C.red, fontSize: 13, cursor: 'pointer', padding: 0 }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
              {!g.securityDocumentId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: C.subtle }}>Не добавлен в «Мои документы»</span>
                  <button
                    type="button"
                    onClick={() => addToDocuments(g.id, (id) => setGenerated((prev) => prev.map((x) => (x.id === g.id ? { ...x, securityDocumentId: id } : x))))}
                    style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: 0 }}
                  >
                    Добавить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
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

  // Проверка на риски — часть 1 (19.08.2026, п.6 плана, уточнение владельца
  // "не хватает обязательных пунктов/документов по закону"): чисто
  // механическое сравнение "что требуется по нише" (sections, уже
  // рассчитано на бэкенде из mandatory-documents/*.js) с "что реально
  // загружено" (documents) — без ИИ, потому что это детерминированный
  // подсчёт, не текстовый анализ. ИИ пригодится для части 2 (риски во
  // внешних документах вроде договоров) — то отдельная, более крупная и
  // юридически рискованная задача, не в этом заходе.
  const missingCategories = categories.filter((c) => !byCategory[c] || byCategory[c].length === 0);

  return (
    <div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 12 }}>
        Разделы соответствуют структуре отчёта — так видно, какие документы относятся к каждой категории требований.
      </div>
      {missingCategories.length > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>
          Не хватает документов в {missingCategories.length} из {categories.length} категорий: {missingCategories.join(', ')}.
        </div>
      )}
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
