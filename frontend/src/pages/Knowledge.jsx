import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, BackBtn, Field, TextInput, TextArea, Select, Btn, C } from '../ui/components.jsx';

const EMPTY_ARTICLE_FORM = { title: '', content: '', sectionId: '' };

export default function Knowledge() {
  const { isOwner } = useAuth();
  const [sections, setSections] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showArticleForm, setShowArticleForm] = useState(false);
  const [articleForm, setArticleForm] = useState(EMPTY_ARTICLE_FORM);
  const [editingArticleId, setEditingArticleId] = useState(null);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [renamingSectionId, setRenamingSectionId] = useState(null);

  function load() {
    setLoading(true);
    api.get('/modules/knowledge/sections').then((res) => setSections(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function openArticle(id) {
    const res = await api.get(`/modules/knowledge/articles/${id}`);
    setSelected(res.data);
  }

  function openCreateArticle() {
    setArticleForm({ ...EMPTY_ARTICLE_FORM, sectionId: sections[0]?.id || '' });
    setEditingArticleId(null);
    setShowArticleForm(true);
  }

  function openEditArticle(article) {
    setArticleForm({ title: article.title, content: article.content, sectionId: article.section_id });
    setEditingArticleId(article.id);
    setSelected(null);
    setShowArticleForm(true);
  }

  async function handleArticleSubmit() {
    if (!articleForm.title.trim() || !articleForm.content.trim()) return;
    if (editingArticleId) {
      await api.patch(`/modules/knowledge/articles/${editingArticleId}`, articleForm);
    } else {
      await api.post(`/modules/knowledge/sections/${articleForm.sectionId}/articles`, articleForm);
    }
    setShowArticleForm(false);
    load();
  }

  async function handleDeleteArticle(id) {
    if (!confirm('Удалить статью?')) return;
    await api.delete(`/modules/knowledge/articles/${id}`);
    setSelected(null);
    load();
  }

  async function handleSectionSubmit() {
    if (!sectionName.trim()) return;
    await api.post('/modules/knowledge/sections', { name: sectionName.trim() });
    setSectionName('');
    setShowSectionForm(false);
    load();
  }

  async function handleDeleteSection(id) {
    if (!confirm('Удалить раздел вместе со всеми статьями?')) return;
    await api.delete(`/modules/knowledge/sections/${id}`);
    load();
  }

  async function saveSectionName(id, name) {
    setRenamingSectionId(null);
    const current = sections.find((s) => s.id === id);
    if (!name.trim() || !current || name.trim() === current.name) return;
    await api.patch(`/modules/knowledge/sections/${id}`, { name: name.trim() });
    load();
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  if (selected) {
    return (
      <div>
        <BackBtn onClick={() => setSelected(null)} />
        <ST>{sections.find((s) => s.id === selected.section_id)?.name}</ST>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{selected.title}</div>
        <Card><div style={{ fontSize: 15, color: C.secondary, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{selected.content}</div></Card>
        {isOwner && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <Btn small onClick={() => openEditArticle(selected)}>Редактировать</Btn>
            <Btn small variant="secondary" onClick={() => handleDeleteArticle(selected.id)}>Удалить</Btn>
          </div>
        )}
      </div>
    );
  }

  if (showArticleForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowArticleForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingArticleId ? 'Редактировать статью' : 'Новая статья'}</div>
        <Field label="Раздел">
          <Select value={articleForm.sectionId} onChange={(e) => setArticleForm({ ...articleForm, sectionId: e.target.value })}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Заголовок"><TextInput value={articleForm.title} onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })} placeholder="Название статьи" /></Field>
        <Field label="Содержание"><TextArea style={{ minHeight: 160 }} value={articleForm.content} onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })} placeholder="Текст статьи..." /></Field>
        <Btn onClick={handleArticleSubmit}>Сохранить</Btn>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const visibleSections = sections
    .map((s) => ({ ...s, articles: query ? s.articles.filter((a) => a.title.toLowerCase().includes(query)) : s.articles }))
    .filter((s) => !query || s.articles.length > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>База знаний</div>
        {isOwner && <button onClick={openCreateArticle} disabled={sections.length === 0} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Добавить</button>}
      </div>
      {isOwner && !showSectionForm && <div style={{ marginBottom: 12 }}><Btn small variant="secondary" onClick={() => setShowSectionForm(true)}>+ Новый раздел</Btn></div>}
      {isOwner && showSectionForm && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextInput autoFocus placeholder="Название раздела" value={sectionName} onChange={(e) => setSectionName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSectionSubmit(); }} />
          <Btn small onClick={handleSectionSubmit}>Создать</Btn>
        </div>
      )}
      {!isOwner && (
        <div style={{ background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: C.subtle }}>Редактирование доступно только владельцу студии</div>
      )}

      <TextInput placeholder="Поиск по статьям" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 16 }} />

      {visibleSections.map((section) => (
        <div key={section.id} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 }}>
            {isOwner && renamingSectionId === section.id ? (
              <TextInput
                autoFocus
                defaultValue={section.name}
                onBlur={(e) => saveSectionName(section.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                style={{ fontSize: 13, padding: '6px 10px' }}
              />
            ) : (
              <ST>
                <span onClick={() => isOwner && setRenamingSectionId(section.id)} style={isOwner ? { cursor: 'pointer' } : undefined}>{section.name}</span>
              </ST>
            )}
            {isOwner && <button onClick={() => handleDeleteSection(section.id)} style={{ background: 'none', border: 'none', color: C.subtle, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>Удалить раздел</button>}
          </div>
          <Card style={{ padding: 0 }}>
            {section.articles.map((a, i, arr) => (
              <div key={a.id} onClick={() => openArticle(a.id)} style={{ padding: '14px 16px', cursor: 'pointer', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15 }}>{a.title}</span>
                <span style={{ fontSize: 20, color: C.border }}>›</span>
              </div>
            ))}
            {section.articles.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: C.subtle, fontSize: 13 }}>Статей в разделе пока нет</div>}
          </Card>
        </div>
      ))}
      {visibleSections.length === 0 && <div className="empty-hint">Ничего не найдено</div>}
    </div>
  );
}
