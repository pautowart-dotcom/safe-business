import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, BackBtn, Field, TextInput, Select, Btn, Badge, Icon, C } from '../ui/components.jsx';

const EMPTY_FORM = { name: '', unit: 'шт', productUrl: '', quantity: '0', lowStockThreshold: '0', isDisinfectant: false, categoryId: '' };

export default function Supplies() {
  const { isManagement } = useAuth();
  const [supplies, setSupplies] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(''); // '' = все, 'none' = без категории, иначе id (строкой)
  const [manageCategories, setManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);

  function load() {
    setLoading(true);
    api.get('/modules/supplies').then((res) => setSupplies(res.data)).finally(() => setLoading(false));
  }

  function loadCategories() {
    api.get('/modules/supplies/categories').then((res) => setCategories(res.data));
  }

  useEffect(() => {
    load();
    loadCategories();
  }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(s) {
    setForm({
      name: s.name || '',
      unit: s.unit || 'шт',
      productUrl: s.product_url || '',
      quantity: String(s.quantity ?? '0'),
      lowStockThreshold: String(s.low_stock_threshold ?? '0'),
      isDisinfectant: !!s.is_disinfectant,
      categoryId: s.category_id ? String(s.category_id) : '',
    });
    setEditingId(s.id);
    setShowForm(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    const payload = { ...form, categoryId: form.categoryId || null };
    if (editingId) {
      // Остаток меняется только через "Пришло"/"Списать" — не полем формы,
      // чтобы не разъезжались история движений и текущее количество.
      await api.patch(`/modules/supplies/${editingId}`, {
        name: form.name,
        unit: form.unit,
        productUrl: form.productUrl,
        lowStockThreshold: form.lowStockThreshold,
        isDisinfectant: form.isDisinfectant,
        categoryId: form.categoryId || null,
      });
    } else {
      await api.post('/modules/supplies', payload);
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Удалить позицию склада?')) return;
    await api.delete(`/modules/supplies/${id}`);
    load();
  }

  async function adjust(id, type, delta) {
    await api.post(`/modules/supplies/${id}/${type}`, { quantity: delta });
    load();
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    await api.post('/modules/supplies/categories', { name: newCategoryName.trim() });
    setNewCategoryName('');
    loadCategories();
  }

  async function renameCategory(id, name) {
    if (!name.trim()) return;
    await api.patch(`/modules/supplies/categories/${id}`, { name: name.trim() });
    loadCategories();
  }

  async function deleteCategory(id) {
    if (!confirm('Удалить категорию? Расходники в ней останутся, просто без категории.')) return;
    await api.delete(`/modules/supplies/categories/${id}`);
    if (activeCategory === String(id)) setActiveCategory('');
    loadCategories();
    load();
  }

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить расходник' : 'Новый расходник'}</div>
        <Field label="Название"><TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Гель-лак Kodi" /></Field>
        <Field label="Категория">
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Без категории</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {!editingId && (
          <Field label="Начальный остаток"><TextInput type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="5" /></Field>
        )}
        <Field label="Минимум (порог)"><TextInput type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} placeholder="2" /></Field>
        <Field label="Единица"><TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="шт" /></Field>
        <Field label="Ссылка на товар"><TextInput type="url" value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="https://..." /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isDisinfectant} onChange={(e) => setForm({ ...form, isDisinfectant: e.target.checked })} />
          <span style={{ fontSize: 14 }}>Дезинфицирующее средство</span>
        </label>
        <Btn onClick={handleCreate}>{editingId ? 'Сохранить изменения' : 'Добавить'}</Btn>
      </div>
    );
  }

  const filteredSupplies = supplies.filter((s) => {
    if (activeCategory === '') return true;
    if (activeCategory === 'none') return !s.category_id;
    return String(s.category_id) === activeCategory;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Склад расходников</div>
        {isManagement && (
          <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Добавить</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: isManagement ? 8 : 16, overflowX: 'auto' }}>
        {[{ key: '', label: 'Все' }, ...categories.map((c) => ({ key: String(c.id), label: c.name })), { key: 'none', label: 'Без категории' }].map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.border}`, cursor: 'pointer',
              background: activeCategory === c.key ? C.primary : C.bg, color: activeCategory === c.key ? '#FFF' : C.secondary, fontSize: 13, fontWeight: 600,
            }}
          >
            {c.label}
          </button>
        ))}
        {isManagement && (
          <button
            onClick={() => setManageCategories((v) => !v)}
            style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, padding: '7px 6px' }}
            aria-label="Управление категориями"
          >
            <Icon name="edit" size={16} color={C.subtle} />
          </button>
        )}
      </div>

      {isManagement && manageCategories && (
        <Card>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Категории склада</div>
          {categories.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: i < categories.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <TextInput
                defaultValue={c.name}
                onBlur={(e) => e.target.value !== c.name && renameCategory(c.id, e.target.value)}
                style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
              />
              <button onClick={() => deleteCategory(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, flexShrink: 0 }}>
                <Icon name="trash" size={16} color={C.subtle} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <TextInput
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory(); }}
              placeholder="Новая категория"
              style={{ flex: 1 }}
            />
            <Btn small onClick={addCategory}>Добавить</Btn>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {filteredSupplies.map((s, i) => {
            const low = s.low_stock;
            return (
              <div key={s.id} style={{ padding: '14px 16px', borderBottom: i < filteredSupplies.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: low ? C.red : C.green, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: C.subtle }}>
                        {s.category_name ? `${s.category_name} · ` : ''}мин. {Number(s.low_stock_threshold)} {s.unit}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.is_disinfectant && <Badge color={C.secondary} bg={C.surface}>Дезсредство</Badge>}
                    {low && <Badge color={C.red} bg={C.redBg}>Мало</Badge>}
                    <div style={{ fontSize: 16, fontWeight: 800, color: low ? C.red : C.primary }}>{Number(s.quantity)} {s.unit}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isManagement && (
                    <button onClick={() => adjust(s.id, 'receive', 1)} style={{ background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.green, cursor: 'pointer', fontWeight: 600 }}>+ Пришло</button>
                  )}
                  <button onClick={() => adjust(s.id, 'deduct', 1)} style={{ background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.red, cursor: 'pointer', fontWeight: 600 }}>− Списать</button>
                  {s.product_url && (
                    <a href={s.product_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.secondary, textDecoration: 'none' }}>
                      <Icon name="link" size={12} color={C.secondary} />Купить
                    </a>
                  )}
                  {isManagement && (
                    <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 12, marginLeft: 'auto' }}>Изменить</button>
                  )}
                  {isManagement && (
                    <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 12 }}>Удалить</button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredSupplies.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>{supplies.length === 0 ? 'Склад пуст' : 'В этой категории пока пусто'}</div>}
        </Card>
      )}
    </div>
  );
}
