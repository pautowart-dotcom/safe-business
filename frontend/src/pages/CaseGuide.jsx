import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { Card, C } from '../ui/components.jsx';
import {
  CASE_CATALOG,
  S1_QUESTIONS,
  buildS1Plan,
  PAID_LABEL,
  S1_TITLE,
} from '../content/caseBranches.js';

const STORAGE_KEY = 'bezbiz_episode_s1_v1';

function loadEpisode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveEpisode(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function Catalog({ onOpen, navigate, episodes, asHome }) {
  return (
    <div>
      {asHome && (
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.subtle, marginBottom: 10 }}>
          Безопасный бизнес
        </div>
      )}
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Какую ситуацию закрыть?</div>
      <div style={{ fontSize: 13.5, color: C.subtle, lineHeight: 1.45, marginBottom: 16 }}>
        Выберите сюжет. План — бесплатно. Бумаги — разово, без обязательной подписки.
      </div>
      {episodes?.length > 0 && (
        <Card style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => onOpen('s1', 'episode')}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.subtle, marginBottom: 4 }}>Уже есть папка</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{S1_TITLE}</div>
          <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 4 }}>Открыть папку эпизода →</div>
        </Card>
      )}
      {CASE_CATALOG.map((item) => {
        const live = item.status === 'live';
        const link = item.status === 'link';
        const disabled = item.status === 'soon';
        return (
          <Card
            key={item.id}
            style={{
              marginBottom: 10,
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.55 : 1,
            }}
            onClick={() => {
              if (live) onOpen(item.id);
              else if (link && item.to) navigate(item.to, item.state ? { state: item.state } : undefined);
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 800 }}>{item.want}</div>
            <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 4 }}>
              {disabled ? 'Скоро' : item.blurb}
              {live || link ? ' →' : ''}
            </div>
          </Card>
        );
      })}
      <div style={{ fontSize: 12, color: C.subtle, marginTop: 10, lineHeight: 1.4 }}>
        Это порядок действий и готовые бумаги, не юридическая консультация и не гарантия проверки.
      </div>
    </div>
  );
}

function Quiz({ answers, setAnswers, onBack, onDone }) {
  const [i, setI] = useState(0);
  const q = S1_QUESTIONS[i];

  return (
    <div>
      <button type="button" onClick={onBack} style={linkBtn}>← К ситуациям</button>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 6 }}>{i + 1} из {S1_QUESTIONS.length}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>{q.text}</div>
      {q.options.map((opt) => {
        const selected = answers[q.key] === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              const next = { ...answers, [q.key]: opt.value };
              setAnswers(next);
              if (i + 1 < S1_QUESTIONS.length) setI(i + 1);
              else onDone(next);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              marginBottom: 8,
              padding: '14px 16px',
              borderRadius: 12,
              border: `1.5px solid ${selected ? C.primary : C.border}`,
              background: selected ? `${C.primary}12` : '#fff',
              color: C.primary,
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Plan({ answers, onBackCatalog, onClose, onFolder }) {
  const steps = useMemo(() => buildS1Plan(answers), [answers]);

  return (
    <div>
      <button type="button" onClick={onBackCatalog} style={linkBtn}>← К ситуациям</button>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Ваш план</div>
      <div style={{ fontSize: 13.5, color: C.subtle, lineHeight: 1.45, marginBottom: 16 }}>
        {S1_TITLE}. План бесплатный — закрытие бумагами по желанию.
      </div>
      {steps.map((step, idx) => (
        <StepCard key={`${idx}-${step.title}`} step={step} idx={idx} />
      ))}
      <button type="button" onClick={onClose} style={primaryBtn}>
        Закрыть эту ситуацию →
      </button>
      <button type="button" onClick={onFolder} style={secondaryBtn}>
        Вести папку бесплатно
      </button>
    </div>
  );
}

function StepCard({ step, idx, done, onToggle, navigate }) {
  const paid = step.paid ? PAID_LABEL[step.paid] : null;
  return (
    <Card style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={done ? 'Снять отметку' : 'Отметить сделанным'}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              flexShrink: 0,
              border: `1.5px solid ${done ? C.green : C.border}`,
              background: done ? C.green : C.surface,
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {done ? '✓' : idx + 1}
          </button>
        ) : (
          <span style={numStyle}>{idx + 1}</span>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, textDecoration: done ? 'line-through' : 'none', color: done ? C.subtle : C.primary }}>
            {step.title}
          </div>
          <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 4, lineHeight: 1.4 }}>{step.why}</div>
          <div style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.45 }}>{step.how}</div>
          {paid?.to && navigate && (
            <button type="button" onClick={() => navigate(paid.to, paid.state ? { state: paid.state } : undefined)} style={{ ...linkBtn, marginTop: 10 }}>
              {paid.label} →
            </button>
          )}
          {paid && !paid.to && (
            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: C.subtle }}>{paid.label} — скоро</div>
          )}
          {step.confidence === 'check' && (
            <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>Сверить по актуальным правилам ФНС / кассы</div>
          )}
          {step.confidence === 'gap' && (
            <div style={{ fontSize: 11, color: C.orange, marginTop: 8 }}>Нужна отдельная ветка — пока ориентир</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function CloseOffer({ addon, paying, error, onPay, onBack, onSkipPaid }) {
  const price = addon?.priceRub;
  const purchased = !!addon?.purchased;

  return (
    <div>
      <button type="button" onClick={onBack} style={linkBtn}>← К плану</button>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Пакет закрытия ситуации</div>
      <div style={{ fontSize: 13.5, color: C.subtle, lineHeight: 1.45, marginBottom: 14 }}>
        Бумаги под студию для этого сюжета. Один раз — без обязательной подписки.
      </div>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{S1_TITLE}</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: C.primary }}>
          <li>План шагов уже ваш — бесплатно</li>
          <li>Пакет шаблонов документов студии (оферта, согласия и др.)</li>
          <li>Папка эпизода: отметить сделанное, скачать бумаги</li>
        </ul>
        <div style={{ fontSize: 12, color: C.subtle, marginTop: 12, lineHeight: 1.4 }}>
          Не юридическая консультация и не гарантия проверки. Партнёр на подачу патента/кассы — отдельно, без обещания «оформим за вас».
        </div>
      </Card>
      {purchased ? (
        <button type="button" onClick={onSkipPaid} style={primaryBtn}>Открыть папку эпизода →</button>
      ) : (
        <>
          <button type="button" disabled={paying || price == null} onClick={onPay} style={primaryBtn}>
            {paying ? 'Открываем оплату…' : price != null ? `Закрыть разово · ${Number(price).toLocaleString('ru-RU')} ₽` : 'Загрузка цены…'}
          </button>
          {error && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
          <button type="button" onClick={onSkipPaid} style={secondaryBtn}>Пока только папка без бумаг</button>
        </>
      )}
    </div>
  );
}

function EpisodeFolder({ answers, doneMap, setDoneMap, purchased, onBackCatalog, navigate }) {
  const steps = useMemo(() => buildS1Plan(answers), [answers]);
  const left = steps.filter((_, i) => !doneMap[i]).length;
  const started = answers?._startedAt || Date.now();

  return (
    <div>
      <button type="button" onClick={onBackCatalog} style={linkBtn}>← К ситуациям</button>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Папка эпизода</div>
      <div style={{ fontSize: 13.5, color: C.subtle, lineHeight: 1.45, marginBottom: 6 }}>{S1_TITLE}</div>
      <div style={{ fontSize: 12, color: C.subtle, marginBottom: 14 }}>
        с {new Date(started).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        {left > 0 ? ` · осталось шагов: ${left}` : ' · всё отмечено'}
      </div>

      {purchased ? (
        <Card
          style={{ marginBottom: 12, cursor: 'pointer' }}
          onClick={() => navigate('/security', { state: { dashboardTab: 'violations', openTemplates: true } })}
        >
          <div style={{ fontSize: 15, fontWeight: 800 }}>Скачать бумаги</div>
          <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 4 }}>Шаблоны документов студии →</div>
        </Card>
      ) : (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Бумаги ещё не куплены</div>
          <div style={{ fontSize: 12.5, color: C.subtle, marginTop: 4, lineHeight: 1.4 }}>
            План и отметки бесплатны. Пакет шаблонов — разово, когда будете готовы.
          </div>
        </Card>
      )}

      {steps.map((step, idx) => (
        <StepCard
          key={`${idx}-${step.title}`}
          step={step}
          idx={idx}
          done={!!doneMap[idx]}
          navigate={navigate}
          onToggle={() => {
            const next = { ...doneMap, [idx]: !doneMap[idx] };
            setDoneMap(next);
            const prev = loadEpisode() || {};
            saveEpisode({ ...prev, answers, doneMap: next, purchased: !!purchased });
          }}
        />
      ))}

      <button
        type="button"
        onClick={() => navigate('/deadlines')}
        style={secondaryBtn}
      >
        По желанию: поставить дату в сроки
      </button>
    </div>
  );
}

const linkBtn = {
  background: 'none',
  border: 'none',
  padding: 0,
  marginBottom: 12,
  color: C.primary,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
};
const numStyle = {
  width: 26,
  height: 26,
  borderRadius: 13,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 800,
  background: C.surface,
  color: C.secondary,
  border: `1px solid ${C.border}`,
};
const primaryBtn = {
  marginTop: 8,
  width: '100%',
  padding: '14px 16px',
  borderRadius: 12,
  border: 'none',
  background: C.primary,
  color: '#fff',
  fontWeight: 800,
  fontSize: 15,
  fontFamily: 'inherit',
  cursor: 'pointer',
};
const secondaryBtn = {
  marginTop: 8,
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  background: 'transparent',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: C.primary,
  fontSize: 14,
};

function initialPhase(branch, params, saved) {
  if (params.get('addonPayment') === 'done' && (branch === 's1' || !branch)) return 'episode';
  if (params.get('phase') === 'episode' || params.get('episode') === '1') return 'episode';
  if (params.get('phase') === 'close') return 'close';
  if (branch === 's1' && saved?.answers && Object.keys(saved.answers).length >= S1_QUESTIONS.length) {
    return saved.purchased || Object.keys(saved.doneMap || {}).length ? 'episode' : 'plan';
  }
  if (branch === 's1') return 'quiz';
  return 'catalog';
}

export default function CaseGuide({ asHome = false }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const branch = params.get('b');
  const saved = loadEpisode();
  const [answers, setAnswers] = useState(saved?.answers || {});
  const [doneMap, setDoneMap] = useState(saved?.doneMap || {});
  const [phase, setPhase] = useState(() => initialPhase(branch, params, saved));
  const [addon, setAddon] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  useEffect(() => {
    const ep = loadEpisode();
    if (ep?.answers) {
      setAnswers(ep.answers);
      setDoneMap(ep.doneMap || {});
    }
    api.get('/platform/addons', { silent: true })
      .then(({ data }) => {
        const row = (data || []).find((x) => x.addonKey === 'document_templates') || null;
        setAddon(row);
        if (row?.purchased) {
          const prev = loadEpisode() || {};
          if (!prev.purchased) {
            saveEpisode({
              ...prev,
              answers: prev.answers || ep?.answers || {},
              doneMap: prev.doneMap || ep?.doneMap || {},
              purchased: true,
            });
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.get('addonPayment') !== 'done') return;
    const next = new URLSearchParams(params);
    next.delete('addonPayment');
    next.set('b', 's1');
    next.set('phase', 'episode');
    setParams(next, { replace: true });
    const prev = loadEpisode() || {};
    saveEpisode({
      ...prev,
      answers: prev.answers || answers,
      doneMap: prev.doneMap || {},
      purchased: true,
    });
    if (prev.answers) setAnswers(prev.answers);
    setPhase('episode');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const purchased = !!(addon?.purchased || loadEpisode()?.purchased);

  const openBranch = (id, forcePhase) => {
    if (id !== 's1') return;
    setParams({ b: 's1', ...(forcePhase ? { phase: forcePhase } : {}) });
    const ep = loadEpisode();
    if (ep?.answers) {
      setAnswers(ep.answers);
      setDoneMap(ep.doneMap || {});
    }
    if (forcePhase === 'episode') {
      setPhase('episode');
      return;
    }
    if (ep?.answers && Object.keys(ep.answers).length >= S1_QUESTIONS.length) {
      setPhase(ep.purchased || Object.keys(ep.doneMap || {}).length ? 'episode' : 'plan');
    } else {
      setPhase('quiz');
    }
  };

  const backCatalog = () => {
    setParams({});
    setPhase('catalog');
  };

  const goPhase = (p) => {
    setPhase(p);
    const next = { b: 's1' };
    if (p === 'close' || p === 'episode') next.phase = p;
    setParams(next);
  };

  async function payClose() {
    setPaying(true);
    setPayError('');
    try {
      const { data } = await api.post('/platform/addons/document_templates/checkout', { returnTo: 's1_episode' });
      window.location.href = data.confirmationUrl;
    } catch (err) {
      setPayError(err.response?.data?.error || 'Не удалось начать оплату');
      setPaying(false);
    }
  }

  const episodes = loadEpisode()?.answers ? ['s1'] : [];

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: asHome ? '4px 0 28px' : '8px 0 28px' }}>
      {phase === 'catalog' && <Catalog asHome={asHome} onOpen={openBranch} navigate={navigate} episodes={episodes} />}
      {phase === 'quiz' && (
        <Quiz
          answers={answers}
          setAnswers={setAnswers}
          onBack={backCatalog}
          onDone={(next) => {
            const withMeta = { ...next, _startedAt: Date.now() };
            saveEpisode({ answers: withMeta, doneMap: {}, purchased: false });
            setAnswers(withMeta);
            setDoneMap({});
            goPhase('plan');
          }}
        />
      )}
      {phase === 'plan' && (
        <Plan
          answers={answers}
          onBackCatalog={backCatalog}
          onClose={() => goPhase('close')}
          onFolder={() => {
            const prev = loadEpisode() || { answers };
            saveEpisode({ ...prev, answers, doneMap: prev.doneMap || {}, purchased: !!prev.purchased });
            goPhase('episode');
          }}
        />
      )}
      {phase === 'close' && (
        <CloseOffer
          addon={addon}
          paying={paying}
          error={payError}
          onPay={payClose}
          onBack={() => goPhase('plan')}
          onSkipPaid={() => {
            const prev = loadEpisode() || { answers };
            saveEpisode({ ...prev, answers, doneMap: prev.doneMap || {}, purchased: !!addon?.purchased });
            goPhase('episode');
          }}
        />
      )}
      {phase === 'episode' && (
        <EpisodeFolder
          answers={answers}
          doneMap={doneMap}
          setDoneMap={setDoneMap}
          purchased={purchased}
          onBackCatalog={backCatalog}
          navigate={navigate}
        />
      )}
      {phase === 'catalog' && (
        <div style={{ marginTop: 18, fontSize: 12, color: C.subtle, lineHeight: 1.4 }}>
          Бесплатный план · разовые бумаги · кабинет по желанию
        </div>
      )}
      {asHome && phase === 'catalog' && (
        <button
          type="button"
          onClick={() => navigate('/?cabinet=1')}
          style={{ ...secondaryBtn, marginTop: 16 }}
        >
          Открыть кабинет (сроки, тест, остальное)
        </button>
      )}
    </div>
  );
}
