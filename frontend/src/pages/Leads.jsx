import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { nextPhoneValue } from '../utils/phone.js';
import { Card, Field, TextInput, TextArea, Select, Btn, C } from '../ui/components.jsx';

// Модуль "Заявки" (20.08.2026) — первый повод: клининг, владелица сама
// разбирает входящие заявки без менеджера продаж. Сознательно простой список
// со статусом, без конвертации в клиента (см. leads.routes.js) — маленький,
// обратимый первый шаг, дорабатывается по реальной обратной связи, а не
// заранее продуманная воронка со всеми возможными полями.
const STATUS_LABELS = { new: 'Новый', contacted: 'Связались', ordered: 'Заказ', paid: 'Оплачено' };
const STATUS_ORDER = ['new', 'contacted', 'ordered', 'paid'];
const CLIENT_TYPE_LABELS = { individual: 'Физлицо', legal_entity: 'Юрлицо' };
const EMPTY_FORM = { name: '', phone: '', clientType: 'individual', comment: '' };

function nextStatus(status) {
  const i = STATUS_ORDER.indexOf(status);
  return i >= 0 && i < STATUS_ORDER.length - 1 ? STATUS_ORDER[i + 1] : null;
}

// "2 раза"/"5 раз"/"21 раз" — стандартное русское склонение числительных,
// не завязано конкретно на "раз" (пригодится, если понадобится где-то ещё).
function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function LeadCard({ lead, onAdvance, onStatusChange, onDelete }) {
  const next = nextStatus(lead.status);
  const paid = lead.status === 'paid';
  return (
    <Card style={{ opacity: paid ? 0.6 : 1, marginBottom: 10 }}>
      {/* Статус раньше показывался и здесь текстом, и ниже в <Select> (текущее
          значение выпадающего списка) — одно и то же слово дважды на одной
          карточке (21.08.2026, владелец: "новый клиент пишутся два раза").
          Выпадающий список и так всегда показывает актуальный статус,
          отдельная подпись была чистым дублированием. */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{lead.name}</div>
        <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
          {CLIENT_TYPE_LABELS[lead.client_type] || lead.client_type}{lead.phone ? ` · ${lead.phone}` : ''}
        </div>
        {/* Связь с "Клиентами" и повторные обращения (21.08.2026, владелец:
            "если клиент уже третий раз закажет уборку, определится ли он?")
            — сопоставление по телефону при создании заявки, см.
            backend/src/modules/leads/leadMatching.js. repeat_count включает
            саму текущую заявку, поэтому ">1" — правильное условие "уже было". */}
        {lead.client_name && (
          <div style={{ fontSize: 11, color: C.primary, fontWeight: 600, marginTop: 3 }}>Клиент: {lead.client_name}</div>
        )}
        {lead.repeat_count > 1 && (
          <div style={{ fontSize: 11, color: C.orange, fontWeight: 600, marginTop: 3 }}>
            Обращались {lead.repeat_count} {pluralRu(lead.repeat_count, 'раз', 'раза', 'раз')}
          </div>
        )}
      </div>
      {lead.comment && <div style={{ fontSize: 13, color: C.secondary, marginTop: 8 }}>{lead.comment}</div>}
      <div style={{ fontSize: 11, color: C.subtle, marginTop: 8 }}>
        {new Date(lead.created_at).toLocaleDateString('ru-RU')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {next && <Btn small onClick={() => onAdvance(lead.id, next)}>→ {STATUS_LABELS[next]}</Btn>}
        <Select value={lead.status} onChange={(e) => onStatusChange(lead.id, e.target.value)} style={{ width: 'auto', padding: '8px 10px', fontSize: 13 }}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Btn small variant="secondary" onClick={() => onDelete(lead.id)}>Удалить</Btn>
      </div>
    </Card>
  );
}

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Публичная ссылка приёма заявок (20.08.2026) — грузится лениво по клику
  // "Показать ссылку", а не сразу при открытии страницы: токен генерируется
  // на бэкенде при первом запросе (leads-public.routes.js), незачем делать
  // это на каждое открытие "Заявок", если владелица ссылкой не пользуется.
  const [publicLink, setPublicLink] = useState(null);
  const [publicLinkLoading, setPublicLinkLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Выгрузка CSV (21.08.2026) — api.get с responseType:'blob', а не обычная
  // <a href="...">: авторизация здесь по Bearer-токену в заголовке
  // (api/client.js), не по cookie, обычная ссылка не смогла бы его
  // передать. Временный <a download> + blob-URL — стандартный обходной путь
  // для скачивания файла через авторизованный axios-запрос.
  async function handleExportCsv() {
    setExporting(true);
    try {
      const res = await api.get('/modules/leads/export.csv', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Не удалось скачать список');
    } finally {
      setExporting(false);
    }
  }

  function load() {
    return api.get('/modules/leads').then((res) => setLeads(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function showPublicLink() {
    if (publicLink) return;
    setPublicLinkLoading(true);
    try {
      const res = await api.get('/platform/leads-public/token');
      // Роутер смонтирован с basename="/lk" (main.jsx) — путь /l/:token в
      // App.jsx на самом деле открывается только по /lk/l/:token, у nginx
      // нет отдельного location для голого /l/ на корне домена, без этого
      // префикса ссылка проваливалась в лендинг вместо формы заявки.
      setPublicLink(`${window.location.origin}/lk/l/${res.data.token}`);
    } finally {
      setPublicLinkLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.name.trim()) {
      setError('Укажите имя или название клиента');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/modules/leads', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось добавить заявку');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id, status) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    try {
      await api.patch(`/modules/leads/${id}`, { status });
    } catch {
      load();
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить заявку?')) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    try {
      await api.delete(`/modules/leads/${id}`);
    } catch {
      load();
    }
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Заявки</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {leads.length > 0 && (
            <Btn small variant="secondary" onClick={handleExportCsv} disabled={exporting}>{exporting ? '…' : 'Скачать CSV'}</Btn>
          )}
          <Btn small onClick={() => setShowForm((v) => !v)}>{showForm ? 'Отмена' : '+ Новая заявка'}</Btn>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Приём заявок без вашего участия</div>
        {!publicLink ? (
          <>
            <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>
              Публичная ссылка — вставьте её в шапку Instagram, автоответ WhatsApp и т.п.: тот, кто перейдёт, сам оставит контакт, и заявка появится в списке ниже.
            </div>
            <Btn small variant="secondary" onClick={showPublicLink} disabled={publicLinkLoading}>
              {publicLinkLoading ? 'Загрузка...' : 'Показать ссылку'}
            </Btn>
          </>
        ) : (
          <>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', marginBottom: 10, wordBreak: 'break-all', fontSize: 13 }}>
              {publicLink}
            </div>
            <Btn
              small
              onClick={async () => {
                const ok = await copyToClipboard(publicLink);
                if (ok) {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }
              }}
            >
              {linkCopied ? '✓ Скопировано' : 'Скопировать ссылку'}
            </Btn>
          </>
        )}
      </Card>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          <Field label="Имя / название">
            <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Мария Иванова или ООО «Ромашка»" />
          </Field>
          <Field label="Телефон">
            <TextInput type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: nextPhoneValue(e.target.value) })} placeholder="+7 (900) 123-45-67" />
          </Field>
          <Field label="Тип клиента">
            <Select value={form.clientType} onChange={(e) => setForm({ ...form, clientType: e.target.value })}>
              <option value="individual">Физлицо</option>
              <option value="legal_entity">Юрлицо</option>
            </Select>
          </Field>
          <Field label="Комментарий">
            <TextArea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Что нужно, откуда узнали, детали..." />
          </Field>
          <Btn onClick={handleAdd} disabled={saving}>{saving ? 'Сохраняю...' : 'Добавить'}</Btn>
        </Card>
      )}

      {leads.length === 0 && <div className="empty-hint">Заявок пока нет — добавьте первую кнопкой выше</div>}
      {leads.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onAdvance={(id, status) => handleStatusChange(id, status)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
