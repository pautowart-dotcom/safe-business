import { useState, useEffect, useRef } from 'react';
import { getCaptchaToken } from '../utils/captcha.js';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Card, Btn, TextInput, Field, Select, Badge, Icon, C, F } from '../ui/components.jsx';
import TestQuestion from '../components/TestQuestion.jsx';
import { NICHE_OPTIONS } from '../ui/nicheOptions.js';
import { ConsentPair } from '../ui/LegalConsents.jsx';
import { reachGoal } from '../utils/metrika.js';
import { OutsideFindingsList } from '../components/OutsideFindings.jsx';
import { usePromoQuote } from '../utils/usePromoQuote.js';

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
// Те же подписи, что SUMMARY_BLOCKS в backend/.../report/build.js —
// продублировано здесь по тому же принципу, что и riskColor чуть ниже: эта
// страница намеренно изолирована от остального приложения (см. комментарий
// в начале файла), общий импорт не заводим ради словаря подписей.
const BLOCK_LABELS = {
  1: 'Юридическая база',
  2: 'Санитарная безопасность',
  3: 'Оборудование',
  4: 'Персонал',
  5: 'Персональные данные',
  6: 'Помещение',
  7: 'Дополнительные зоны',
  9: 'Финансовая безопасность',
};
const ZONE_LABELS = { green: 'Почти готовы к проверке', yellow: 'На полпути', red: 'Начало пути' }; // словарь 26.10.2026
const ZONE_COLOR = { green: C.green, yellow: C.orange, red: C.red };
const ZONE_BG = { green: C.greenBg, yellow: C.orangeBg, red: C.redBg };

// Тот же порог, что riskColor в pages/Security.jsx — не общий импорт,
// страница гостя намеренно изолирована от остального приложения (см.
// комментарий в начале файла), небольшое дублирование дешевле связи.
function riskColor(risk) {
  if (risk >= 9) return C.red;
  if (risk >= 7) return C.orange;
  if (risk >= 5) return '#B7950B';
  return C.green;
}

// Превью найденного нарушения (24.08.2026, живой разбор воронки: "люди не
// видят, что получают" — до этого коммита /modules/security/status уже
// возвращал полный список нарушений с деталями, фронт их просто нигде не
// показывал бесплатно). Название + уровень риска — настоящие, по ИХ тесту,
// не обобщённый макет; штраф/норма/решение — самое ценное для владельца —
// намеренно скрыты за блюром, это и есть граница бесплатного/платного.
// 14.10.2026 (рилс: 36 дошли до результата, 1 оплата; владелец: "ощущение,
// что обманываем, что пишем бесплатно") — обещали "карту нарушений
// бесплатно", а показывали 2 названия из N. Теперь бесплатно весь список
// названий (это и есть честная диагностика), платное — штраф, норма и план
// по каждому, то есть заключение.
function ViolationPreview({ violations }) {
  if (!violations || violations.length === 0) return null;
  const sorted = [...violations].sort((a, b) => (b.risk || 0) - (a.risk || 0));
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        Что нашли
      </div>
      {sorted.map((v, i) => (
        <div key={v.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: i < sorted.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor(v.risk), flexShrink: 0 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v.title}</div>
        </div>
      ))}
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', marginTop: 14 }}>
        <div style={{ filter: 'blur(5px)', userSelect: 'none', pointerEvents: 'none', fontSize: 12.5, color: C.secondary, lineHeight: 1.5, padding: '8px 10px', background: C.surface, borderRadius: 8 }}>
          Штраф: размер и статья закона. Норма: на чём основано требование. Как исправить: пошаговый план с документами и сроками.
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 8px', fontSize: 11.5, fontWeight: 700, color: C.subtle }}>
          Штраф, норма закона и план решения по каждому пункту — в заключении
        </div>
      </div>
    </Card>
  );
}

// Обратная связь после теста (14.10.2026) — бэкенд принимал её с самого
// начала (security_feedback), но ни один экран не спрашивал. Вариант в одно
// нажатие + необязательный комментарий. Варианты берём с сервера, чтобы
// список был в одном месте (POST_TEST_FEEDBACK_OPTIONS в security.routes.js).
function FeedbackCard({ sessionId }) {
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    guestApi.get('/modules/security/feedback-options').then((res) => setOptions(res.data.options)).catch(() => {});
  }, []);

  if (!sessionId || options.length === 0) return null;

  async function send(option, withComment) {
    setSending(true);
    try {
      await guestApi.post(`/modules/security/sessions/${sessionId}/feedback`, {
        selectedOption: option,
        comment: withComment ? comment : undefined,
      });
      if (withComment) setSent(true);
    } catch (err) {
      // Тихо — необязательный блок, не мешает результату и оплате.
    } finally {
      setSending(false);
    }
  }

  function choose(option) {
    setSelected(option);
    send(option, false);
  }

  if (sent) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Спасибо, прочитаем.</div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Как вам результат?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => choose(o)}
            style={{
              border: `1px solid ${selected === o ? C.primary : C.border}`,
              background: selected === o ? C.primary : 'transparent',
              color: selected === o ? '#FFF' : C.secondary,
              borderRadius: 999, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {selected && (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Если хотите, напишите подробнее — что не так или чего не хватило (необязательно)"
            style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }}
          />
          {comment.trim() && (
            <Btn small onClick={() => send(selected, true)} disabled={sending} style={{ marginTop: 8 }}>
              {sending ? 'Отправляем…' : 'Отправить'}
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

// ИНН на первом экране (22.10.2026, «Ваш бизнес снаружи»): необязательно —
// по реестру сами ставим форму, подсказываем нишу по ОКВЭД, а на экране
// результата показываем, что видно о бизнесе в реестрах. Только свой бизнес.
function InnPrefill({ inn, setInn, confirmOwn, setConfirmOwn, onPrefill, prefilling, prefill, prefillError, setNiche }) {
  const innValid = inn.length === 10 || inn.length === 12;
  if (prefill) {
    const suggested = NICHE_OPTIONS.filter(([k]) => prefill.suggestedNiches?.includes(k));
    return (
      <div style={{ background: C.greenBg, borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        {prefill.found ? (
          <>
            <div style={{ fontWeight: 700, color: C.primary }}>{prefill.name || 'Нашли вас в реестре'}</div>
            {prefill.okved && <div style={{ color: C.secondary }}>Основной ОКВЭД {prefill.okved.code} — {prefill.okved.name}</div>}
            <div style={{ color: C.secondary, marginTop: 4 }}>Форму работы заполнили сами. В конце теста покажем, что о вас видно в реестрах.</div>
            {suggested.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: C.secondary, marginBottom: 6 }}>По ОКВЭД подходит — выберите свою нишу:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {suggested.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setNiche(k)} style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 999, padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' }}>{l}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: C.secondary }}>В реестре ИП и организаций этот ИНН не нашли — заполните поля ниже, тест пройдёт как обычно.</div>
        )}
      </div>
    );
  }
  return (
    <div style={{ background: C.surface, borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Есть ИНН? Заполним часть ответов сами</div>
      <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 10, lineHeight: 1.45 }}>Необязательно. По открытым реестрам поставим форму работы и подскажем нишу, а в конце покажем, что о вас видно в реестрах.</div>
      <TextInput value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" placeholder="ИНН ИП или организации" />
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: C.secondary, lineHeight: 1.4, margin: '10px 0', cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmOwn} onChange={(e) => setConfirmOwn(e.target.checked)} style={{ marginTop: 2 }} />
        <span>Это мой ИП или организация. Проверять можно только свой бизнес.</span>
      </label>
      <Btn small variant="secondary" onClick={onPrefill} disabled={prefilling || !innValid || !confirmOwn}>{prefilling ? 'Смотрим реестр…' : 'Заполнить по ИНН'}</Btn>
      {prefillError && <div style={{ fontSize: 12.5, color: C.red, marginTop: 8 }}>{prefillError}</div>}
    </div>
  );
}

function IntroStep({ niche, setNiche, legalForm, setLegalForm, workModel, setWorkModel, onStart, starting, error, innProps }) {
  return (
    <Card>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Разовый аудит безопасности бизнеса</div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16, lineHeight: 1.5 }}>
        Тест по вашей нише — бесплатно: индекс безопасности, список найденных нарушений и три самых важных
        пункта с решением. Регистрация не нужна — в конце укажете почту, покажем результат и пришлём его
        письмом. Штрафы, нормы закона и план по каждому пункту — в заключении, {PRICE_RUB} ₽ разово, без подписки.
      </div>
      {/* 07.09.2026, живой разбор воронки маркетолога: "переходят из
          Instagram, видят 30 вопросов и просто не проходят" — честно
          предупреждаем о длине заранее, а не даём наткнуться на неё
          неожиданно. Без конкретного числа (оно сильно разное по нишам,
          от короткого блока до полусотни пунктов) — статичная цифра здесь
          рисковала бы устареть так же, как устарело "34 вопроса" в личном
          кабинете (см. Security.jsx). */}
      <div style={{ fontSize: 12.5, color: C.subtle, marginBottom: 16, lineHeight: 1.5, background: C.surface, borderRadius: 8, padding: '10px 12px' }}>
        Вопросов может быть много — зависит от ниши. Тест разбит на понятные этапы (юрбаза, санитария,
        персонал и т.д.), прогресс виден по ходу. Каждый вопрос — простой выбор варианта.
      </div>

      {innProps.enabled && <InnPrefill {...innProps} setNiche={setNiche} />}

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

// Кнопка отправки вынесена из Card в отдельный футер (24.08.2026 — живой
// разбор воронки после рилса: на реальном телефоне кнопка в конце
// длинного списка вопросов оказывалась на самом краю экрана или за ним,
// частично перекрыта панелью браузера — 40 прошли тест, ни один не дошёл до
// оплаты).
//
// position:fixed, а не sticky (09.09.2026, третий скриншот подряд — sticky
// внутри кастомного height:100vh/dvh/svh-контейнера на iOS Safari вело
// себя непредсказуемо: кнопка "прилипала" сразу у верха документа, посреди
// первого же вопроса, а не у реального низа — похоже на баг именно sticky
// + нестандартная высота контейнера, не помогла ни одна из трёх единиц
// vh/dvh/svh, менявших только ВЫСОТУ контейнера, а не механизм
// позиционирования кнопки). fixed позиционируется от границ реального
// вьюпорта напрямую, не зависит от того, как посчитана высота
// scroll-контейнера — тот же приём, что у нижнего меню в основном
// приложении (Layout.jsx), там таких жалоб не было ни разу. maxWidth+margin
// повторяют контейнер страницы, чтобы кнопка не растянулась на весь экран
// на широких экранах.
function StickyFooterButton({ children, onClick, disabled }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 560, margin: '0 auto',
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: C.bg, borderTop: `1px solid ${C.border}`, boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
      }}
    >
      <Btn onClick={onClick} disabled={disabled}>{children}</Btn>
    </div>
  );
}

// Тест «живее» (18.10.2026, этап 9, идея владельца «не гугл-форма»): один
// вопрос на экран с реакцией на ответ и автопереходом (TestQuestion), в
// конце — экран «готово» с итогом. Раньше — все вопросы одним списком
// (TestStepList ниже — запасной вид, если у вопросов нет отметок tones).
function TestStep({ session, answers, setAnswer, onSubmit, submitting, error }) {
  const questions = session.questions;
  const firstUnanswered = questions.findIndex((q) => answers[q.code] == null);
  const [idx, setIdx] = useState(firstUnanswered === -1 ? questions.length : firstUnanswered);

  if (!questions.every((q) => Array.isArray(q.tones))) {
    return <TestStepList session={session} answers={answers} setAnswer={setAnswer} onSubmit={onSubmit} submitting={submitting} error={error} />;
  }

  if (idx >= questions.length) {
    const ok = questions.filter((q) => q.tones[answers[q.code]] === 'ok').length;
    return (
      <>
        <Card>
          <div className="ui-view" style={{ textAlign: 'center', padding: '12px 4px 4px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Icon name="check" size={30} color={C.green} sw={2.4} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Готово — вопросов: {questions.length}</div>
            <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5 }}>
              Уже в порядке: <b style={{ color: C.green }}>{ok} из {questions.length}</b>. Сейчас посчитаем индекс и покажем, что стоит оформить.
            </div>
            <button
              type="button"
              onClick={() => setIdx(questions.length - 1)}
              style={{ marginTop: 14, background: 'none', border: 'none', color: C.subtle, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Вернуться к последнему вопросу
            </button>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
        </Card>
        <StickyFooterButton onClick={onSubmit} disabled={submitting}>{submitting ? 'Считаем…' : 'Посмотреть результат'}</StickyFooterButton>
      </>
    );
  }

  return (
    <TestQuestion
      questions={questions}
      index={idx}
      blockLabels={BLOCK_LABELS}
      topLine={`Тест: ${session.nicheLabel}`}
      onAnswer={(i) => { setAnswer(questions[idx].code, i); setIdx(idx + 1); }}
      onBack={idx > 0 ? () => setIdx(idx - 1) : null}
    />
  );
}

function TestStepList({ session, answers, setAnswer, onSubmit, submitting, error }) {
  const blocks = [...new Set(session.questions.map((q) => q.block))];
  return (
    <>
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Тест: {session.nicheLabel}</div>
        <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
          Отвечено: {Object.keys(answers).length} из {session.questions.length}
        </div>

        {/* 07.09.2026, живой разбор воронки маркетолога: "переходят из
            Instagram, видят 30 вопросов сплошным списком и не проходят" —
            блоки уже были сгруппированы визуально (borderBottom между
            группами), но без названия и счётчика это читалось как один
            бесконечный список, а не конечные, названные этапы. */}
        {blocks.map((block, i) => {
          const blockQuestions = session.questions.filter((q) => q.block === block);
          const answeredInBlock = blockQuestions.filter((q) => answers[q.code] !== undefined).length;
          return (
          <div key={block} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Этап {i + 1} из {blocks.length} · {BLOCK_LABELS[block] || 'Прочее'} ({answeredInBlock}/{blockQuestions.length})
            </div>
            {blockQuestions.map((q) => (
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
          );
        })}

        {error && <div className="alert alert-error">{error}</div>}
      </Card>
      <StickyFooterButton onClick={onSubmit} disabled={submitting}>{submitting ? 'Считаем…' : 'Завершить тест'}</StickyFooterButton>
    </>
  );
}

// Выбор покупки после теста (24.10.2026, решение владельца): одна карточка
// вместо трёх отдельных — набор «заключение + документы» первым и выделен,
// под ним заключение и документы по отдельности. Документы предлагаем, только
// если среди найденного есть то, что закрывает пакет (inDocumentsPack из
// /status). Проверка сайта отсюда убрана — она теперь только в подписке.
// Цены документов и набора — с сервера (core/addons.js).
function pointsLabel(n) {
  if (n === 1) return 'Один пункт';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} пункта`;
  return `${n} пунктов`;
}

// Неразрывный пробел перед ₽ — иначе знак рубля переносится на новую строку
// в длинной надписи кнопки (24.10.2026, скриншот владельца).
function rub(n) {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function PlanOption({ selected, onSelect, title, price, badge, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: 'block', width: '100%', textAlign: 'left', fontFamily: F, color: 'inherit', cursor: 'pointer',
        background: selected ? C.surface : 'none',
        border: `${selected ? 2 : 1}px solid ${selected ? C.primary : C.border}`,
        borderRadius: 12, padding: selected ? '11px 13px' : '12px 14px', marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{price}</span>
      </div>
      {badge && <div style={{ marginTop: 6 }}><Badge color={C.green} bg={C.greenBg}>{badge}</Badge></div>}
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginTop: 6 }}>{children}</div>
    </button>
  );
}

// docsAddon — запись document_templates из GET /platform/addons или null
// (не загрузилось / уже куплено / закрывать нечего) — тогда только заключение.
function PlanChoice({ plan, setPlan, docsAddon, covered, quote }) {
  if (!docsAddon) {
    return (
      <>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Заключение — <PriceWithPromo baseRub={PRICE_RUB} planQuote={quote?.report} /></div>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 14, lineHeight: 1.5 }}>
          PDF по каждому найденному нарушению: штраф и статья закона, на чём основано требование, план
          устранения и список обязательных документов — пришлём на почту.
        </div>
      </>
    );
  }
  const savingRub = PRICE_RUB + docsAddon.priceRub - docsAddon.bundleWithReportPriceRub;
  return (
    <div role="radiogroup" aria-label="Что оплатить" style={{ marginBottom: 4 }}>
      <PlanOption
        selected={plan === 'bundle'} onSelect={() => setPlan('bundle')}
        title="Всё вместе" price={<PriceWithPromo baseRub={docsAddon.bundleWithReportPriceRub} planQuote={quote?.bundle} />}
        badge={savingRub > 0 ? `Выгоднее на ${rub(savingRub)}` : null}
      >
        Заключение по каждому нарушению и готовые документы с данными вашего бизнеса.
      </PlanOption>
      <PlanOption selected={plan === 'report'} onSelect={() => setPlan('report')} title="Только заключение" price={<PriceWithPromo baseRub={PRICE_RUB} planQuote={quote?.report} />}>
        PDF по каждому нарушению: штраф и статья закона, на чём основано требование, план устранения.
      </PlanOption>
      <PlanOption selected={plan === 'docs'} onSelect={() => setPlan('docs')} title="Только документы" price={<PriceWithPromo baseRub={docsAddon.priceRub} planQuote={quote?.docs} />}>
        Готовые документы с данными вашего бизнеса — одна анкета в кабинете.
      </PlanOption>
      {plan !== 'report' && (
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, margin: '4px 0 12px' }}>
          Документы закроют {pointsLabel(covered.length).toLowerCase()} из списка выше:
          {covered.map((v) => (
            <div key={v.code} style={{ padding: '3px 0', display: 'flex', gap: 8, color: C.primary }}>
              <span style={{ color: C.subtle }}>—</span><span>{v.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Поле промокода (09.10.2026; 24.10.2026 — на любой вариант, цена меняется
// сразу, utils/usePromoQuote.js). Свёрнуто в ссылку «Есть промокод?», чтобы
// не отвлекать тех, у кого кода нет. planQuote — ответ сервера для
// выбранного варианта: { finalRub } или { error } (код на другую покупку).
function PromoField({ input, setInput, quote, planQuote, error, checking }) {
  const [open, setOpen] = useState(!!input);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ display: 'block', background: 'none', border: 'none', color: C.secondary, cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 12 }}>
        Есть промокод?
      </button>
    );
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          placeholder="Промокод"
          autoFocus
          style={{ flex: 1, minWidth: 0 }}
        />
        {input && (
          <button onClick={() => setInput('')} style={{ background: 'none', border: 'none', color: C.subtle, cursor: 'pointer', fontSize: 12, padding: 0, flexShrink: 0 }}>убрать</button>
        )}
      </div>
      {checking && <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>Проверяем…</div>}
      {error && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{error}</div>}
      {quote && planQuote?.error && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{planQuote.error}</div>}
      {quote && planQuote?.finalRub != null && (
        <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 6 }}>Промокод {quote.code} применён — цена выше уже со скидкой</div>
      )}
    </div>
  );
}

// Цена варианта со скидкой: старая зачёркнута, новая рядом.
function PriceWithPromo({ baseRub, planQuote }) {
  if (planQuote?.finalRub == null || planQuote.finalRub === baseRub) return rub(baseRub);
  return (
    <>
      <s style={{ color: C.subtle, fontWeight: 600, marginRight: 6 }}>{rub(baseRub)}</s>
      {rub(planQuote.finalRub)}
    </>
  );
}

// «Куда прислать результат?» (25.10.2026, решение владельца по совету
// таргетолога) — между тестом и результатом. Тот же /claim, что у «открыть
// приложение бесплатно»: почта + согласие → письмо с результатом и ссылкой в
// кабинет. Галочка на письма с предложениями — необязательная, отдельная
// (ст. 18 закона «О рекламе»). Выключается на сервере (RESULT_CONTACT_GATE).
function ContactStep({ result, email, setEmail, setAcceptedTerms, analyticsConsent, setAnalyticsConsent, marketingConsent, setMarketingConsent, onSubmit, submitting, error, onSkipAfterError }) {
  return (
    <>
      <Card>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Результат готов</div>
        <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, marginBottom: 16 }}>
          {result.violationsCount > 0
            ? `Нашли пунктов: ${result.violationsCount} — что стоит оформить или исправить. `
            : 'По вашим ответам серьёзных нарушений нет. '}
          Укажите почту: покажем результат здесь и пришлём его письмом — с тремя самыми важными пунктами и тем, что с ними сделать.
        </div>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <ConsentPair idPrefix="contact" purpose="order" onChange={setAcceptedTerms} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: 12, color: C.secondary, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            Присылать полезное и предложения — напоминания по результату, изменения требований (<a href="/lk/legal/consent_mailing" target="_blank" rel="noreferrer" style={{ color: C.primary }}>согласие</a>, необязательно)
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, fontSize: 12, color: C.subtle, lineHeight: 1.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={analyticsConsent} onChange={(e) => setAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Согласен на использование обезличенных агрегированных данных для аналитики (необязательно)</span>
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        {error && onSkipAfterError && (
          <button type="button" onClick={onSkipAfterError} style={{ background: 'none', border: 'none', color: C.primary, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 13, marginTop: 4 }}>
            Показать результат без сохранения
          </button>
        )}
        {error && onSkipAfterError && (
          <Link to="/login" style={{ display: 'block', color: C.primary, fontWeight: 600, fontSize: 13, marginTop: 8 }}>Войти в аккаунт</Link>
        )}
      </Card>
      <StickyFooterButton onClick={onSubmit} disabled={submitting}>{submitting ? 'Секунду…' : 'Показать результат'}</StickyFooterButton>
    </>
  );
}

// Три самых важных пункта бесплатно (25.10.2026) — штраф и одна строка «что
// сделать». Сервер отдаёт их только после почты (GET /top-risks).
function TopRisks({ top }) {
  if (!top || top.length === 0) return null;
  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
        Самое важное
      </div>
      {top.map((v, i) => (
        <div key={v.code} style={{ padding: '10px 0', borderBottom: i < top.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor(v.risk), flexShrink: 0 }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>{v.title}</div>
          </div>
          {v.fine && <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 4 }}><b>Штраф:</b> {v.fine}</div>}
          {v.whatToDo && <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}><b>Что сделать:</b> {v.whatToDo}</div>}
        </div>
      ))}
    </Card>
  );
}

function ResultStep({
  topRisks,
  result, email, setEmail, acceptedTerms, setAcceptedTerms, analyticsConsent, setAnalyticsConsent,
  onPay, paying, onClaimFree, claiming, claimed, error,
  promoInput, setPromoInput, promoQuote, promoError, promoChecking,
  plan, setPlan, docsAddon, covered, innUsed,
}) {
  const zone = result.zone;
  const payCardRef = useRef(null);
  const emailRef = useRef(null);

  // 21.10.2026 (владелец со своего телефона): кнопка оплаты прилипла к низу
  // экрана, а почта и согласие — в самом конце страницы. Нажал, не заполнив, —
  // ошибка появлялась там, где её не видно. Теперь прокручиваем к форме
  // заключения и ставим курсор в почту. Та же почта нужна и для входа в
  // приложение бесплатно — поэтому тот же приём и для кнопки ниже.
  function scrollToFormIfMissing() {
    const missing = !email || !email.includes('@') || !acceptedTerms;
    if (missing && payCardRef.current) {
      payCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if ((!email || !email.includes('@')) && emailRef.current) emailRef.current.focus({ preventScroll: true });
    }
  }
  function handlePay() {
    scrollToFormIfMissing();
    onPay();
  }
  function handleClaim() {
    scrollToFormIfMissing();
    onClaimFree();
  }

  const planQuote = promoQuote?.[plan];
  const priceRub = planQuote?.finalRub != null ? planQuote.finalRub
    : plan === 'bundle' ? docsAddon.bundleWithReportPriceRub
    : plan === 'docs' ? docsAddon.priceRub
    : PRICE_RUB;
  const payLabel = plan === 'bundle' ? 'Оплатить всё вместе'
    : plan === 'docs' ? 'Оплатить документы'
    : 'Оплатить и получить заключение';

  return (
    <div>
      <Card>
        <div style={{ background: C.primary, borderRadius: 16, padding: 20, marginBottom: 4, color: '#FFF' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Индекс безопасности</div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-2px', marginBottom: 8 }}>{Math.round(result.indexPercent)}<span style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0, opacity: 0.7 }}> из 100</span></div>
          <Badge color={ZONE_COLOR[zone]} bg="rgba(255,255,255,0.15)">{ZONE_LABELS[zone]}</Badge>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>Нашли пунктов: {result.violationsCount}</div>
        </div>
      </Card>

      <TopRisks top={topRisks} />

      <ViolationPreview violations={result.violations} />

      <FeedbackCard sessionId={result.anchorSessionId} />

      <div ref={payCardRef}>
      <Card>
        <PlanChoice plan={plan} setPlan={setPlan} docsAddon={docsAddon} covered={covered} quote={promoQuote} />
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 14, lineHeight: 1.5 }}>
          Разовая оплата, без подписки. В подарок — месяц полного доступа к кабинету: план устранения списком
          дел и напоминания о сроках. Карту не сохраняем, ничего не спишется само.
        </div>
        <AfterPaymentNote plan={docsAddon ? plan : 'report'} innUsed={innUsed} />
        {/* Ссылка на уже существующий пример (backend/src/scripts/
            generateSampleReport.js, 13.08.2026) — 2 нарушения из 8 раскрыты
            полностью (штраф/статья/решение), остальные 6 честно заблокированы
            с той же формулировкой, что и ViolationPreview выше по этой же
            странице (не отдаёт всю диагностическую ценность бесплатно).
            Добавлено 01.09.2026 — живой разбор воронки: 47 дошли до
            результата, заплатили 2-3, гипотеза — человек не понимает, ЗА ЧТО
            платит, видя только 2 размытых превью прямо на этом экране.
            Статика из landing/ (nginx root для "/"), не через API — файл
            один и тот же для всех, не персонализирован. */}
        <a
          href="/primer-otcheta-bezopasnosti.pdf"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'block', fontSize: 13, color: C.primary, fontWeight: 600, marginBottom: 14 }}
        >
          Посмотреть пример отчёта (PDF, как выглядит результат) →
        </a>
        {/* Почту и согласие уже дали перед результатом (ContactStep) — второй
            раз не спрашиваем. */}
        {claimed ? (
          <div style={{ fontSize: 13, color: C.secondary, marginBottom: 14 }}>Почта: <b>{email}</b></div>
        ) : (
          <>
            <Field label="Email">
              <TextInput ref={emailRef} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <ConsentPair idPrefix="report" purpose="order" onChange={setAcceptedTerms} />
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, fontSize: 12, color: C.subtle, lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={analyticsConsent} onChange={(e) => setAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Согласен на использование обезличенных агрегированных данных для аналитики (необязательно)</span>
            </label>
          </>
        )}
        <PromoField
          input={promoInput} setInput={setPromoInput} quote={promoQuote} planQuote={planQuote}
          error={promoError} checking={promoChecking}
        />
        {error && <div className="alert alert-error">{error}</div>}
      </Card>
      </div>
      <StickyFooterButton onClick={handlePay} disabled={paying}>
        {paying ? 'Переходим к оплате…' : `${payLabel} — ${rub(priceRub)}`}
      </StickyFooterButton>
      {/* 24.10.2026 (решение владельца): кто не купил — в приложение. Раньше
          здесь была мелкая серая ссылка «сохранить результат бесплатно» (из 21
          после деплоя 14.10 — 0 нажатий) и выше карточка «впишите дату ЭЦП»
          (0 из 142). Теперь отдельная карточка: claim (почта и согласие из
          формы выше), сразу за ним — пароль и вход, без похода в почту. */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Не готовы платить — откройте приложение бесплатно</div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 14 }}>
          Результат теста уже внутри, проходить заново не нужно. Месяц полного доступа без карты: список дел по
          найденному, «Мои сроки» с напоминаниями. {claimed ? 'Почта уже есть — осталось придумать пароль.' : 'Нужна только почта из формы выше и пароль.'}
        </div>
        {claimed ? (
          <SetPasswordForm email={email} />
        ) : (
          <Btn small variant="secondary" onClick={handleClaim} disabled={claiming}>
            {claiming ? 'Отправляем…' : 'Открыть приложение бесплатно'}
          </Btn>
        )}
      </Card>
    </div>
  );
}

// Что будет после оплаты — до оплаты (24.10.2026, владелец: путь длиннее
// прежнего «пришлём на почту», предупредить заранее и объяснить, что анкета
// заполнится за человека). innUsed — указал ИНН в начале теста: реквизиты из
// реестра уже лежат в анкете документов (outside-watch/service.js).
function AfterPaymentNote({ plan, innUsed }) {
  const docs = plan !== 'report';
  return (
    <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: C.surface }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Что будет после оплаты</div>
      <div style={{ color: C.secondary }}>
        Вернётесь на эту страницу, придумаете пароль — и сразу откроется кабинет.
        {docs
          ? innUsed
            ? ' Документы собираются из одной анкеты: название и реквизиты по вашему ИНН уже подставлены, останется ответить на несколько вопросов про ваш бизнес.'
            : ' Документы собираются из одной анкеты: реквизиты вводятся один раз — сразу на все документы.'
          : ' Там план устранения по каждому нарушению.'}
        {plan !== 'docs' && ' Заключение в PDF придёт и на почту.'}
      </div>
    </div>
  );
}

// Гостевой токен переживает уход на страницу ЮKassa (24.10.2026): без него
// вернувшийся не смог бы сразу поставить пароль. sessionStorage — только эта
// вкладка; удаляется после входа.
const GUEST_TOKEN_KEY = 'bb_guest_audit_token';

function rememberGuestToken() {
  try {
    const auth = guestApi.defaults.headers.common.Authorization;
    if (auth) sessionStorage.setItem(GUEST_TOKEN_KEY, auth);
  } catch { /* приватный режим — вернётся старый путь через письмо */ }
}

function restoreGuestToken() {
  try {
    const auth = sessionStorage.getItem(GUEST_TOKEN_KEY);
    if (auth) guestApi.defaults.headers.common.Authorization = auth;
    return !!auth;
  } catch {
    return false;
  }
}

// Пароль прямо здесь → обычная сессия приложения (тот же localStorage, что у
// входа, context/AuthContext.jsx applyAuthResult) → кабинет. Это осознанный
// вход: если в браузере была другая сессия, она заменится, как при логине.
function SetPasswordForm({ email }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { data } = await guestApi.post('/platform/anonymous-audit/set-password', { password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('deviceToken', data.deviceToken);
      localStorage.removeItem('currentCompany');
      try { sessionStorage.removeItem(GUEST_TOKEN_KEY); } catch { /* не критично */ }
      window.location.href = `${import.meta.env.BASE_URL}security`;
    } catch (err) {
      setError(err.response?.data?.error || 'Не получилось — попробуйте ещё раз');
      setSaving(false);
    }
  }

  return (
    <>
      <Field label={email ? `Придумайте пароль — вход по почте ${email}` : 'Придумайте пароль'}>
        <TextInput
          type="password" autoComplete="new-password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        />
      </Field>
      {error && <div className="alert alert-error">{error}</div>}
      <Btn small onClick={save} disabled={saving}>{saving ? 'Входим…' : 'Войти в кабинет'}</Btn>
    </>
  );
}

// Возврат со страницы оплаты ЮKassa (returnUrl '/audit?payment=done' для
// гостей). Вебхук асинхронный — спрашиваем сервер раз в 3 секунды, пока
// оплата не подтвердится (до 3 минут), и сразу предлагаем пароль. Нет
// гостевого токена (другая вкладка, приватный режим) или не дождались —
// прежний текст: письмо со ссылкой придёт на почту.
function DoneStep() {
  const [state, setState] = useState(() => (restoreGuestToken() ? 'waiting' : 'email')); // waiting | paid | email
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (state !== 'waiting') return undefined;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const { data } = await guestApi.get('/platform/anonymous-audit/payment-status');
        if (data.paid) {
          setEmail(data.email);
          setState('paid');
          return;
        }
      } catch { /* сеть моргнула — следующая попытка */ }
      if (tries >= 60) setState('email');
    }, 3000);
    return () => clearInterval(timer);
  }, [state]);

  if (state === 'paid') {
    return (
      <Card>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Оплата прошла</div>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 14 }}>
          Придумайте пароль — и сразу откроется кабинет: план устранения списком дел, месяц полного доступа в
          подарок и, если брали документы, анкета для них. Заключение в PDF придёт и на почту.
        </div>
        <SetPasswordForm email={email} />
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Оплата обрабатывается</div>
      {state === 'waiting' ? (
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
          Ждём подтверждения от банка — обычно несколько секунд. Не закрывайте страницу: как только оплата
          пройдёт, здесь появится вход в кабинет.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
            Обычно это занимает не больше пары минут. Как только оплата подтвердится, результат придёт на
            указанную почту — проверьте папку "Спам", если письмо не появится в течение 10 минут.
          </div>
          <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginTop: 10 }}>
            Заключение будет во вложении. В письме — ссылка для входа в кабинет: там ваш план устранения списком
            дел, месяц полного доступа в подарок и, если брали документы, анкета для них.
          </div>
        </>
      )}
      {/* 12.09.2026, прямой запрос владельца: способ связаться, если после
          оплаты письмо всё равно не пришло. */}
      <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        Если письма нет дольше 10 минут — напишите в{' '}
        <a href="https://t.me/safe_business_ru" target="_blank" rel="noreferrer">Телеграм</a> или{' '}
        <a href="https://wa.me/message/6KDRP3KLEXT3I1" target="_blank" rel="noreferrer">WhatsApp</a>, разберёмся.
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
  // Почта перед результатом (25.10.2026): включено, пока сервер не сказал
  // иначе (RESULT_CONTACT_GATE=false — откат без деплоя кода).
  const [contactGate, setContactGate] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [topRisks, setTopRisks] = useState(null);
  const [contactConflict, setContactConflict] = useState(false);
  useEffect(() => {
    guestApi.get('/platform/anonymous-audit/config').then(({ data }) => setContactGate(data.contactGate !== false)).catch(() => {});
  }, []);

  // Что оплачивают с экрана результата (24.10.2026): 'bundle' | 'report' | 'docs'.
  // Документы — только если пакет что-то закрывает и ещё не куплен.
  const [plan, setPlan] = useState('report');
  const [docsAddon, setDocsAddon] = useState(null);
  const covered = (result?.violations || []).filter((v) => v.inDocumentsPack && v.status !== 'resolved');
  useEffect(() => {
    if (covered.length === 0) return;
    guestApi
      .get('/platform/addons')
      .then((res) => {
        const addon = res.data.find((a) => a.addonKey === 'document_templates');
        if (addon && !addon.purchased && addon.bundleWithReportPriceRub) {
          setDocsAddon(addon);
          setPlan('bundle');
        }
      })
      .catch(() => {});
  }, [covered.length]);

  // «Ваш бизнес снаружи» (22.10.2026): ИНН на первом экране, находки на результате.
  const [innEnabled, setInnEnabled] = useState(false);
  const [inn, setInn] = useState('');
  const [confirmOwn, setConfirmOwn] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [prefillError, setPrefillError] = useState('');
  const [outsideFindings, setOutsideFindings] = useState(null);
  useEffect(() => {
    guestApi.get('/platform/outside-watch/enabled').then(({ data }) => setInnEnabled(!!data.enabled)).catch(() => {});
  }, []);

  // Гостевой аккаунт создаётся один раз: по кнопке «Заполнить по ИНН» или «Начать тест».
  async function ensureGuest() {
    if (guestApi.defaults.headers.common.Authorization) return;
    const captchaToken = await getCaptchaToken();
    const { data } = await guestApi.post('/platform/anonymous-audit/start', { captchaToken });
    guestApi.defaults.headers.common.Authorization = `Bearer ${data.token}`;
  }

  async function prefillFromInn() {
    setPrefillError('');
    setPrefilling(true);
    try {
      await ensureGuest();
      const { data } = await guestApi.post('/platform/outside-watch/prefill', { inn, confirmOwn });
      setPrefill(data);
      if (data.legalForm) setLegalForm(data.legalForm);
      if (data.suggestedNiches?.length === 1) setNiche(data.suggestedNiches[0]);
      reachGoal('inn_prefill');
    } catch (err) {
      setPrefillError(err.response?.data?.error || 'Не получилось — заполните поля ниже, тест пройдёт как обычно');
    } finally {
      setPrefilling(false);
    }
  }

  async function start() {
    if (!niche || !legalForm || !workModel) {
      setError('Заполните нишу, форму и модель работы');
      return;
    }
    setError('');
    setStarting(true);
    try {
      await ensureGuest();

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
      reachGoal('test_completed');
      const { data: status } = await guestApi.get('/modules/security/status');
      setResult(status);

      const reportRes = await guestApi.post(`/modules/security/sessions/${status.anchorSessionId}/report`);
      setReportId(reportRes.data.id);
      setStep(contactGate ? 'contact' : 'result');
      // Реестры — уже после перехода к результату и без ожидания: не ответили
      // или лимит дня — блок просто не появится.
      if (prefill?.found) {
        guestApi.post('/platform/outside-watch/snapshot', {})
          .then(({ data }) => setOutsideFindings(data.findings || []))
          .catch(() => {});
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось завершить тест');
    } finally {
      setSubmittingTest(false);
    }
  }

  // Промокод (09.10.2026; 24.10.2026 — на любой вариант, цена меняется сразу).
  // Сервер проверяет код ещё раз сам при чек-ауте — сумма в кнопке и в ЮKassa
  // не разойдутся.
  const [promoInput, setPromoInput] = useState('');
  const { quote: promoQuote, error: promoError, checking: promoChecking } = usePromoQuote(guestApi, promoInput);
  // Код уходит в оплату, только если подошёл к выбранному варианту.
  const promoCodeForPlan = promoQuote?.[docsAddon ? plan : 'report']?.finalRub != null ? promoQuote.code : null;

  async function pay() {
    if (!email || !email.includes('@')) {
      setError('Укажите email');
      return;
    }
    if (!acceptedTerms) {
      setError('Нужно принять пользовательское соглашение и дать согласие на обработку персональных данных');
      return;
    }
    setError('');
    setPaying(true);
    try {
      // Набор и документы — через чек-аут надстроек (addons.routes.js), набор
      // с привязкой отчёта; заключение отдельно — прежний разовый чек-аут.
      const { data } = plan === 'report' || !docsAddon
        ? await guestApi.post('/platform/subscription/checkout-one-time', {
          reportId,
          email,
          acceptedTerms,
          analyticsConsent,
          ...(promoCodeForPlan ? { promoCode: promoCodeForPlan } : {}),
        })
        : await guestApi.post('/platform/addons/document_templates/checkout', {
          email,
          acceptedTerms,
          analyticsConsent,
          ...(plan === 'bundle' ? { withReportId: reportId } : {}),
          ...(promoCodeForPlan ? { promoCode: promoCodeForPlan } : {}),
        });
      reachGoal('checkout_start');
      rememberGuestToken();
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось начать оплату');
      setPaying(false);
    }
  }

  // «Показать результат» на шаге почты — /claim (почта, согласия, письмо с
  // результатом), затем три важных пункта и экран результата. 409 — почта уже
  // зарегистрирована: предлагаем войти, результат всё равно можно посмотреть.
  async function submitContact() {
    if (!email || !email.includes('@')) {
      setError('Укажите email');
      return;
    }
    if (!acceptedTerms) {
      setError('Нужно принять пользовательское соглашение и дать согласие на обработку персональных данных');
      return;
    }
    setError('');
    setContactConflict(false);
    setClaiming(true);
    try {
      await guestApi.post('/platform/anonymous-audit/claim', { email, acceptedTerms, analyticsConsent, marketingConsent });
      setClaimed(true);
      reachGoal('result_contact');
      if (marketingConsent) reachGoal('result_contact_marketing');
      guestApi.get('/platform/anonymous-audit/top-risks').then(({ data }) => setTopRisks(data.top)).catch(() => {});
      setStep('result');
    } catch (err) {
      if (err.response?.status === 409) setContactConflict(true);
      setError(err.response?.data?.error || 'Не удалось сохранить почту');
    } finally {
      setClaiming(false);
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
      setError('Нужно принять пользовательское соглашение и дать согласие на обработку персональных данных');
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
    //
    // overscrollBehaviorY:'contain' + WebkitOverflowScrolling:'touch' +
    // paddingBottom с запасом (09.09.2026, тот же класс бага, что уже
    // чинили в AuthShell/Login.jsx 06.09.2026 — этот файл там прямо назван
    // в комментарии как ещё не тронутый) — на iOS кнопка "Начать тест"
    // сидела вплотную к границе скролл-контейнера, "резиновый" отскок
    // (bounce-back) при долистывании до упора съедал тап по кнопке: палец
    // убирался ещё во время пружинящей анимации возврата. contain глушит
    // часть отскока, буфер снизу отодвигает кнопку от самой границы, чтобы
    // к моменту тапа анимация уже закончилась.
    //
    // className="dvh-scroll" вместо height:'100vh' инлайном (09.09.2026,
    // живая жалоба владельца со скриншота — "Завершить тест" уходила под
    // панель Safari) — тот же баг, что уже чинили для .layout-viewport
    // (16.08.2026) и .auth-shell (06.09.2026): 100vh считается БЕЗ учёта
    // скрывающейся панели браузера, sticky-кнопка внизу контейнера
    // оказывалась ниже реально видимой области. См. styles.css .dvh-scroll.
    <div className="dvh-scroll" style={{
      maxWidth: 560, margin: '0 auto', padding: '24px 16px', fontFamily: F,
      overflowY: 'auto', overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch',
      paddingBottom: 'max(64px, env(safe-area-inset-bottom, 0px) + 40px)',
    }}>
      {paymentDone && <DoneStep />}
      {!paymentDone && step === 'intro' && (
        <IntroStep
          niche={niche} setNiche={setNiche}
          legalForm={legalForm} setLegalForm={setLegalForm}
          workModel={workModel} setWorkModel={setWorkModel}
          onStart={start} starting={starting} error={error}
          innProps={{ enabled: innEnabled, inn, setInn, confirmOwn, setConfirmOwn, onPrefill: prefillFromInn, prefilling, prefill, prefillError }}
        />
      )}
      {!paymentDone && step === 'test' && session && (
        <TestStep session={session} answers={answers} setAnswer={setAnswer} onSubmit={submitTest} submitting={submittingTest} error={error} />
      )}
      {!paymentDone && step === 'contact' && result && (
        <ContactStep
          result={result}
          email={email} setEmail={setEmail}
          setAcceptedTerms={setAcceptedTerms}
          analyticsConsent={analyticsConsent} setAnalyticsConsent={setAnalyticsConsent}
          marketingConsent={marketingConsent} setMarketingConsent={setMarketingConsent}
          onSubmit={submitContact} submitting={claiming} error={error}
          onSkipAfterError={contactConflict ? () => { setError(''); setAcceptedTerms(false); setStep('result'); } : null}
        />
      )}
      {!paymentDone && step === 'result' && result && (
        <ResultStep
          topRisks={topRisks}
          result={result}
          email={email} setEmail={setEmail}
          acceptedTerms={acceptedTerms} setAcceptedTerms={setAcceptedTerms}
          analyticsConsent={analyticsConsent} setAnalyticsConsent={setAnalyticsConsent}
          onPay={pay} paying={paying}
          onClaimFree={claimFree} claiming={claiming} claimed={claimed}
          error={error}
          promoInput={promoInput} setPromoInput={setPromoInput} promoQuote={promoQuote}
          promoError={promoError} promoChecking={promoChecking}
          plan={plan} setPlan={setPlan} docsAddon={docsAddon} covered={covered}
          innUsed={!!prefill?.found}
        />
      )}
      {!paymentDone && step === 'result' && outsideFindings && outsideFindings.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Что видно о вас в реестрах</div>
          <div style={{ fontSize: 12.5, color: C.secondary, marginBottom: 14, lineHeight: 1.5 }}>
            Налоговая, проверки, суды — по вашему ИНН, на сегодня. Сохраните результат, и по подписке будем сверять реестры
            регулярно и писать, если что-то изменится.
          </div>
          <OutsideFindingsList findings={outsideFindings} />
        </Card>
      )}
    </div>
  );
}
