import { useEffect, useRef, useState } from 'react';
import { C, F, SH, Icon } from '../ui/components.jsx';
import { haptic } from '../utils/telegram.js';

// Тест «живее» (18.10.2026, этап 9, идея владельца 16.10: «не гугл-форма»).
// Один вопрос на экран, крупные варианты, реакция сразу после ответа и
// автопереход дальше. Реакция — только по грубой отметке ответа с сервера
// (question.tones: ok | partial | gap), без штрафов и решений: они в
// заключении. Тон — честный, без запугивания и без обещаний.
// Общий для гостевого теста (AnonymousAudit.jsx) и теста в кабинете
// (Security.jsx → AuditQuestionnaire).

const REACTION_MS = 900;

const UNSURE = /не уверен|не знаю|затрудняюсь/i;

function reactionFor(tone, label) {
  if (tone === 'ok') return { kind: 'ok', title: 'В порядке', text: 'Этот пункт закрыт.' };
  if (tone === 'partial' && UNSURE.test(label)) return { kind: 'unsure', title: 'Подскажем, где проверить', text: 'В результате будет видно, на что посмотреть.' };
  if (tone === 'partial') return { kind: 'partial', title: 'Частично', text: 'В результате покажем, что доделать.' };
  return { kind: 'gap', title: 'Запишем', text: 'Частый пункт — в результате будет видно, что сделать.' };
}

const KIND_STYLE = {
  ok: { color: C.green, bg: C.greenBg, icon: 'check' },
  partial: { color: C.orange, bg: C.orangeBg, icon: 'edit' },
  unsure: { color: C.blue, bg: C.blueBg, icon: 'help' },
  gap: { color: C.secondary, bg: '#F1F3F6', icon: 'doc' },
};

export default function TestQuestion({ questions, index, blockLabels, topLine, onAnswer, onBack, onCancel, error, busy }) {
  const question = questions[index];
  const [picked, setPicked] = useState(null);
  // Счётчик «уже в порядке» — по ответам этого прохождения (код → тон).
  const tally = useRef({});
  const timer = useRef(null);

  useEffect(() => {
    setPicked(null);
    return () => clearTimeout(timer.current);
  }, [question?.code]);
  // Ответ не сохранился (ошибка сети) — снова даём выбрать.
  useEffect(() => {
    if (error) setPicked(null);
  }, [error]);

  if (!question) return null;

  const stageBlocks = [];
  for (const q of questions) if (!stageBlocks.includes(q.block)) stageBlocks.push(q.block);
  const stageIndex = stageBlocks.indexOf(question.block);
  const inStage = questions.filter((q) => q.block === question.block);
  const posInStage = inStage.findIndex((q) => q.code === question.code);
  const lastInStage = posInStage === inStage.length - 1;
  const blockLabel = blockLabels[question.block] || 'Прочее';

  const answered = Object.values(tally.current);
  const okCount = answered.filter((t) => t === 'ok').length;

  function pick(i) {
    if (picked !== null || busy) return;
    const tone = question.tones?.[i] || 'partial';
    tally.current[question.code] = tone;
    setPicked(i);
    haptic(tone === 'ok' ? 'success' : 'light');
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => onAnswer(i), reduce ? 350 : REACTION_MS);
  }

  const reaction = picked !== null ? reactionFor(question.tones?.[picked] || 'partial', question.answers[picked]) : null;
  const rs = reaction ? KIND_STYLE[reaction.kind] : null;

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, minHeight: 24 }}>
        {onBack ? (
          <button type="button" onClick={onBack} className="ui-tab" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.secondary, fontSize: 13.5, cursor: 'pointer', padding: 0, fontFamily: F }}>
            <Icon name="arrow" size={14} color={C.secondary} />Назад
          </button>
        ) : <span />}
        <span style={{ fontSize: 13, color: C.subtle, fontVariantNumeric: 'tabular-nums' }}>Вопрос {index + 1} из {questions.length}</span>
        {onCancel ? (
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 13.5, cursor: 'pointer', fontFamily: F }}>Прервать</button>
        ) : <span />}
      </div>

      {topLine && <div style={{ fontSize: 12.5, color: C.primary, fontWeight: 700, marginBottom: 8 }}>{topLine}</div>}

      {/* Прогресс по этапам — сегменты, а не одна бесконечная полоса. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {stageBlocks.map((b, i) => (
          <div key={b} style={{ flex: 1, height: 6, borderRadius: 999, overflow: 'hidden', background: 'rgba(15,27,45,.1)' }}>
            <div
              style={{
                height: '100%', borderRadius: 999, background: C.primary,
                width: i < stageIndex ? '100%' : i === stageIndex ? `${Math.round(((posInStage + (picked !== null ? 1 : 0)) / inStage.length) * 100)}%` : '0%',
                transition: 'width .35s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 22 }}>
        <span style={{ fontSize: 12.5, color: C.subtle }}>Этап {stageIndex + 1} из {stageBlocks.length} · {blockLabel}</span>
        {answered.length > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: C.green, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            В порядке: {okCount} из {answered.length}
          </span>
        )}
      </div>

      <div key={question.code} className="ui-view">
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 8, color: C.primary }}>{question.text}</div>
        {question.hint && <div style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.5 }}>{question.hint}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {question.answers.map((label, i) => {
            const isPicked = picked === i;
            const dim = picked !== null && !isPicked;
            return (
              <button
                key={i}
                type="button"
                onClick={() => pick(i)}
                className="ui-press"
                disabled={picked !== null || busy}
                style={{
                  textAlign: 'left', padding: '15px 16px', borderRadius: 16, fontFamily: F, fontSize: 15, lineHeight: 1.4,
                  cursor: picked === null ? 'pointer' : 'default', color: C.primary,
                  background: isPicked ? rs.bg : C.bg,
                  border: `1.5px solid ${isPicked ? rs.color : 'transparent'}`,
                  boxShadow: isPicked ? 'none' : SH.card,
                  opacity: dim ? 0.45 : 1, transition: 'opacity .2s, background-color .2s, border-color .2s',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}
              >
                <span style={{ flex: 1 }}>{label}</span>
                {isPicked && <Icon name={rs.icon} size={18} color={rs.color} sw={2.4} />}
              </button>
            );
          })}
        </div>

        {/* Реакция на ответ — сразу, коротко, потом следующий вопрос. */}
        <div style={{ minHeight: 76, marginTop: 14 }} aria-live="polite">
          {reaction && (
            <div className="ui-view" style={{ background: rs.bg, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name={rs.icon} size={18} color={rs.color} sw={2.4} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: rs.color }}>{reaction.title}</div>
                <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.45, marginTop: 2 }}>
                  {reaction.text}
                  {lastInStage && stageIndex < stageBlocks.length - 1 && ` Этап «${blockLabel}» пройден.`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
