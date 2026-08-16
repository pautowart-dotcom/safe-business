import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, BackBtn, Field, TextInput, Select, Btn, Avatar, Icon, C } from '../ui/components.jsx';
import ImageLightbox from '../ui/ImageLightbox.jsx';
import { NICHE_LABELS } from '../utils/niches.js';

function toLocalInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function nowLocal() {
  return toLocalInputValue(new Date());
}

const PAYMENT_METHOD_OPTIONS = [
  { value: '', label: 'Не указан' },
  { value: 'cash', label: 'Наличные' },
  { value: 'card', label: 'Карта' },
  { value: 'transfer', label: 'Перевод' },
  { value: 'other', label: 'Другое' },
];

const EMPTY_FORM = {
  lastName: '', firstName: '', clientId: null,
  masterMembershipId: '', service: '', serviceId: null, materials: '', amount: '', niche: '',
  discountType: 'percent', discountPercent: '0', discountFixedAmount: '', paymentMethod: '',
  visitAt: nowLocal(), photoBeforeUrl: '', photoAfterUrl: '', photoBeforeUrl2: '', photoAfterUrl2: '', supplies: [],
  clientPackageId: null,
};

function money(v) {
  return `${Number(v || 0).toLocaleString('ru-RU')} ₽`;
}

// Ячейка загрузки фото — как в reference/studio_os_mvp.tsx (пунктирная
// рамка → камера → отмеченное состояние), но с реальной загрузкой файла
// на сервер вместо мокового переключателя.
//
// Тап по самому превью — просмотр крупно (onZoom, 12.08.2026: раньше вся
// ячейка целиком открывала выбор файла, посмотреть фото крупнее было
// нельзя вообще, только открыть отдельно "Фотоотчёты"). Замена — отдельной
// текстовой кнопкой "Заменить" под превью, чтобы не перепутать с зумом.
function PhotoUploadCell({ label, url, onUploaded, onZoom }) {
  // Один input без capture — на телефоне сама ОС предлагает выбор
  // "камера или галерея" системным диалогом, как принято в большинстве
  // приложений, вместо двух отдельных кнопок под каждый источник.
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const data = new FormData();
      data.append('photo', file);
      const res = await api.post('/modules/visits/photos', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      onUploaded(res.data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      {url ? (
        <div
          style={{
            position: 'relative',
            border: `1.5px solid ${C.green}`,
            borderRadius: 12, padding: 16, textAlign: 'center',
            background: C.greenBg,
          }}
        >
          <img
            src={url}
            alt={`Фото ${label}`}
            onClick={() => onZoom(url)}
            style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }}
          />
          <div style={{ fontSize: 12, color: C.green, marginTop: 8, fontWeight: 600 }}>
            {uploading ? 'Загрузка...' : `Фото ${label} ✓`}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'none', border: 'none', color: C.secondary, fontSize: 11, marginTop: 4, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Заменить
          </button>
        </div>
      ) : (
        <div onClick={() => fileInputRef.current?.click()} style={{ border: `1.5px dashed ${C.border}`, borderRadius: 12, padding: 12, textAlign: 'center', background: C.surface, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Icon name="camera" size={22} color={C.subtle} />
          </div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 8 }}>
            {uploading ? 'Загрузка...' : `Фото ${label}`}
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function Visits() {
  const { isManagement } = useAuth();
  const [visits, setVisits] = useState([]);
  const [masters, setMasters] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [companyNiches, setCompanyNiches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [clientMatches, setClientMatches] = useState([]);
  // Пожелания/аллергии выбранного клиента (из карточки, GET /modules/clients
  // их уже отдаёт) — держим отдельно от clientMatches, потому что тот
  // очищается сразу после выбора, а показать нужно и после.
  const [selectedClientNote, setSelectedClientNote] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [photoLightbox, setPhotoLightbox] = useState(null);
  const [supplyCategoryPick, setSupplyCategoryPick] = useState('');
  const [supplyPick, setSupplyPick] = useState('');
  const [supplyQty, setSupplyQty] = useState('');
  // Наборы расходников (16.08.2026) — именованные шаблоны "расходник +
  // количество", чтобы не вводить одно и то же вручную на каждый визит.
  const [packages, setPackages] = useState([]);
  const [packagePick, setPackagePick] = useState('');
  const [savingPackage, setSavingPackage] = useState(false);
  // Каталог услуг (Этап 2 плана аналитики, 15.08.2026) — длительность нужна
  // для будущей метрики загрузки, отсюда и обязательность поля в быстром
  // добавлении ниже.
  const [services, setServices] = useState([]);
  const [addingService, setAddingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState('');
  // Абонементы выбранного клиента (11.08.2026) — предлагаем списать визит с
  // абонемента вместо ручного ввода суммы/скидки, только при создании (не
  // редактировании — PATCH /modules/visits не пересчитывает sessions_used).
  const [clientPackages, setClientPackages] = useState([]);

  const firstNameRef = useRef(null);
  const serviceRef = useRef(null);
  const materialsRef = useRef(null);
  const priceRef = useRef(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // true, только если экран редактирования открыт переходом из Финансов
  // (?open=<id>) — тогда своя кнопка "Назад" наверху формы должна вести
  // туда же, куда и системная/жест "назад" (см. эффект ниже), а не просто
  // закрывать форму на список "Визитов", в котором владелец не был.
  const openedViaDeepLinkRef = useRef(false);

  // allMasters=1 (16.08.2026) — владелец решил: мастер должен видеть всех
  // клиентов и всю историю визитов здесь (полезно при работе с чужим
  // постоянным клиентом), но не общую сводку финансов компании — то
  // отдельная граница, уже есть в Finance.jsx/summary.routes.js, эта
  // страница её не трогает. Только на этом экране, не везде: "Мои
  // финансы"/Дашборд/Фотоотчёты продолжают запрашивать без флага и видят
  // по-прежнему только своё — иначе они бы молча показали чужие данные.
  function load() {
    return api.get('/modules/visits', { params: { allMasters: 1 } }).then((res) => setVisits(res.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);
  usePullToRefresh(load);

  // Переход сюда из "Финансы → По мастерам → визит" (?open=<id>) — раньше
  // строка визита в разбивке по мастеру была просто текстом без деталей
  // (материалы, скидка, способ оплаты, фото); теперь ведёт сюда и сразу
  // открывает тот же экран редактирования, что и обычный клик по визиту
  // в списке. Параметр убираем из URL сразу после открытия — иначе
  // закрытие формы или pull-to-refresh снова распахивали бы её же.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || visits.length === 0) return;
    const match = visits.find((v) => String(v.id) === String(openId));
    if (match) {
      openEdit(match);
      openedViaDeepLinkRef.current = true;
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  useEffect(() => {
    if (!isManagement) return;
    api.get('/platform/memberships').then((res) => {
      setMasters(res.data.filter((m) => m.role === 'master' && m.user_id));
    });
  }, [isManagement]);

  useEffect(() => {
    api.get('/modules/supplies').then((res) => setSupplies(res.data));
  }, []);

  useEffect(() => {
    api.get('/modules/supplies/packages').then((res) => setPackages(res.data));
  }, []);

  useEffect(() => {
    api.get('/modules/visits/services').then((res) => setServices(res.data));
  }, []);

  // Ниша визита имеет смысл спрашивать только у студий с несколькими
  // нишами сразу (см. Финансы → "Выручка по нише") — при одной нише или
  // без ниш вообще поле просто не показываем, лишний выбор без вариантов.
  useEffect(() => {
    api.get('/platform/companies/current').then((res) => setCompanyNiches(res.data.niches || []));
  }, []);

  useEffect(() => {
    if (form.clientId || !form.lastName || form.lastName.length < 2) {
      setClientMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api.get('/modules/clients', { params: { search: form.lastName } }).then((res) => setClientMatches(res.data));
    }, 250);
    return () => clearTimeout(timer);
  }, [form.lastName, form.clientId]);

  function openCreate() {
    openedViaDeepLinkRef.current = false;
    setForm({ ...EMPTY_FORM, visitAt: nowLocal(), masterMembershipId: isManagement ? '' : undefined, supplies: [] });
    setEditingId(null);
    setClientMatches([]);
    setClientPackages([]);
    setSelectedClientNote(null);
    setSaved(false);
    setError('');
    setSupplyCategoryPick('');
    setSupplyPick('');
    setSupplyQty('');
    setAddingService(false);
    setNewServiceName('');
    setNewServiceDuration('');
    setShowForm(true);
  }

  function openEdit(v) {
    setForm({
      lastName: v.client_last_name || '',
      firstName: v.client_first_name || '',
      clientId: v.client_id,
      masterMembershipId: v.master_membership_id || '',
      service: v.service || '',
      serviceId: v.service_id || null,
      materials: v.materials || '',
      niche: v.niche || '',
      amount: String(v.amount ?? ''),
      discountType: v.discount_fixed_amount > 0 ? 'fixed' : 'percent',
      discountPercent: String(v.discount_percent ?? '0'),
      discountFixedAmount: v.discount_fixed_amount > 0 ? String(v.discount_fixed_amount) : '',
      paymentMethod: v.payment_method || '',
      visitAt: v.visit_at ? toLocalInputValue(v.visit_at) : nowLocal(),
      photoBeforeUrl: v.photo_before_url || '',
      photoAfterUrl: v.photo_after_url || '',
      photoBeforeUrl2: v.photo_before_url_2 || '',
      photoAfterUrl2: v.photo_after_url_2 || '',
      supplies: (v.supplies || []).map((s) => ({ supplyId: s.supplyId, quantity: String(s.quantity), name: s.name, unit: s.unit })),
    });
    setEditingId(v.id);
    setClientMatches([]);
    setClientPackages([]);
    // Пожелания/аллергии здесь не подставляем — GET /modules/visits их не
    // отдаёт (это данные карточки клиента, не визита), а отдельный запрос
    // ради этого не делаем; появляются только при поиске/выборе клиента.
    setSelectedClientNote(null);
    setSaved(false);
    setError('');
    setSupplyCategoryPick('');
    setSupplyPick('');
    setSupplyQty('');
    setAddingService(false);
    setNewServiceName('');
    setNewServiceDuration('');
    setShowForm(true);
  }

  function addSupplyToForm() {
    if (!supplyPick || !supplyQty || Number(supplyQty) <= 0) return;
    const supply = supplies.find((s) => String(s.id) === String(supplyPick));
    if (!supply) return;
    setForm({
      ...form,
      supplies: [...form.supplies, { supplyId: supply.id, quantity: supplyQty, name: supply.name, unit: supply.unit }],
    });
    setSupplyCategoryPick('');
    setSupplyPick('');
    setSupplyQty('');
  }

  function removeSupplyFromForm(idx) {
    setForm({ ...form, supplies: form.supplies.filter((_, i) => i !== idx) });
  }

  // Применить набор — добавляет все позиции набора в уже имеющийся список
  // расходников визита (не заменяет его), список остаётся обычным
  // редактируемым списком: можно убрать лишнее, поправить количество,
  // дозаполнить вручную сверху. Если позиция из набора уже есть в списке —
  // складываем количество, а не создаём вторую строку с тем же расходником.
  function applyPackage(packageId) {
    const pkg = packages.find((p) => String(p.id) === String(packageId));
    if (!pkg) return;
    const next = [...form.supplies];
    for (const item of pkg.items) {
      const existingIdx = next.findIndex((s) => String(s.supplyId) === String(item.supplyId));
      if (existingIdx >= 0) {
        next[existingIdx] = { ...next[existingIdx], quantity: String(Number(next[existingIdx].quantity) + item.quantity) };
      } else {
        next.push({ supplyId: item.supplyId, quantity: String(item.quantity), name: item.name, unit: item.unit });
      }
    }
    setForm({ ...form, supplies: next });
    setPackagePick('');
  }

  // Сохранить текущий список расходников визита как новый именованный
  // набор — самый естественный способ "сформировать пакет": не отдельная
  // абстрактная форма, а результат обычного заполнения визита один раз.
  async function saveCurrentAsPackage() {
    if (form.supplies.length === 0) return;
    const name = window.prompt('Название набора (например: «Стандартный маникюр»)');
    if (!name || !name.trim()) return;
    setSavingPackage(true);
    try {
      const { data } = await api.post('/modules/supplies/packages', {
        name: name.trim(),
        items: form.supplies.map((s) => ({ supplyId: s.supplyId, quantity: Number(s.quantity) })),
      });
      setPackages([...packages, data].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    } catch (err) {
      alert(err.response?.data?.error || 'Не удалось сохранить набор');
    } finally {
      setSavingPackage(false);
    }
  }

  async function submitNewService() {
    if (!newServiceName.trim() || !newServiceDuration || Number(newServiceDuration) <= 0) return;
    try {
      const { data } = await api.post('/modules/visits/services', {
        name: newServiceName.trim(),
        durationMinutes: Number(newServiceDuration),
        niche: form.niche || null,
      });
      setServices([...services, data]);
      setForm({ ...form, service: data.name, serviceId: data.id });
      setNewServiceName('');
      setNewServiceDuration('');
      setAddingService(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось добавить услугу в каталог');
    }
  }

  function pickClient(client) {
    setForm({ ...form, clientId: client.id, lastName: client.last_name, firstName: client.first_name, clientPackageId: null });
    setClientMatches([]);
    setSelectedClientNote(client.preferences || client.allergies ? { preferences: client.preferences, allergies: client.allergies } : null);
    if (!editingId) {
      api.get(`/modules/clients/${client.id}/packages`).then((res) => setClientPackages(res.data)).catch(() => setClientPackages([]));
    }
  }

  function clearClient() {
    setForm({ ...form, clientId: null, clientPackageId: null });
    setSelectedClientNote(null);
    setClientPackages([]);
  }

  function pickPackage(pkg) {
    setForm({
      ...form,
      clientPackageId: pkg.id,
      service: pkg.title,
      amount: String(pkg.pricePerSession),
      discountType: 'percent',
      discountPercent: '0',
      discountFixedAmount: '',
    });
  }

  function clearPackage() {
    setForm({ ...form, clientPackageId: null });
  }

  function handleEnter(e, nextRef) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    nextRef?.current?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Раньше эти поля проверял только нативный required у браузера — на
    // длинной форме (мастер стоит близко к началу, а кнопка "Сохранить" в
    // самом низу) подсказка браузера легко оставалась не на виду, и
    // казалось, что кнопка вообще не реагирует. Проверяем сами и показываем
    // понятную причину в баннере наверху формы.
    if (!form.clientId && (!form.lastName || !form.firstName)) {
      setError('Укажите фамилию и имя клиента');
      return;
    }
    // Мастер обязателен, только если он вообще есть кого выбрать — иначе
    // владелец без сотрудников ("Работаю один") не смог бы завести ни
    // одного визита (см. backend/src/modules/visits/visits.routes.js).
    if (isManagement && masters.length > 0 && !form.masterMembershipId) {
      setError('Выберите мастера, который выполнил визит');
      return;
    }
    if (!form.service) {
      setError('Укажите услугу');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Укажите сумму визита');
      return;
    }

    let clientId = form.clientId;
    try {
      if (!clientId) {
        const created = await api.post('/modules/clients', { firstName: form.firstName, lastName: form.lastName });
        clientId = created.data.id;
      }

      const payload = {
        clientId,
        service: form.service,
        serviceId: form.serviceId || null,
        materials: form.materials || null,
        niche: form.niche || null,
        amount: Number(form.amount),
        discountPercent: form.discountType === 'fixed' ? 0 : Number(form.discountPercent) || 0,
        discountFixedAmount: form.discountType === 'fixed' ? Number(form.discountFixedAmount) || null : null,
        paymentMethod: form.clientPackageId ? 'package' : form.paymentMethod || null,
        clientPackageId: form.clientPackageId || undefined,
        visitAt: form.visitAt ? new Date(form.visitAt).toISOString() : undefined,
        masterMembershipId: isManagement ? form.masterMembershipId || undefined : undefined,
        photoBeforeUrl: form.photoBeforeUrl || null,
        photoAfterUrl: form.photoAfterUrl || null,
        photoBeforeUrl2: form.photoBeforeUrl2 || null,
        photoAfterUrl2: form.photoAfterUrl2 || null,
        supplies: form.supplies.map((s) => ({ supplyId: s.supplyId, quantity: Number(s.quantity) })),
      };

      if (editingId) {
        await api.patch(`/modules/visits/${editingId}`, payload);
      } else {
        await api.post('/modules/visits', payload);
      }
      setSaved(true);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить визит');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Удалить визит?')) return;
    await api.delete(`/modules/visits/${id}`);
    load();
  }

  const priceNum = Number(form.amount) || 0;
  const discPct = Number(form.discountPercent) || 0;
  const discFixed = Number(form.discountFixedAmount) || 0;
  const discRub = form.discountType === 'fixed' ? discFixed : Math.round((priceNum * discPct) / 100);
  const finalPrice = priceNum - discRub;
  const suggestedMaster = masters.find((m) => String(m.id) === String(form.masterMembershipId));

  if (showForm) {
    if (saved) {
      return (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Визит сохранён</div>
          <div style={{ fontSize: 14, color: C.subtle, marginBottom: 32 }}>Данные добавлены в историю</div>
          <Btn onClick={() => { openedViaDeepLinkRef.current = false; setShowForm(false); }}>Готово</Btn>
        </div>
      );
    }

    return (
      <div>
        <BackBtn
          onClick={() => {
            if (openedViaDeepLinkRef.current) {
              openedViaDeepLinkRef.current = false;
              navigate(-1);
            } else {
              setShowForm(false);
            }
          }}
        />
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>{editingId ? 'Изменить визит' : 'Новый визит'}</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Фамилия">
              <TextInput
                required
                value={form.lastName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, firstNameRef)}
                placeholder="Иванова"
              />
            </Field>
            <Field label="Имя">
              <TextInput
                required
                ref={firstNameRef}
                value={form.firstName}
                disabled={!!form.clientId}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                onKeyDown={(e) => handleEnter(e, isManagement ? undefined : serviceRef)}
                placeholder="Анна"
              />
            </Field>
          </div>

          {clientMatches.length > 0 && (
            <div style={{ background: C.orangeBg, border: `1px solid ${C.orange}33`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 6 }}>⚡ Найден клиент</div>
              {clientMatches.map((c) => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: C.secondary, flex: 1 }}>{c.last_name} {c.first_name}</span>
                    <Btn small onClick={() => pickClient(c)}>Это он/она</Btn>
                  </div>
                  {c.preferences && <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>Пожелания: {c.preferences}</div>}
                  {c.allergies && <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>⚠ Аллергии: {c.allergies}</div>}
                </div>
              ))}
            </div>
          )}
          {form.clientId && (
            <div style={{ marginTop: -8, marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.subtle }}>
                Клиент выбран. <span style={{ color: C.primary, cursor: 'pointer', fontWeight: 600 }} onClick={clearClient}>Другой человек</span>
              </div>
              {selectedClientNote?.preferences && (
                <div style={{ fontSize: 12, color: C.secondary, marginTop: 4 }}>Пожелания: {selectedClientNote.preferences}</div>
              )}
              {selectedClientNote?.allergies && (
                <div style={{ fontSize: 12, color: C.red, marginTop: 4, fontWeight: 600 }}>⚠ Аллергии: {selectedClientNote.allergies}</div>
              )}
            </div>
          )}

          {!editingId && clientPackages.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.subtle, marginBottom: 6 }}>У клиента есть абонемент — списать визит с него?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={clearPackage}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: !form.clientPackageId ? C.primary : 'transparent', color: !form.clientPackageId ? '#fff' : C.subtle }}
                >
                  Обычный визит
                </button>
                {clientPackages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPackage(p)}
                    style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: form.clientPackageId === p.id ? C.primary : 'transparent', color: form.clientPackageId === p.id ? '#fff' : C.subtle }}
                  >
                    {p.title} · осталось {p.totalSessions - p.sessionsUsed}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Поле вообще не показываем, если в компании нет ни одного мастера
              (соло-владелец) — иначе он видит обязательное поле, выбрать в
              котором нечего, и не может сохранить визит вовсе. */}
          {isManagement && masters.length > 0 && (
            <Field label="Мастер">
              <Select required value={form.masterMembershipId} onChange={(e) => setForm({ ...form, masterMembershipId: e.target.value })}>
                <option value="">Выберите мастера</option>
                {masters
                  .filter((m) => m.active !== false || String(m.id) === String(form.masterMembershipId))
                  .map((m) => <option key={m.id} value={m.id}>{m.user_name}{m.active === false ? ' (уволен)' : ''}</option>)}
              </Select>
            </Field>
          )}

          {companyNiches.length > 1 && (
            <Field label="Ниша">
              <Select value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })}>
                <option value="">Не указана</option>
                {companyNiches.map((n) => <option key={n} value={n}>{NICHE_LABELS[n] || n}</option>)}
              </Select>
            </Field>
          )}
          {services.length > 0 && (
            <Field label="Услуга из каталога (необязательно)">
              <Select
                value={form.serviceId || ''}
                onChange={(e) => {
                  const svc = services.find((s) => String(s.id) === e.target.value);
                  setForm(svc ? { ...form, serviceId: svc.id, service: svc.name } : { ...form, serviceId: null });
                }}
              >
                <option value="">— свободный текст ниже —</option>
                {services
                  .filter((s) => !form.niche || !s.niche || s.niche === form.niche)
                  .map((s) => <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} мин</option>)}
              </Select>
            </Field>
          )}
          {/* 16.08.2026: переименовано из "Услуга"/"Название услуги" в
              "Комментарий" по просьбе владельца — раз сама услуга теперь
              выбирается из каталога выше, это поле по факту используется
              как короткая заметка к визиту. Поведение не менялось: то же
              обязательное поле, всё ещё пишет в visits.service. */}
          <Field label="Комментарий">
            <TextInput
              required
              ref={serviceRef}
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value, serviceId: null })}
              onKeyDown={(e) => handleEnter(e, materialsRef)}
              placeholder="Например: маникюр, массаж спины, стрижка"
            />
          </Field>
          {!addingService ? (
            <button
              type="button"
              onClick={() => setAddingService(true)}
              style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}
            >
              + Добавить услугу в каталог (с длительностью)
            </button>
          ) : (
            <div style={{ background: C.surface, borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <TextInput placeholder="Название услуги" value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <TextInput type="number" placeholder="Длительность, мин" value={newServiceDuration} onChange={(e) => setNewServiceDuration(e.target.value)} />
                <Btn small type="button" onClick={submitNewService}>Добавить</Btn>
                <Btn small type="button" variant="secondary" onClick={() => { setAddingService(false); setNewServiceName(''); setNewServiceDuration(''); }}>Отмена</Btn>
              </div>
            </div>
          )}
          <Field label="Материалы">
            <TextInput ref={materialsRef} value={form.materials} onChange={(e) => setForm({ ...form, materials: e.target.value })} onKeyDown={(e) => handleEnter(e, priceRef)} placeholder="Например: гель-лак №47, масло для массажа..." />
          </Field>

          {form.clientPackageId ? (
            <div style={{ background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: C.subtle }}>Сумма визита (по абонементу)</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{form.amount} ₽</div>
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Сумма, ₽">
              <TextInput ref={priceRef} required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="2500" />
            </Field>
            <Field
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Скидка</span>
                  <div style={{ display: 'flex', gap: 2, background: C.surface, borderRadius: 8, padding: 2 }}>
                    {[['percent', '%'], ['fixed', '₽']].map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setForm({ ...form, discountType: k })}
                        style={{
                          border: 'none', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          background: form.discountType === k ? C.bg : 'transparent', color: form.discountType === k ? C.primary : C.subtle,
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {form.discountType === 'fixed' ? (
                <TextInput type="number" min="0" value={form.discountFixedAmount} onChange={(e) => setForm({ ...form, discountFixedAmount: e.target.value })} placeholder="200" />
              ) : (
                <TextInput type="number" min="0" max="100" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
              )}
            </Field>
          </div>
          )}

          {!form.clientPackageId && (
            <Field label="Способ оплаты">
              <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                {PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}

          {priceNum > 0 && (
            <div style={{ background: C.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
              {discRub > 0 && (
                <div style={{ color: C.orange, marginBottom: 4 }}>
                  Скидка {form.discountType === 'fixed' ? `${discRub.toLocaleString('ru-RU')} ₽` : `${discPct}% = ${discRub.toLocaleString('ru-RU')} ₽`} · Клиент платит: {finalPrice.toLocaleString('ru-RU')} ₽
                </div>
              )}
              {suggestedMaster && <div style={{ color: C.green, fontWeight: 600 }}>Заработок мастера ({suggestedMaster.payout_percent}% от {priceNum.toLocaleString('ru-RU')} ₽): {Math.round((priceNum * (suggestedMaster.payout_percent || 0)) / 100).toLocaleString('ru-RU')} ₽</div>}
            </div>
          )}

          <Field label="Фото до/после (необязательно, до 2 на каждую сторону)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <PhotoUploadCell label="до" url={form.photoBeforeUrl} onUploaded={(url) => setForm({ ...form, photoBeforeUrl: url })} onZoom={(url) => setPhotoLightbox([url])} />
              <PhotoUploadCell label="до (2)" url={form.photoBeforeUrl2} onUploaded={(url) => setForm({ ...form, photoBeforeUrl2: url })} onZoom={(url) => setPhotoLightbox([url])} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PhotoUploadCell label="после" url={form.photoAfterUrl} onUploaded={(url) => setForm({ ...form, photoAfterUrl: url })} onZoom={(url) => setPhotoLightbox([url])} />
              <PhotoUploadCell label="после (2)" url={form.photoAfterUrl2} onUploaded={(url) => setForm({ ...form, photoAfterUrl2: url })} onZoom={(url) => setPhotoLightbox([url])} />
            </div>
          </Field>
          <ImageLightbox images={photoLightbox} onClose={() => setPhotoLightbox(null)} />

          <Field label="Расходники (необязательно)">
            {packages.length > 0 && (
              <Select
                value={packagePick}
                onChange={(e) => { setPackagePick(e.target.value); applyPackage(e.target.value); }}
                style={{ marginBottom: 8 }}
              >
                <option value="">Применить набор…</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.items.length})</option>)}
              </Select>
            )}
            {form.supplies.map((s, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface, borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{s.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{s.quantity} {s.unit}</span>
                <button type="button" onClick={() => removeSupplyFromForm(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.subtle, fontSize: 14 }}>✕</button>
              </div>
            ))}
            {form.supplies.length > 0 && (
              <button
                type="button"
                onClick={saveCurrentAsPackage}
                disabled={savingPackage}
                style={{ background: 'none', border: 'none', color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0 8px' }}
              >
                {savingPackage ? 'Сохраняем…' : '+ Сохранить этот список как набор'}
              </button>
            )}
            {/* Раньше здесь был ряд кнопок под каждый расходник с нормой на
                клиента (несколько цветов геля — несколько кнопок) — при
                десятках цветов это была стена кнопок на весь экран формы
                визита. Выбор свёрнут в тот же список ниже — при выборе
                расходника с нормой количество просто подставляется само,
                вводить руками не нужно, но экран не занят до открытия списка.
                Сначала категория, потом сам расходник (12.08.2026) — при
                большом складе плоский список из десятков позиций было
                неудобно листать; category_id/category_name уже приходят с
                бэкенда (GET /modules/supplies), раньше просто не
                использовались здесь (только на отдельной странице "Склад"). */}
            {(() => {
              const categoryMap = new Map();
              let hasUncategorized = false;
              for (const s of supplies) {
                if (s.category_id) categoryMap.set(s.category_id, s.category_name);
                else hasUncategorized = true;
              }
              const categories = [...categoryMap.entries()].map(([id, name]) => ({ id: String(id), name }));
              const itemsInCategory = supplyCategoryPick
                ? supplies.filter((s) => (supplyCategoryPick === 'none' ? !s.category_id : String(s.category_id) === supplyCategoryPick))
                : [];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Select
                    value={supplyCategoryPick}
                    onChange={(e) => {
                      setSupplyCategoryPick(e.target.value);
                      setSupplyPick('');
                      setSupplyQty('');
                    }}
                  >
                    <option value="">Выберите категорию расходника</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    {hasUncategorized && <option value="none">Без категории</option>}
                  </Select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Select
                      value={supplyPick}
                      disabled={!supplyCategoryPick}
                      onChange={(e) => {
                        const supply = supplies.find((s) => String(s.id) === e.target.value);
                        setSupplyPick(e.target.value);
                        if (supply?.default_quantity_per_visit) setSupplyQty(String(supply.default_quantity_per_visit));
                      }}
                      style={{ flex: 2 }}
                    >
                      <option value="">{supplyCategoryPick ? 'Выберите расходник' : 'Сначала выберите категорию'}</option>
                      {itemsInCategory.map((s) => <option key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ''}</option>)}
                    </Select>
                    <TextInput type="number" min="0" step="0.01" placeholder="Кол-во" value={supplyQty} onChange={(e) => setSupplyQty(e.target.value)} style={{ flex: 1 }} />
                    <Btn small type="button" onClick={addSupplyToForm}>+</Btn>
                  </div>
                </div>
              );
            })()}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            <Field label="Дата и время">
              <TextInput type="datetime-local" value={form.visitAt} onChange={(e) => setForm({ ...form, visitAt: e.target.value })} />
            </Field>
          </div>

          <Btn type="submit">{editingId ? 'Сохранить изменения' : 'Сохранить визит'}</Btn>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Визиты</div>
        <button onClick={openCreate} style={{ background: C.primary, color: '#FFF', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Визит</button>
      </div>

      {loading ? (
        <div className="page-loading">Загрузка...</div>
      ) : (
        <Card style={{ padding: 0 }}>
          {visits.map((v, i) => (
            <div key={v.id} onClick={() => { openedViaDeepLinkRef.current = false; openEdit(v); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', borderBottom: i < visits.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar letter={v.client_last_name?.[0]} size={36} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v.client_last_name} {v.client_first_name}</div>
                  <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                    {/* 16.08.2026: раньше имя мастера показывали только owner/admin —
                        у мастера все строки и так были его собственными, имя было бы
                        просто шумом. Теперь мастер тоже видит чужие визиты (allMasters),
                        без подписи было бы непонятно, чей это визит. */}
                    {v.service} {v.master_name && `· ${v.master_name.split(' ')[0]} `}· {new Date(v.visit_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{money(v.final_amount)}</div>
                  {Number(v.discount_fixed_amount) > 0
                    ? <div style={{ fontSize: 11, color: C.orange }}>−{Number(v.discount_fixed_amount).toLocaleString('ru-RU')} ₽</div>
                    : Number(v.discount_percent) > 0 && <div style={{ fontSize: 11, color: C.orange }}>−{v.discount_percent}%</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 14 }}>✕</button>
              </div>
            </div>
          ))}
          {visits.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.subtle, fontSize: 14 }}>Визитов не найдено</div>}
        </Card>
      )}
    </div>
  );
}
