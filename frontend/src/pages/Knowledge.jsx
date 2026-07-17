import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_ARTICLE_FORM = { title: '', content: '', sectionId: '' };
const EMPTY_SECTION_FORM = { name: '' };

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
  const [sectionForm, setSectionForm] = useState(EMPTY_SECTION_FORM);

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

  async function handleArticleSubmit(e) {
    e.preventDefault();
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

  async function handleSectionSubmit(e) {
    e.preventDefault();
    await api.post('/modules/knowledge/sections', sectionForm);
    setSectionForm(EMPTY_SECTION_FORM);
    setShowSectionForm(false);
    load();
  }

  async function handleDeleteSection(id) {
    if (!confirm('Удалить раздел вместе со всеми статьями?')) return;
    await api.delete(`/modules/knowledge/sections/${id}`);
    load();
  }

  const query = search.trim().toLowerCase();
  const visibleSections = sections
    .map((s) => ({ ...s, articles: query ? s.articles.filter((a) => a.title.toLowerCase().includes(query)) : s.articles }))
    .filter((s) => !query || s.articles.length > 0);

  return (
    <div>
      <div className="page-header">
        <h1>База знаний</h1>
        {isOwner && (
          <div className="row-actions">
            <button className="btn btn-ghost" onClick={() => setShowSectionForm(true)}>+ Раздел</button>
            <button className="btn btn-primary" onClick={openCreateArticle} disabled={sections.length === 0}>+ Новая статья</button>
          </div>
        )}
      </div>

      <input className="search-input" placeholder="Поиск по статьям" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        visibleSections.map((section) => (
          <div key={section.id} style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3>{section.name}</h3>
              {isOwner && <button className="btn btn-sm btn-ghost" onClick={() => handleDeleteSection(section.id)}>Удалить раздел</button>}
            </div>
            <div className="grid grid-3">
              {section.articles.map((a) => (
                <div className="card card-clickable" key={a.id} onClick={() => openArticle(a.id)}>
                  <h3>{a.title}</h3>
                  <p className="page-subtitle">Обновлено {new Date(a.updated_at).toLocaleDateString('ru-RU')}</p>
                </div>
              ))}
              {section.articles.length === 0 && <p className="empty-hint">Статей в разделе пока нет</p>}
            </div>
          </div>
        ))
      )}
      {!loading && visibleSections.length === 0 && <p className="empty-hint">Ничего не найдено</p>}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>{selected.title}</h2>
            <div className="article-content">{selected.content}</div>
            <div className="modal-actions">
              {isOwner && <button className="btn btn-sm btn-danger" onClick={() => handleDeleteArticle(selected.id)}>Удалить</button>}
              {isOwner && <button className="btn btn-sm" onClick={() => openEditArticle(selected)}>Редактировать</button>}
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showArticleForm && (
        <div className="modal-backdrop" onClick={() => setShowArticleForm(false)}>
          <form className="modal modal-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleArticleSubmit}>
            <h3>{editingArticleId ? 'Редактировать статью' : 'Новая статья'}</h3>
            <label className="field">
              <span>Раздел</span>
              <select value={articleForm.sectionId} onChange={(e) => setArticleForm({ ...articleForm, sectionId: e.target.value })}>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Заголовок</span>
              <input required value={articleForm.title} onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Содержание</span>
              <textarea required rows={10} value={articleForm.content} onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowArticleForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {showSectionForm && (
        <div className="modal-backdrop" onClick={() => setShowSectionForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSectionSubmit}>
            <h3>Новый раздел</h3>
            <label className="field">
              <span>Название</span>
              <input required value={sectionForm.name} onChange={(e) => setSectionForm({ name: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowSectionForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
