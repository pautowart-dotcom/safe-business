import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, BackBtn, Field, TextInput, Btn, Badge, Icon, C } from '../ui/components.jsx';

const EMPTY_FORM = { name: '', unit: 'шт', productUrl: '', quantity: '0', lowStockThreshold: '0' };

export default function Supplies() {
  const { isManagement } = useAuth();
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  function load() {
    setLoading(true);
    api.get('/modules/supplies').then((res) => setSupplies(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, []);

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
    });
    setEditingId(s.id);
    setShowForm(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) return;
    if (editingId) {
      // Остаток меняется только через "Пришло"/"Списать" — не полем формы,
      // чтобы не разъезжались история движений и текущее количество.
      await api.patch(`/modules/supplies/${editingId}`, {
        name: form.name,
        unit: form.unit,
        productUrl: form.productUrl,
        lowStockThreshold: form.lowStockThreshold,
      });
    } else {
      await api.post('/modules/supplies', form);
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

  if (showForm) {
    return (
      <div>
        <BackBtn onClick={() => setShowForm(false)} />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить расходник' : 'Новый расходник'}</div>
        <Field label="Название"><TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Гель-лак Kodi" /></Field>
        {!editingId && (
          <Field label="Начальный остаток"><TextInput type="number" min="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="5" /></Field>
        )}
        <Field label="Минимум (порог)"><TextInput type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} placeholder="2" /></Field>
        <Field label="Единица"><TextInput value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="шт" /></Field>
        <Field label="Ссылка на товар"><TextInput type="url" value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="https://..." /></Field>
        <Btn onClick={handleCreate}>{editingId ? 'Сохранить изменения' : 'Добавить'}</Btn>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Склад расходников</div>
        {isManagement && (
          <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Добавить</button>
        )}
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {supplies.map((s, i) => {
            const low = s.low_stock;
            return (
              <div key={s.id} style={{ padding: '14px 16px', borderBottom: i < supplies.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: low ? C.red : C.green, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: C.subtle }}>мин. {Number(s.low_stock_threshold)} {s.unit}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          {supplies.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Склад пуст</div>}
        </Card>
      )}
    </div>
  );
}
