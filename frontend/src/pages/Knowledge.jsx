import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const EMPTY_FORM = { title: '', category: 'Общее', content: '' };

export default function Knowledge() {
  const { isOwner } = useAuth();
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  function load() {
    setLoading(true);
    api.get('/knowledge', { params: search ? { search } : {} }).then((res) => setArticles(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function openArticle(id) {
    const res = await api.get(`/knowledge/${id}`);
    setSelected(res.data);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(article) {
    setForm({ title: article.title, category: article.category, content: article.content });
    setEditingId(article.id);
    setSelected(null);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (editingId) {
      await api.put(`/knowledge/${editingId}`, form);
    } else {
      await api.post('/knowledge', form);
    }
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить статью?')) return;
    await api.delete(`/knowledge/${id}`);
    setSelected(null);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <h1>База знаний</h1>
        {isOwner && <button className="btn btn-primary" onClick={openCreate}>+ Новая статья</button>}
      </div>

      <input className="search-input" placeholder="Поиск по статьям" value={search} onChange={(e) => setSearch(e.target.value)} />

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <div className="grid grid-3">
          {articles.map((a) => (
            <div className="card card-clickable" key={a.id} onClick={() => openArticle(a.id)}>
              <div className="badge badge-planned">{a.category}</div>
              <h3>{a.title}</h3>
              <p className="page-subtitle">Обновлено {new Date(a.updated_at).toLocaleDateString('ru-RU')}</p>
            </div>
          ))}
          {articles.length === 0 && <p className="empty-hint">Статей не найдено</p>}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="badge badge-planned">{selected.category}</div>
            <h2>{selected.title}</h2>
            <div className="article-content">{selected.content}</div>
            <div className="modal-actions">
              {isOwner && <button className="btn btn-sm btn-danger" onClick={() => handleDelete(selected.id)}>Удалить</button>}
              {isOwner && <button className="btn btn-sm" onClick={() => openEdit(selected)}>Редактировать</button>}
              <button className="btn btn-ghost" onClick={() => setSelected(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal modal-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
            <h3>{editingId ? 'Редактировать статью' : 'Новая статья'}</h3>
            <label className="field">
              <span>Заголовок</span>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Категория</span>
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
            <label className="field">
              <span>Содержание</span>
              <textarea required rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Отмена</button>
              <button type="submit" className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
