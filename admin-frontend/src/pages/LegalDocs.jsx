import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, ST, BackBtn, Field, TextInput, TextArea, Btn, C } from '../ui/components.jsx';

export default function LegalDocs() {
  const [docs, setDocs] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [form, setForm] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function load() {
    api.get('/platform/admin/legal-documents').then((res) => setDocs(res.data));
  }

  useEffect(load, []);

  function openEdit(doc) {
    setForm({ title: doc.title, content: doc.content });
    setEditingKey(doc.key);
    setSaved(false);
  }

  async function save() {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/platform/admin/legal-documents/${editingKey}`, form);
      setEditingKey(null);
      setSaved(true);
      load();
    } finally {
      setSaving(false);
    }
  }

  if (!docs) return <div className="page-loading">Загрузка...</div>;

  if (editingKey) {
    const doc = docs.find((d) => d.key === editingKey);
    return (
      <div>
        <BackBtn onClick={() => setEditingKey(null)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Изменить: {doc?.title}</div>
        <Field label="Заголовок">
          <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Текст (markdown: # заголовок, ## подзаголовок, - пункт списка)">
          <TextArea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ minHeight: 420, fontFamily: 'monospace', fontSize: 13 }} />
        </Field>
        <Btn onClick={save} disabled={saving}>{saving ? 'Сохраняем...' : 'Сохранить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Юридические документы</div>
      {saved && <div style={{ fontSize: 13, color: C.green, marginBottom: 12 }}>✓ Сохранено</div>}
      <Card style={{ padding: 0 }}>
        {docs.map((doc, i) => (
          <div key={doc.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < docs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{doc.title}</div>
              <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{doc.key} · обновлено {new Date(doc.updated_at).toLocaleDateString('ru-RU')}</div>
            </div>
            <Btn small onClick={() => openEdit(doc)}>Изменить</Btn>
          </div>
        ))}
      </Card>
      <ST>Публичные страницы</ST>
      <div style={{ fontSize: 12, color: C.subtle }}>
        <a href="https://app.business-safe.ru/legal/oferta" target="_blank" rel="noreferrer" style={{ color: C.primary }}>/legal/oferta</a>
        {' · '}
        <a href="https://app.business-safe.ru/legal/privacy_policy" target="_blank" rel="noreferrer" style={{ color: C.primary }}>/legal/privacy_policy</a>
        {' · '}
        <a href="https://app.business-safe.ru/legal/faq" target="_blank" rel="noreferrer" style={{ color: C.primary }}>/legal/faq</a>
      </div>
    </div>
  );
}
