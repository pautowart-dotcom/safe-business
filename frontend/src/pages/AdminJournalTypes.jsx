import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, BackBtn, Field, TextInput, TextArea, Btn, C } from '../ui/components.jsx';

// Панель Super Admin (только он) — редактирование заголовка и обязательного
// дисклеймера журналов (Пакет 3, Этап 5), по аналогии с AdminLegalDocs.jsx:
// текст живёт в БД (journal_types), а не в коде. Проверка прав дублируется
// на бэкенде (requireSuperAdmin) — здесь только для UX.
export default function AdminJournalTypes() {
  const { isSuperAdmin } = useAuth();
  const [types, setTypes] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState({ title: '', disclaimer: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.get('/platform/admin/journal-types').then((res) => setTypes(res.data));
  }

  useEffect(load, []);

  function openEdit(t) {
    setForm({ title: t.title, disclaimer: t.disclaimer });
    setEditingKey(t.key);
    setSaved(false);
  }

  async function save() {
    if (!form.disclaimer.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/platform/admin/journal-types/${editingKey}`, form);
      setEditingKey(null);
      setSaved(true);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!isSuperAdmin) return <Navigate to="/" replace />;
  if (!types) return <div className="page-loading">Загрузка...</div>;

  if (editingKey) {
    const t = types.find((x) => x.key === editingKey);
    return (
      <div>
        <BackBtn onClick={() => setEditingKey(null)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Изменить: {t?.title}</div>
        <Field label="Заголовок">
          <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Дисклеймер (показывается под журналом и в PDF-экспорте)">
          <TextArea value={form.disclaimer} onChange={(e) => setForm({ ...form, disclaimer: e.target.value })} style={{ minHeight: 140 }} />
        </Field>
        <Btn onClick={save} disabled={saving}>{saving ? 'Сохраняем...' : 'Сохранить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Типы журналов</div>
      <div style={{ fontSize: 13, color: C.subtle, marginBottom: 16 }}>
        Заголовок и дисклеймер живут в базе данных и видны в разделе "Журналы" у всех компаний.
      </div>
      {saved && <div style={{ fontSize: 13, color: C.green, marginBottom: 12 }}>✓ Сохранено</div>}
      <Card style={{ padding: 0 }}>
        {types.map((t, i) => (
          <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < types.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                {t.key} · обновлено {new Date(t.updated_at).toLocaleDateString('ru-RU')}
              </div>
            </div>
            <Btn small onClick={() => openEdit(t)}>Изменить</Btn>
          </div>
        ))}
      </Card>
    </div>
  );
}
