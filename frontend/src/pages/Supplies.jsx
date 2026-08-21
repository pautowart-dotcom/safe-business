import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, Select, Btn, Badge, Icon, C } from '../ui/components.jsx';

const EMPTY_FORM = { name: '', unit: 'шт', productUrl: '', quantity: '0', lowStockThreshold: '0', isDisinfectant: false, categoryId: '', defaultQuantityPerVisit: '', containerSize: '', unitCost: '' };

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
  // { id, type: 'receive'|'deduct' } — какая позиция сейчас показывает
  // инлайн-поле количества вместо кнопок "Пришло"/"Списать". Раньше кнопки
  // сразу прибавляли/убавляли 1 — неудобно для расходников в мл/г (пришла
  // баночка геля 500 мл, а не "1 штука").
  const [movement, setMovement] = useState(null);
  const [movementQty, setMovementQty] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Наборы расходников (16.08.2026) — именованные шаблоны "расходник +
  // количество", применяются одним кликом в форме визита (Visits.jsx).
  // Здесь — управление: переименование/состав/удаление, создаются сами
  // наборы чаще всего прямо из визита ("Сохранить этот список как набор"),
  // этот экран — для последующей правки, не единственный способ завести.
  const [packages, setPackages] = useState([]);
  const [managePackages, setManagePackages] = useState(false);
  const [packageForm, setPackageForm] = useState(null); // { id: null|number, name, items: [{supplyId, quantity, name, unit}] }
  const [pkgCategoryPick, setPkgCategoryPick] = useState('');
  const [pkgSupplyPick, setPkgSupplyPick] = useState('');
  const [pkgQty, setPkgQty] = useState('');
  const [packageError, setPackageError] = useState('');
  // ?packages=1 (21.08.2026) — из формы визита нет способа отредактировать
  // уже сохранённый набор (там можно только применить/создать новый), эта
  // страница — единственное место, где есть полноценное редактирование;
  // ссылка "Изменить наборы →" в Visits.jsx ведёт сюда с этим параметром,
  // чтобы сразу открыть нужный блок, а не заставлять искать его руками.
  const [searchParams] = useSearchParams();

  function load() {
    api.get('/modules/supplies').then((res) => setSupplies(res.data)).finally(() => setLoading(false));
  }

  function loadCategories() {
    api.get('/modules/supplies/categories').then((res) => setCategories(res.data));
  }

  function loadPackages() {
    api.get('/modules/supplies/packages').then((res) => setPackages(res.data));
  }

  useEffect(() => {
    load();
    loadCategories();
    loadPackages();
    if (searchParams.get('packages') === '1') setManagePackages(true);
  }, []);
  usePullToRefresh(() => Promise.all([load(), loadCategories(), loadPackages()]));

  function openPackageCreate() {
    setPackageForm({ id: null, name: '', items: [] });
    setPkgCategoryPick('');
    setPkgSupplyPick('');
    setPkgQty('');
    setPackageError('');
  }
  function openPackageEdit(pkg) {
    setPackageForm({ id: pkg.id, name: pkg.name, items: pkg.items.map((it) => ({ ...it, quantity: String(it.quantity) })) });
    setPkgCategoryPick('');
    setPkgSupplyPick('');
    setPkgQty('');
    setPackageError('');
  }
  function closePackageForm() {
    setPackageForm(null);
  }
  function addItemToPackageForm() {
    if (!pkgSupplyPick || !pkgQty || Number(pkgQty) <= 0) return;
    const supply = supplies.find((s) => String(s.id) === String(pkgSupplyPick));
    if (!supply) return;
    const existingIdx = packageForm.items.findIndex((it) => String(it.supplyId) === String(supply.id));
    const items = [...packageForm.items];
    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], quantity: String(Number(items[existingIdx].quantity) + Number(pkgQty)) };
    } else {
      items.push({ supplyId: supply.id, quantity: pkgQty, name: supply.name, unit: supply.unit });
    }
    setPackageForm({ ...packageForm, items });
    setPkgCategoryPick('');
    setPkgSupplyPick('');
    setPkgQty('');
  }
  function removeItemFromPackageForm(idx) {
    setPackageForm({ ...packageForm, items: packageForm.items.filter((_, i) => i !== idx) });
  }
  async function savePackage() {
    if (!packageForm.name.trim() || packageForm.items.length === 0) return;
    setPackageError('');
    const payload = {
      name: packageForm.name.trim(),
      items: packageForm.items.map((it) => ({ supplyId: it.supplyId, quantity: Number(it.quantity) })),
    };
    try {
      if (packageForm.id) {
        await api.patch(`/modules/supplies/packages/${packageForm.id}`, payload);
      } else {
        await api.post('/modules/supplies/packages', payload);
      }
      closePackageForm();
      loadPackages();
    } catch (err) {
      setPackageError(err.response?.data?.error || 'Не удалось сохранить набор');
    }
  }
  async function deletePackage(id) {
    if (!confirm('Удалить набор? Уже внесённые визиты не изменятся, это только шаблон.')) return;
    await api.delete(`/modules/supplies/packages/${id}`);
    loadPackages();
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
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
      defaultQuantityPerVisit: s.default_quantity_per_visit != null ? String(s.default_quantity_per_visit) : '',
      containerSize: s.container_size != null ? String(s.container_size) : '',
      unitCost: s.unit_cost != null ? String(s.unit_cost) : '',
    });
    setEditingId(s.id);
    setFormError('');
    setShowForm(true);
  }

  // Раньше без try/catch: ошибка с сервера (например, "расходник с таким
  // названием уже есть" — новая проверка 12.08.2026, POST/PATCH
  // /modules/supplies) нигде не показывалась, форма просто не закрывалась
  // без объяснений.
  async function handleCreate() {
    if (!form.name.trim()) return;
    setSaving(true);
    setFormError('');
    try {
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
          defaultQuantityPerVisit: form.defaultQuantityPerVisit || null,
          containerSize: form.containerSize || null,
          unitCost: form.unitCost || null,
        });
      } else {
        await api.post('/modules/supplies', payload);
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Не удалось сохранить позицию');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить позицию склада?')) return;
    try {
      await api.delete(`/modules/supplies/${id}`);
      load();
    } catch (err) {
      // Раньше ошибка (например, "расходник уже использован в визитах" —
      // ON DELETE RESTRICT в БД, защита от потери учёта) нигде не
      // показывалась: запрос падал, а на экране просто ничего не менялось.
      alert(err.response?.data?.error || 'Не удалось удалить позицию');
    }
  }

  function openMovement(supply, type) {
    setMovement({ id: supply.id, type });
    // "Пришло" сразу предлагает объём тары, если он задан — обычно приходит
    // целая баночка/упаковка; "Списать" ничем не предзаполняем, это чаще
    // разовая корректировка (порча, ошибка), не привязанная к таре.
    setMovementQty(type === 'receive' && supply.container_size ? String(supply.container_size) : '');
  }
  function closeMovement() {
    setMovement(null);
    setMovementQty('');
  }
  async function confirmMovement() {
    const qty = Number(movementQty);
    if (!qty || qty <= 0) return;
    await api.post(`/modules/supplies/${movement.id}/${movement.type}`, { quantity: qty });
    closeMovement();
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
        <Field label="Название"><TextInput autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: гель-лак Kodi, масло для массажа" /></Field>
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
        <Field label="Расход на клиента (необязательно)">
          <TextInput type="number" min="0" step="0.01" value={form.defaultQuantityPerVisit} onChange={(e) => setForm({ ...form, defaultQuantityPerVisit: e.target.value })} placeholder="Например, 15" />
        </Field>
        <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 14 }}>
          Если указано — при создании нового визита появится кнопка-подсказка с этим количеством, мастеру не нужно вводить вручную.
        </div>
        <Field label="Объём одной тары (необязательно)">
          <TextInput type="number" min="0" step="0.01" value={form.containerSize} onChange={(e) => setForm({ ...form, containerSize: e.target.value })} placeholder="Например, 500" />
        </Field>
        <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 14 }}>
          Если указано — кнопка "Пришло" сама предложит это количество (пришла целая баночка/упаковка), а не всегда +1. Число перед подтверждением можно поменять.
        </div>
        {isManagement && (
          <>
            <Field label="Закупочная цена за единицу, ₽ (необязательно)">
              <TextInput type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="Например, 45" />
            </Field>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: -8, marginBottom: 14 }}>
              Видна только владельцу/админу — используется для расчёта себестоимости материалов в «Финансах». Мастер эту цену не видит.
            </div>
          </>
        )}
        <Field label="Ссылка на товар"><TextInput type="url" value={form.productUrl} onChange={(e) => setForm({ ...form, productUrl: e.target.value })} placeholder="https://..." /></Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.isDisinfectant} onChange={(e) => setForm({ ...form, isDisinfectant: e.target.checked })} />
          <span style={{ fontSize: 14 }}>Дезинфицирующее средство</span>
        </label>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 20 }}>
          Отмечайте только реальные дезсредства — тег используется для учёта расхода.
        </div>
        {formError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{formError}</div>}
        <Btn onClick={handleCreate} disabled={saving}>{saving ? 'Секунду…' : editingId ? 'Сохранить изменения' : 'Добавить'}</Btn>
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
        {/* 05.08.2026: раньше кнопка была только owner/admin (isManagement) —
            владелец попросил разрешить и мастеру заводить новые позиции,
            просто без права редактировать чужие/удалять (см. "Изменить"/
            "Удалить" ниже — те по-прежнему isManagement-only). */}
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Добавить</button>
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

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setManagePackages((v) => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 13, fontWeight: 600, padding: 0 }}
        >
          {managePackages ? 'Скрыть наборы расходников' : 'Наборы расходников →'}
        </button>
      </div>

      {managePackages && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.subtle }}>Наборы расходников</div>
            {!packageForm && <button onClick={openPackageCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.primary, fontSize: 12, fontWeight: 600 }}>+ Новый набор</button>}
          </div>

          {!packageForm && (
            packages.length === 0 ? (
              <div style={{ fontSize: 13, color: C.subtle }}>
                Пока нет ни одного набора — быстрее всего завести его прямо из формы визита
                кнопкой «Сохранить этот список как набор», или создать здесь.
              </div>
            ) : (
              packages.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < packages.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.subtle }}>{p.items.map((it) => it.name).join(', ')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                    <button onClick={() => openPackageEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="edit" size={15} color={C.secondary} /></button>
                    <button onClick={() => deletePackage(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Icon name="trash" size={15} color={C.subtle} /></button>
                  </div>
                </div>
              ))
            )
          )}

          {packageForm && (
            <div>
              <TextInput
                autoFocus
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                placeholder="Название набора, например «Стандартный маникюр»"
                style={{ marginBottom: 10 }}
              />
              {packageForm.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{it.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{it.quantity} {it.unit}</span>
                  <button type="button" onClick={() => removeItemFromPackageForm(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 14 }}>✕</button>
                </div>
              ))}
              {(() => {
                const itemsInCategory = pkgCategoryPick
                  ? supplies.filter((s) => (pkgCategoryPick === 'none' ? !s.category_id : String(s.category_id) === pkgCategoryPick))
                  : [];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    <Select value={pkgCategoryPick} onChange={(e) => { setPkgCategoryPick(e.target.value); setPkgSupplyPick(''); }}>
                      <option value="">Выберите категорию расходника</option>
                      {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                      <option value="none">Без категории</option>
                    </Select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Select value={pkgSupplyPick} disabled={!pkgCategoryPick} onChange={(e) => setPkgSupplyPick(e.target.value)} style={{ flex: 2 }}>
                        <option value="">{pkgCategoryPick ? 'Выберите расходник' : 'Сначала выберите категорию'}</option>
                        {itemsInCategory.map((s) => <option key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ''}</option>)}
                      </Select>
                      <TextInput type="number" min="0" step="0.01" placeholder="Кол-во" value={pkgQty} onChange={(e) => setPkgQty(e.target.value)} style={{ flex: 1 }} />
                      <Btn small type="button" onClick={addItemToPackageForm}>+</Btn>
                    </div>
                  </div>
                );
              })()}
              {packageError && <div className="alert alert-error" style={{ marginBottom: 10 }}>{packageError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={savePackage}>Сохранить</Btn>
                <Btn small variant="secondary" onClick={closePackageForm}>Отмена</Btn>
              </div>
            </div>
          )}
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
                {movement && movement.id === s.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementQty}
                      onChange={(e) => setMovementQty(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmMovement()}
                      placeholder={s.unit ? `Кол-во, ${s.unit}` : 'Кол-во'}
                      style={{ flex: 1 }}
                    />
                    <Btn small onClick={confirmMovement}>{movement.type === 'receive' ? 'Пришло' : 'Списать'}</Btn>
                    <Btn small variant="secondary" onClick={closeMovement}>Отмена</Btn>
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => openMovement(s, 'receive')} style={{ background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.green, cursor: 'pointer', fontWeight: 600 }}>+ Пришло</button>
                  <button onClick={() => openMovement(s, 'deduct')} style={{ background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '6px 12px', fontSize: 12, color: C.red, cursor: 'pointer', fontWeight: 600 }}>− Списать</button>
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
                )}
              </div>
            );
          })}
          {filteredSupplies.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>{supplies.length === 0 ? 'Склад пуст' : 'В этой категории пока пусто'}</div>}
        </Card>
      )}
    </div>
  );
}
