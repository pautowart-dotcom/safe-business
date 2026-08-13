import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, TextArea, Btn, Avatar, C } from '../ui/components.jsx';
import { downloadPdf, downloadFile } from '../utils/downloadPdf.js';

const EMPTY_FORM = { firstName: '', lastName: '', phone: '', preferences: '', notes: '', allergies: '' };
const EMPTY_WAITLIST_FORM = { service: '', comment: '' };
const EMPTY_PACKAGE_FORM = { title: '', totalSessions: '', totalAmount: '' };

// Лёгкий лист ожидания (владелец, 29.07.2026): нет расписания/слотов в
// приложении, поэтому это просто список "клиент хочет записаться" с ручной
// отметкой "связался" — без автоматики про свободное время, её физически
// неоткуда взять без календаря визитов на будущее.
function WaitlistView({ entries, loading, onMarkDone, onDelete }) {
  const waiting = entries.filter((e) => e.status === 'waiting');
  const done = entries.filter((e) => e.status === 'done');

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      {waiting.length === 0 && done.length === 0 && (
        <div className="empty-hint">Список пуст — добавляйте клиентов со страницы клиента, кнопка "+ В лист ожидания"</div>
      )}
      {waiting.map((e) => (
        <Card key={e.id}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{e.client_last_name} {e.client_first_name}</div>
          {e.service && <div style={{ fontSize: 13, color: C.secondary, marginTop: 2 }}>{e.service}</div>}
          {e.comment && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{e.comment}</div>}
          <div style={{ fontSize: 11, color: C.subtle, marginTop: 4 }}>
            {new Date(e.created_at).toLocaleDateString('ru-RU')}{e.created_by_name ? ` · ${e.created_by_name}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn small onClick={() => onMarkDone(e.id)}>✓ Связался, записали</Btn>
            <Btn small variant="secondary" onClick={() => onDelete(e.id)}>Убрать</Btn>
          </div>
        </Card>
      ))}
      {done.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.subtle, letterSpacing: '0.8px', textTransform: 'uppercase', margin: '20px 0 10px' }}>
            Обработано
          </div>
          {done.map((e) => (
            <Card key={e.id} style={{ opacity: 0.6 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{e.client_last_name} {e.client_first_name}</div>
              {e.service && <div style={{ fontSize: 13, color: C.secondary, marginTop: 2 }}>{e.service}</div>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

export default function Clients() {
  const { isManagement, isOwner } = useAuth();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dossierError, setDossierError] = useState('');
  const [tab, setTab] = useState('clients');
  const [waitlist, setWaitlist] = useState([]);
  const [waitlistLoading, setWaitlistLoading] = useState(true);
  const [showWaitlistForm, setShowWaitlistForm] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState(EMPTY_WAITLIST_FORM);
  const [packages, setPackages] = useState([]);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [packageForm, setPackageForm] = useState(EMPTY_PACKAGE_FORM);
  const [packageError, setPackageError] = useState('');
  // Импорт/экспорт базы (13.08.2026) — только владелец, см. backend
  // requireRole('owner') на этих роутах.
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const csvFileInputRef = useRef(null);
  const firstNameRef = useRef(null);

  function load(searchTerm) {
    return api
      .get('/modules/clients', { params: searchTerm ? { search: searchTerm } : {} })
      .then((res) => setClients(res.data))
      .finally(() => setLoading(false));
  }

  async function handleExport() {
    setCsvError('');
    await downloadFile('/modules/clients/export', 'clients-export.csv', 'text/csv;charset=utf-8', setCsvError, 'Не удалось скачать базу');
  }

  async function handleDownloadTemplate() {
    setCsvError('');
    await downloadFile('/modules/clients/import-template', 'clients-template.csv', 'text/csv;charset=utf-8', setCsvError, 'Не удалось скачать образец');
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvBusy(true);
    setCsvError('');
    setImportResult(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/modules/clients/import', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      load(search);
    } catch (err) {
      setCsvError(err.response?.data?.error || 'Не удалось загрузить файл');
    } finally {
      setCsvBusy(false);
    }
  }

  function loadWaitlist() {
    setWaitlistLoading(true);
    return api.get('/modules/clients/waitlist').then((res) => setWaitlist(res.data)).finally(() => setWaitlistLoading(false));
  }

  function loadPackages(clientId) {
    return api.get(`/modules/clients/${clientId}/packages`).then((res) => setPackages(res.data));
  }

  async function submitPackage() {
    setPackageError('');
    try {
      await api.post(`/modules/clients/${selected.id}/packages`, {
        title: packageForm.title,
        totalSessions: Number(packageForm.totalSessions),
        totalAmount: Number(packageForm.totalAmount),
      });
      setShowPackageForm(false);
      setPackageForm(EMPTY_PACKAGE_FORM);
      loadPackages(selected.id);
    } catch (err) {
      setPackageError(err.response?.data?.error || 'Не удалось создать абонемент');
    }
  }

  async function cancelPackage(id) {
    if (!confirm('Отменить абонемент? Уже использованные визиты никуда не денутся, но оставшиеся сессии сгорят.')) return;
    await api.delete(`/modules/clients/${selected.id}/packages/${id}`);
    loadPackages(selected.id);
  }

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Грузим сразу при монтировании (не только при переключении вкладки) —
  // иначе счётчик "(N)" на вкладке был бы пустым, пока не зайти в неё хотя бы раз.
  useEffect(() => {
    loadWaitlist();
  }, []);
  useEffect(() => {
    if (tab === 'waitlist') loadWaitlist();
  }, [tab]);

  useEffect(() => {
    if (selected) loadPackages(selected.id);
    else { setPackages([]); setShowPackageForm(false); setPackageForm(EMPTY_PACKAGE_FORM); setPackageError(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const refresh = () => load(search);
  usePullToRefresh(refresh);

  async function submitWaitlist() {
    await api.post(`/modules/clients/${selected.id}/waitlist`, waitlistForm);
    setShowWaitlistForm(false);
    setWaitlistForm(EMPTY_WAITLIST_FORM);
    loadWaitlist();
  }

  async function markWaitlistDone(id) {
    await api.patch(`/modules/clients/waitlist/${id}`, { status: 'done' });
    loadWaitlist();
  }

  async function deleteWaitlistEntry(id) {
    await api.delete(`/modules/clients/waitlist/${id}`);
    loadWaitlist();
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(client) {
    setForm({
      firstName: client.first_name || '',
      lastName: client.last_name || '',
      phone: client.phone || '',
      preferences: client.preferences || '',
      notes: client.notes || '',
      allergies: client.allergies || '',
    });
    setEditingId(client.id);
    setSelected(null);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.lastName.trim() || !form.firstName.trim()) return;
    try {
      if (editingId) {
        await api.patch(`/modules/clients/${editingId}`, form);
      } else {
        await api.post('/modules/clients', form);
      }
    } catch (err) {
      // Раньше двух клиентов с одинаковым телефоном ничто не мешало
      // завести — сервер теперь предупреждает (409 duplicate_phone).
      // Спрашиваем, точно ли это разные люди, а не блокируем наглухо —
      // телефон иногда реально общий (например, у пары).
      if (err.response?.status === 409 && err.response.data?.error === 'duplicate_phone') {
        const existing = err.response.data.existingClient;
        const proceed = confirm(`Клиент с таким телефоном уже есть: ${existing.lastName} ${existing.firstName}. Это точно другой человек? Сохранить всё равно?`);
        if (!proceed) return;
        const payload = { ...form, confirmDuplicate: true };
        if (editingId) await api.patch(`/modules/clients/${editingId}`, payload);
        else await api.post('/modules/clients', payload);
      } else {
        throw err;
      }
    }
    setShowForm(false);
    load(search);
  }

  async function handleDelete(id) {
    if (!confirm('Удалить клиента? Это действие необратимо.')) return;
    try {
      await api.delete(`/modules/clients/${id}`);
      setSelected(null);
      load(search);
    } catch (err) {
      alert(err.response?.data?.error || 'Не удалось удалить клиента');
    }
  }

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить клиента' : 'Новый клиент'}</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Фамилия">
              <TextInput
                autoFocus
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); firstNameRef.current?.focus(); } }}
                placeholder="Иванова"
              />
            </Field>
            <Field label="Имя">
              <TextInput ref={firstNameRef} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Анна" />
            </Field>
          </div>
          <Field label="Телефон">
            <TextInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 900 000-00-00" />
          </Field>
          <Field label="Пожелания">
            <TextArea value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} placeholder="Например: любит крепкий кофе, не любит разговоры во время процедуры" />
          </Field>
          <Field label="Замечания">
            <TextArea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Например: часто опаздывает, просил напоминать заранее" />
          </Field>
          <Field label="Аллергии">
            <TextArea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Например: аллергия на латекс" />
          </Field>
          <Btn type="submit">Сохранить клиента</Btn>
        </form>
      </div>
    );
  }

  if (selected) {
    return (
      <div>
        <BackBtn onClick={() => setSelected(null)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <Avatar letter={selected.last_name?.[0]} size={52} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.last_name} {selected.first_name}</div>
            {selected.phone && <div style={{ fontSize: 13, color: C.subtle }}>{selected.phone}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Btn small onClick={() => openEdit(selected)}>Изменить</Btn>
          <Btn small variant="secondary" onClick={() => handleDelete(selected.id)}>Удалить</Btn>
          <Btn small variant="secondary" onClick={() => setShowWaitlistForm((v) => !v)}>+ В лист ожидания</Btn>
          {isManagement && (
            <Btn
              small
              variant="secondary"
              onClick={() => downloadPdf(`/platform/dossier/client/${selected.id}/export`, `dossier-${selected.last_name}.pdf`, setDossierError)}
            >
              Сформировать досье
            </Btn>
          )}
        </div>
        {showWaitlistForm && (
          <Card>
            <div style={{ fontSize: 13, color: C.subtle, marginBottom: 10 }}>
              Клиент хочет записаться, но сейчас всё занято — добавьте в лист ожидания, отметите вручную, когда появится время.
            </div>
            <Field label="Услуга (необязательно)">
              <TextInput value={waitlistForm.service} onChange={(e) => setWaitlistForm({ ...waitlistForm, service: e.target.value })} placeholder="Например: маникюр, массаж спины" />
            </Field>
            <Field label="Комментарий (необязательно)">
              <TextInput value={waitlistForm.comment} onChange={(e) => setWaitlistForm({ ...waitlistForm, comment: e.target.value })} placeholder="Ждёт любое окно на этой неделе" />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn small onClick={submitWaitlist}>Добавить</Btn>
              <Btn small variant="secondary" onClick={() => setShowWaitlistForm(false)}>Отмена</Btn>
            </div>
          </Card>
        )}
        {dossierError && <div className="alert alert-error">{dossierError}</div>}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700 }}>Абонементы</div>
            <Btn small variant="secondary" onClick={() => setShowPackageForm((v) => !v)}>+ Продать абонемент</Btn>
          </div>
          {packages.length === 0 && !showPackageForm && (
            <div style={{ fontSize: 13, color: C.subtle }}>Активных абонементов нет.</div>
          )}
          {packages.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>{p.sessionsUsed} из {p.totalSessions} использовано · {p.pricePerSession} ₽/визит</div>
              </div>
              <Btn small variant="secondary" onClick={() => cancelPackage(p.id)}>Отменить</Btn>
            </div>
          ))}
          {showPackageForm && (
            <div style={{ marginTop: packages.length > 0 ? 14 : 0 }}>
              <Field label="Название (например, «Массаж, 5 визитов»)">
                <TextInput value={packageForm.title} onChange={(e) => setPackageForm({ ...packageForm, title: e.target.value })} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Число визитов">
                  <TextInput type="number" min="1" value={packageForm.totalSessions} onChange={(e) => setPackageForm({ ...packageForm, totalSessions: e.target.value })} />
                </Field>
                <Field label="Сумма, ₽">
                  <TextInput type="number" min="0" value={packageForm.totalAmount} onChange={(e) => setPackageForm({ ...packageForm, totalAmount: e.target.value })} />
                </Field>
              </div>
              {packageError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{packageError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={submitPackage} disabled={!packageForm.title.trim() || !packageForm.totalSessions || !packageForm.totalAmount}>Создать</Btn>
                <Btn small variant="secondary" onClick={() => { setShowPackageForm(false); setPackageError(''); }}>Отмена</Btn>
              </div>
            </div>
          )}
        </Card>
        {selected.allergies && (
          <Card style={{ background: C.redBg, borderColor: `${C.red}33` }}>
            <div style={{ fontSize: 12, color: C.red, fontWeight: 700, marginBottom: 4 }}>⚠️ Аллергии</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.allergies}</div>
          </Card>
        )}
        {selected.preferences && (
          <Card>
            <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700, marginBottom: 4 }}>Пожелания</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.preferences}</div>
          </Card>
        )}
        {selected.notes && (
          <Card>
            <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700, marginBottom: 4 }}>Замечания</div>
            <div style={{ fontSize: 13, color: C.secondary, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Клиенты</div>
        {tab === 'clients' && (
          <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Клиент</button>
        )}
      </div>

      <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {[['clients', 'Клиенты'], ['waitlist', `Лист ожидания${waitlist.filter((e) => e.status === 'waiting').length > 0 ? ` (${waitlist.filter((e) => e.status === 'waiting').length})` : ''}`]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ flex: 1, padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer', background: tab === k ? C.bg : 'transparent', color: tab === k ? C.primary : C.subtle, fontSize: 13, fontWeight: tab === k ? 700 : 400, boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'waitlist' ? (
        <WaitlistView entries={waitlist} loading={waitlistLoading} onMarkDone={markWaitlistDone} onDelete={deleteWaitlistEntry} />
      ) : (
        <>
          {isOwner && (
            <Card>
              <div style={{ fontSize: 12, color: C.subtle, fontWeight: 700, marginBottom: 10 }}>Выгрузка и загрузка базы</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: importResult || csvError ? 10 : 0 }}>
                <Btn small variant="secondary" onClick={handleExport} disabled={csvBusy}>Скачать базу (CSV)</Btn>
                <Btn small variant="secondary" onClick={handleDownloadTemplate} disabled={csvBusy}>Скачать образец</Btn>
                <Btn small variant="secondary" onClick={() => csvFileInputRef.current?.click()} disabled={csvBusy}>
                  {csvBusy ? 'Загрузка…' : 'Загрузить из файла'}
                </Btn>
                <input ref={csvFileInputRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
              </div>
              {csvError && <div className="alert alert-error">{csvError}</div>}
              {importResult && (
                <div className="alert" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>Добавлено: {importResult.added}. Пропущено как дубликаты по телефону: {importResult.skippedDuplicate}.</span>
                  {importResult.errors.length > 0 && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          )}
          <TextInput placeholder="Поиск по фамилии, имени или телефону" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

          {loading ? (
            <div className="page-loading">Загрузка...</div>
          ) : (
            <Card style={{ padding: 0 }}>
              {clients.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < clients.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar letter={c.last_name?.[0]} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{c.last_name} {c.first_name}</div>
                      {c.phone && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{c.phone}</div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 20, color: C.border }}>›</span>
                </div>
              ))}
              {clients.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Клиенты не найдены</div>}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
