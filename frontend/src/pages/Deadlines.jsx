import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { C, Group, Row } from '../ui/components.jsx';
import DeadlineSheet from '../components/DeadlineSheet.jsx';
import { daysLeft, dueTag, deadlineIcon } from '../utils/deadlineActions.js';
import { downloadPdf } from '../utils/downloadPdf.js';

// Пакет 4, Этап 4: допечатка журнала (related_entity_type ===
// 'generated_journal_reprint') — не ручная отметка, а действие, которое
// заводит новый бланк и скачивает его; запускается сразу по тапу.
const REPRINT_RELATED_TYPE = 'generated_journal_reprint';

// Пакет 4, Этап 1: 'legal' → 'documents', добавлены 'premises' и 'journals'.
// 'journals' убрана 05.08.2026 — раздел заморожен, сервер эту категорию
// теперь всегда отдаёт пустой (deadlines.routes.js), фильтр был бы мёртвым.
const CATEGORIES = [
  { key: 'staff', label: 'Кадровые' },
  { key: 'premises', label: 'Помещение' },
  { key: 'documents', label: 'Юридические' },
  { key: 'tax', label: 'Налоговые' },
  { key: 'financial', label: 'Финансовые' },
  { key: 'operations', label: 'Операционные' },
];
// Категория с бэкенда, для которой здесь нет описания — нейтральная подпись
// вместо падения страницы.
const UNKNOWN_CATEGORY = { label: 'Другое' };
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

function fullDate(d) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Deadlines() {
  const { isManagement, isAdmin } = useAuth();
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reprinting, setReprinting] = useState(null);
  const [openItem, setOpenItem] = useState(null);
  // Налоговые дедлайны скрыты от Администратора (Этап 4) — сам фильтр по
  // ней тоже незачем показывать, он бы вёл в пустой список.
  const visibleCategories = isAdmin ? CATEGORIES.filter((c) => c.key !== 'tax') : CATEGORIES;

  function load() {
    return api
      .get('/platform/deadlines', { params: category ? { category } : {} })
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);
  usePullToRefresh(load);

  async function reprintJournal(item) {
    if (reprinting) return;
    setReprinting(item.id);
    setError('');
    try {
      const { data } = await api.post(`/platform/generated-journals/${item.related_entity_id}/reprint`);
      await downloadPdf(`/platform/generated-journals/${data.id}/download`, `${data.journalNumber}.pdf`, setError);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось создать новый журнал');
    } finally {
      setReprinting(null);
    }
  }

  // 18.10.2026, вид приложения: группы по срочности, строки «как в
  // Настройках», тап — шторка с кнопками (utils/deadlineActions.js — те же
  // правила, что были здесь карточками). Мастеру — только даты, без
  // «просрочено» и без действий (решение владельца: без давления).
  const groups = [
    ['Горит', items.filter((i) => i.due_date && daysLeft(i.due_date) <= 0)],
    ['Нужно внимание', items.filter((i) => !i.due_date)],
    ['Дальше', items.filter((i) => i.due_date && daysLeft(i.due_date) > 0)],
  ].filter(([, list]) => list.length > 0);

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 16 }}>Дедлайны</div>

      {/* Баг №9: все категории сразу, переносом, без горизонтального скролла. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {[{ key: '', label: 'Все' }, ...visibleCategories].map((c) => (
          <button
            key={c.key || 'all'}
            onClick={() => setCategory(c.key)}
            className="ui-btn"
            style={{
              padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: category === c.key ? C.primary : C.bg, color: category === c.key ? '#FFF' : C.secondary,
              boxShadow: category === c.key ? 'none' : '0 0 0 1px rgba(15,27,45,.08)', fontSize: 13, fontWeight: 600,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : items.length === 0 ? (
        <Group><Row icon="check" tone="green" title="Предстоящих сроков нет" subtitle="Когда появятся — напомним заранее." /></Group>
      ) : !isManagement ? (
        <Group>
          {items.map((item) => (
            <Row key={item.id} icon={deadlineIcon(item)} title={item.title} subtitle={item.due_date ? fullDate(item.due_date) : 'Требует внимания'} />
          ))}
        </Group>
      ) : (
        <>
          {groups.map(([title, list]) => (
            <Group key={title} title={title} aside={String(list.length)}>
              {list.map((item) => {
                const tag = dueTag(item);
                const isReprint = item.related_entity_type === REPRINT_RELATED_TYPE;
                const cat = CATEGORY_BY_KEY[item.category] || UNKNOWN_CATEGORY;
                const hint = isReprint ? (reprinting === item.id ? ' · создаём…' : ' · нажмите, чтобы скачать новый') : '';
                return (
                  <Row
                    key={item.id}
                    icon={deadlineIcon(item)}
                    tone={tag.tone}
                    title={item.title}
                    subtitle={`${cat.label}${item.due_date ? ` · ${fullDate(item.due_date)}` : ''}${hint}`}
                    tag={tag.text}
                    onClick={() => (isReprint ? reprintJournal(item) : setOpenItem(item))}
                  />
                );
              })}
            </Group>
          ))}
          <DeadlineSheet item={openItem} onClose={() => setOpenItem(null)} onDone={() => load()} />
        </>
      )}
    </div>
  );
}
