import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card, Btn, TextInput, Field, Select, Badge, C, F } from '../ui/components.jsx';
import { NICHE_OPTIONS } from '../ui/nicheOptions.js';

// Разовый аудит без регистрации (19.08.2026, п.5 плана, переделано по явному
// уточнению владельца) — публичная страница, НЕ обёрнута в PrivateRoute/
// Layout, не читает и не пишет localStorage.getItem('token') (общий ключ
// авторизованного приложения) — свой собственный axios-инстанс с токеном
// гостевого аккаунта в замыкании, чтобы никак не задеть уже залогиненную
// сессию в том же браузере. Технически за кулисами всё равно заводится
// обычная компания/пользователь/членство (POST /platform/anonymous-audit/
// start), дальше эта же страница ведёт токен через ВСЕ уже существующие
// роуты модуля "Безопасность" без единого изменения там — тот же тест,
// тот же скоринг, тот же PDF, та же разовая покупка (миграция 0091).
const guestApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

// NICHE_OPTIONS — общий список (ui/nicheOptions.js), только ниши с готовым
// контентом теста (paidAudit: true) — анонимному платному продукту незачем
// вести на "лист ожидания".
const LEGAL_FORM_OPTIONS = [
  ['self_employed', 'Самозанятый'],
  ['ip', 'ИП'],
  ['ooo', 'ООО'],
];
const WORK_MODEL_OPTIONS = [
  ['alone', 'Работаю один'],
  ['employees', 'Есть сотрудники'],
  ['sublet', 'Сдаю рабочие места'],
  ['mixed', 'Смешанная модель'],
];
const PRICE_RUB = 1990;
const ZONE_LABELS = { green: 'Зелёная зона', yellow: 'Жёлтая зона', red: 'Красная зона' };
const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };

function IntroStep({ niche, setNiche, legalForm, setLegalForm, workModel, setWorkModel, onStart, starting, error }) {
  return (
    <Card>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Разовый аудит безопасности бизнеса</div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16, lineHeight: 1.5 }}>
        Полный тест по вашей нише — бесплатно, сразу видно индекс безопасности и карту нарушений. Захотите
        подробный PDF-отчёт с планом устранения — {PRICE_RUB} ₽ разово, без подписки. Регистрация не нужна,
        только email в конце, если решите скачать отчёт.
      </div>

      <Field label="Ниша">
        <Select value={niche} onChange={(e) => setNiche(e.target.value)}>
          <option value="">Выберите нишу</option>
          {NICHE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Форма работы">
        <Select value={legalForm} onChange={(e) => setLegalForm(e.target.value)}>
          <option value="">Выберите</option>
          {LEGAL_FORM_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Модель работы">
        <Select value={workModel} onChange={(e) => setWorkModel(e.target.value)}>
          <option value="">Выберите</option>
          {WORK_MODEL_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </Field>

      {error && <div className="alert alert-error">{error}</div>}
      <Btn onClick={onStart} disabled={starting}>{starting ? 'Начинаем…' : 'Начать тест'}</Btn>
    </Card>
  );
}

// Кнопка отправки вынесена из Card в отдельный sticky-футер (24.08.2026 —
// живой разбор воронки после рилса: на реальном телефоне кнопка в конце
// длинного списка вопросов оказывалась на самом краю экрана или за ним,
// частично перекрыта панелью браузера — 40 прошли тест, ни один не дошёл до
// оплаты. Тот же приём, что у нижнего меню в основном приложении
// (position:sticky/fixed + safe-area-inset-bottom), только здесь sticky, а
// не fixed — страница сама скроллится (height:100vh;overflowY:auto на
// корневом div), sticky относительно этого же контейнера держит кнопку
// видимой у низа экрана в любой момент, не только в конце документа.
function StickyFooterButton({ children, onClick, disabled }) {
  return (
    <div
      style={{
        position: 'sticky', bottom: 0, left: 0, right: 0, margin: '16px -16px 0',
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: C.bg, borderTop: `1px solid ${C.border}`, boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
      }}
    >
      <Btn onClick={onClick} disabled={disabled}>{children}</Btn>
    </div>
  );
}

function TestStep({ session, answers, setAnswer, onSubmit, submitting, error }) {
  const blocks = [...new Set(session.questions.map((q) => q.block))];
  return (
    <>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Тест: {session.nicheLabel}</div>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
          Отвечено: {Object.keys(answers).length} из {session.questions.length}
        </div>

        {blocks.map((block) => (
          <div key={block} style={{ marginBottom: 20 }}>
            {session.questions.filter((q) => q.block === block).map((q) => (
              <div key={q.code} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: q.hint ? 4 : 8 }}>{q.text}</div>
                {q.hint && <div style={{ fontSize: 12, color: C.subtle, marginBottom: 8 }}>{q.hint}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {q.answers.map((label, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={q.code}
                        checked={answers[q.code] === i}
                        onChange={() => setAnswer(q.code, i)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

        {error && <div className="alert alert-error">{error}</div>}
      </Card>
      <StickyFooterButton onClick={onSubmit} disabled={submitting}>{submitting ? 'Считаем…' : 'Завершить тест'}</StickyFooterButton>
    </>
  );
}

function ResultStep({ result, email, setEmail, acceptedTerms, setAcceptedTerms, analyticsConsent, setAnalyticsConsent, onPay, paying, onClaimFree, claiming, claimed, error }) {
  const zone = result.zone;
  return (
    <div>
      <Card>
        <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 4, color: '#FFF' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Индекс безопасности</div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', marginBottom: 8 }}>{result.indexPercent}%</div>
          <Badge color={ZONE_COLOR[zone]} bg="rgba(255,255,255,0.15)">{ZONE_LABELS[zone]}</Badge>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>Найдено нарушений: {result.violationsCount}</div>
        </div>
      </Card>

      {/* 24.08.2026, живой разбор воронки: раньше после теста был только
          выбор "заплати за PDF сейчас или уходи" — ничего не говорило о
          том, что "Безопасный бизнес" вообще не сводится к разовому тесту
          (сроки документов, финансы, чек-листы, ИИ-ассистент). Эта карточка
          не конкурирует с оплатой — она для тех, кто пока не готов платить,
          но результат терять не хочет. */}
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>«Безопасный бизнес» — это не только тест</div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
          Приложение само напоминает о сроках медкнижек, огнетушителей, СОУТ и других документов, ведёт финансы
          и чек-листы смены, отвечает на вопросы через ИИ-ассистента. Результат этого теста уже сохранён —
          проходить заново не нужно.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Полный отчёт — {PRICE_RUB} ₽</div>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 14, lineHeight: 1.5 }}>
          PDF со всеми найденными нарушениями, штрафами, планом устранения и списком обязательных документов —
          пришлём на почту. Разовая оплата, без подписки.
        </div>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: 12, color: C.secondary, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} style={{ marginTop: 2 }} required />
          <span>
            Я принимаю условия{' '}
            <a href="/lk/legal/oferta" target="_blank" rel="noreferrer" style={{ color: C.primary }}>оферты</a>
            {' '}и{' '}
            <a href="/lk/legal/privacy_policy" target="_blank" rel="noreferrer" style={{ color: C.primary }}>политики конфиденциальности</a>
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, fontSize: 12, color: C.subtle, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={analyticsConsent} onChange={(e) => setAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Согласен на использование обезличенных агрегированных данных для аналитики (необязательно)</span>
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        {claimed ? (
          <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>✓ Письмо со ссылкой отправлено на {email}</div>
        ) : (
          <button
            onClick={onClaimFree}
            disabled={claiming}
            style={{ background: 'none', border: 'none', color: C.primary, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            {claiming ? 'Отправляем…' : 'Не готовы платить сейчас — сохранить результат бесплатно и продолжить в приложении →'}
          </button>
        )}
      </Card>
      <StickyFooterButton onClick={onPay} disabled={paying}>{paying ? 'Переходим к оплате…' : `Оплатить и получить отчёт — ${PRICE_RUB} ₽`}</StickyFooterButton>
    </div>
  );
}

// Возврат со страницы оплаты ЮKassa (checkout-one-time, returnPath='/audit'
// для гостей, см. subscription.routes.js) — сама страница ничего не знает
// о статусе платежа (вебхук асинхронный, а у гостя нет пароля, чтобы
// перезайти и проверить) — просто честно объясняем, что письмо придёт,
// без попытки опрашивать статус.
function DoneStep() {
  return (
    <Card>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Оплата обрабатывается</div>
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
        Обычно это занимает не больше пары минут. Как только оплата подтвердится, отчёт (PDF) придёт на
        указанную почту — проверьте папку "Спам", если письмо не появится в течение 10 минут.
      </div>
    </Card>
  );
}

export default function AnonymousAudit() {
  // useSearchParams — единственный хук, нужный ДО остальных: если платёж уже
  // обрабатывается, весь дальнейший стейт (тест/вопросы/оплата) не нужен, но
  // сам хук всё равно должен вызываться на каждый рендер безусловно (Rules
  // of Hooks) — поэтому ветвление на JSX ниже, не через ранний return здесь.
  const [searchParams] = useSearchParams();
  const paymentDone = searchParams.get('payment') === 'done';

  const [step, setStep] = useState('intro');
  const [niche, setNiche] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [workModel, setWorkModel] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submittingTest, setSubmittingTest] = useState(false);

  const [result, setResult] = useState(null);
  const [reportId, setReportId] = useState(null);

  const [email, setEmail] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [analyticsConsent, setAnalyticsConsent] = useState(false);
  const [paying, setPaying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  async function start() {
    if (!niche || !legalForm || !workModel) {
      setError('Заполните нишу, форму и модель работы');
      return;
    }
    setError('');
    setStarting(true);
    try {
      const { data } = await guestApi.post('/platform/anonymous-audit/start');
      guestApi.defaults.headers.common.Authorization = `Bearer ${data.token}`;

      const segment = NICHE_OPTIONS.find(([k]) => k === niche)[2];
      await guestApi.post('/modules/security/profile', { segment, niches: [niche], legalForm, workModel });

      const sessionRes = await guestApi.post('/modules/security/sessions', {});
      setSession({
        id: sessionRes.data.session.id,
        questions: sessionRes.data.questions,
        nicheLabel: sessionRes.data.nicheLabel,
      });
      setStep('test');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать тест');
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(code, index) {
    setAnswers((prev) => ({ ...prev, [code]: index }));
  }

  async function submitTest() {
    const unanswered = session.questions.filter((q) => answers[q.code] == null);
    if (unanswered.length > 0) {
      setError(`Осталось ответить на ${unanswered.length} вопрос(ов)`);
      return;
    }
    setError('');
    setSubmittingTest(true);
    try {
      for (const q of session.questions) {
        await guestApi.post(`/modules/security/sessions/${session.id}/answers`, {
          questionCode: q.code,
          answerIndex: answers[q.code],
        });
      }
      await guestApi.post(`/modules/security/sessions/${session.id}/complete`);
      const { data: status } = await guestApi.get('/modules/security/status');
      setResult(status);

      const reportRes = await guestApi.post(`/modules/security/sessions/${status.anchorSessionId}/report`);
      setReportId(reportRes.data.id);
      setStep('result');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось завершить тест');
    } finally {
      setSubmittingTest(false);
    }
  }

  async function pay() {
    if (!email || !email.includes('@')) {
      setError('Укажите email');
      return;
    }
    if (!acceptedTerms) {
      setError('Нужно принять условия оферты и политики конфиденциальности');
      return;
    }
    setError('');
    setPaying(true);
    try {
      const { data } = await guestApi.post('/platform/subscription/checkout-one-time', {
        reportId,
        email,
        acceptedTerms,
        analyticsConsent,
      });
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать оплату');
      setPaying(false);
    }
  }

  // "Сохранить бесплатно" — тот же claim-механизм (ссылка "установить
  // пароль"), что и у платного пути (fulfillGuestReport, backend), но не
  // требует оплаты. См. комментарий у POST /platform/anonymous-audit/claim.
  async function claimFree() {
    if (!email || !email.includes('@')) {
      setError('Укажите email');
      return;
    }
    if (!acceptedTerms) {
      setError('Нужно принять условия оферты и политики конфиденциальности');
      return;
    }
    setError('');
    setClaiming(true);
    try {
      await guestApi.post('/platform/anonymous-audit/claim', { email, acceptedTerms, analyticsConsent });
      setClaimed(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось отправить письмо');
    } finally {
      setClaiming(false);
    }
  }

  return (
    // height+overflowY обязательны здесь (21.08.2026, живой баг: тест из 34
    // вопросов не прокручивался ниже первого экрана) — html/body у ВСЕГО
    // приложения зафиксированы overflow:hidden (styles.css), а прокрутку
    // обеспечивает свой internal-контейнер в Layout.jsx. Эта страница —
    // единственная публичная, вне Layout (см. комментарий в начале файла),
    // без своего скролл-контейнера она наследовала overflow:hidden от body
    // и была прокручиваемой только на первый экран, дальше — тупик.
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', fontFamily: F, height: '100vh', overflowY: 'auto' }}>
      {paymentDone && <DoneStep />}
      {!paymentDone && step === 'intro' && (
        <IntroStep
          niche={niche} setNiche={setNiche}
          legalForm={legalForm} setLegalForm={setLegalForm}
          workModel={workModel} setWorkModel={setWorkModel}
          onStart={start} starting={starting} error={error}
        />
      )}
      {!paymentDone && step === 'test' && session && (
        <TestStep session={session} answers={answers} setAnswer={setAnswer} onSubmit={submitTest} submitting={submittingTest} error={error} />
      )}
      {!paymentDone && step === 'result' && result && (
        <ResultStep
          result={result}
          email={email} setEmail={setEmail}
          acceptedTerms={acceptedTerms} setAcceptedTerms={setAcceptedTerms}
          analyticsConsent={analyticsConsent} setAnalyticsConsent={setAnalyticsConsent}
          onPay={pay} paying={paying}
          onClaimFree={claimFree} claiming={claiming} claimed={claimed}
          error={error}
        />
      )}
    </div>
  );
}
