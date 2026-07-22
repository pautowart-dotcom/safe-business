import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Field, TextInput, Select, Btn, Icon, C } from '../ui/components.jsx';
import { isPushSupported, isIos, isStandalone, getPushSubscriptionState, subscribeToPush, unsubscribeFromPush } from '../utils/push.js';

const ROLE_LABELS = { owner: 'Владелец', admin: 'Администратор', master: 'Мастер' };
const DOC_TYPE_LABELS = { medical_book: 'Мед. книжка', certificate: 'Сертификат', employment_contract: 'Срочный договор' };
// Пакет 4, Этап 1: 'legal' → 'documents', добавлены 'premises' и 'journals'.
const NOTIFICATION_CATEGORIES = [
  { key: 'staff', label: 'Кадровые' },
  { key: 'premises', label: 'Помещение' },
  { key: 'documents', label: 'Юридические' },
  { key: 'tax', label: 'Налоговые' },
  { key: 'journals', label: 'Журналы' },
  { key: 'financial', label: 'Финансовые' },
];

export default function Settings() {
  const { user, currentCompany, isManagement, logout, switchCompany, renameCurrentCompany, setUserAvatar } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [analyticsConsent, setAnalyticsConsent] = useState(!!user?.analytics_consent);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [myDocuments, setMyDocuments] = useState(null);
  const [pushState, setPushState] = useState('checking'); // checking | unsupported | ios-not-installed | unsubscribed | subscribed
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [testCategory, setTestCategory] = useState('documents');
  const [testSent, setTestSent] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushState('unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      // Push на iOS требует установки на "Домашний экран" — обычный Safari-таб
      // подписаться не может вообще, показывать переключатель бессмысленно.
      setPushState('ios-not-installed');
      return;
    }
    getPushSubscriptionState().then(setPushState);
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushError('');
    try {
      if (pushState === 'subscribed') {
        await unsubscribeFromPush();
        setPushState('unsubscribed');
      } else {
        await subscribeToPush();
        setPushState('subscribed');
      }
    } catch (err) {
      setPushError(err.response?.data?.error || err.message || 'Не удалось изменить подписку');
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    setPushBusy(true);
    setPushError('');
    setTestSent(false);
    try {
      await api.post('/platform/push/test', { category: testCategory });
      setTestSent(true);
    } catch (err) {
      setPushError(err.response?.data?.error || 'Не удалось отправить тестовое уведомление');
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }, []);

  useEffect(() => {
    if (!isManagement) return;
    api.get('/platform/deadlines/settings').then((res) => setNotificationSettings(res.data));
  }, [isManagement]);

  useEffect(() => {
    if (isManagement) return;
    api.get('/platform/staff-documents').then((res) => setMyDocuments(res.data));
  }, [isManagement]);

  async function toggleNotificationCategory(category, enabled) {
    setNotificationSettings((prev) => prev.map((s) => (s.category === category ? { ...s, enabled } : s)));
    await api.patch('/platform/deadlines/settings', { category, enabled });
  }

  function openEditCompany() {
    setCompanyName(company.name);
    setEditingCompany(true);
  }

  async function saveCompanyName() {
    if (!companyName.trim()) return;
    const { data } = await api.patch('/platform/companies/current', { name: companyName.trim() });
    setCompany(data);
    renameCurrentCompany(data.name);
    setEditingCompany(false);
  }

  async function handleSwitch() {
    await switchCompany();
    navigate('/login');
  }

  async function toggleAnalyticsConsent(checked) {
    setAnalyticsConsent(checked);
    await api.patch('/auth/me', { analyticsConsent: checked });
  }

  async function handleAvatarFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const data = new FormData();
      data.append('photo', file);
      const res = await api.post('/auth/me/avatar', data, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUserAvatar(res.data.avatarUrl);
    } finally {
      setUploadingAvatar(false);
    }
  }

  const trialDaysLeft = company?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000))
    : null;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Настройки</div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarFile} style={{ display: 'none' }} />
          <div
            onClick={() => avatarInputRef.current?.click()}
            style={{
              width: 52, height: 52, minWidth: 52, borderRadius: '50%', boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
              background: user?.avatar_url ? 'none' : C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: '#FFF', cursor: 'pointer', position: 'relative',
            }}
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              user?.name?.[0]?.toUpperCase()
            )}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{user?.name}</div>
            <div style={{ fontSize: 13, color: C.subtle }}>
              {ROLE_LABELS[currentCompany?.role] || currentCompany?.role} · {currentCompany?.name}
            </div>
            <div onClick={() => avatarInputRef.current?.click()} style={{ fontSize: 12, color: C.primary, fontWeight: 600, marginTop: 4, cursor: 'pointer' }}>
              {uploadingAvatar ? 'Загрузка...' : 'Изменить фото'}
            </div>
          </div>
        </div>
      </Card>

      {isManagement && company && (
        <Card>
          {editingCompany ? (
            <>
              <Field label="Название компании">
                <TextInput autoFocus value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </Field>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn small onClick={saveCompanyName}>Сохранить</Btn>
                <Btn small variant="secondary" onClick={() => setEditingCompany(false)}>Отмена</Btn>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, color: C.subtle, marginBottom: 2 }}>Компания</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{company.name}</div>
              </div>
              <button onClick={openEditCompany} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Изменить</button>
            </div>
          )}
        </Card>
      )}

      {isManagement && company?.subscription_status === 'trial' && (
        <Card style={{ background: C.greenBg, borderColor: C.green + '44', cursor: 'pointer' }} onClick={() => navigate('/subscription')}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 4 }}>🎉 Бесплатный период</div>
          <div style={{ fontSize: 12, color: C.secondary }}>Безопасный бизнес · Осталось {trialDaysLeft ?? '—'} дней</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 4 }}>После — 1 490 ₽/мес</div>
        </Card>
      )}

      {isManagement && notificationSettings && (
        <Card>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Уведомления</div>
          {NOTIFICATION_CATEGORIES.map((cat, i) => {
            const setting = notificationSettings.find((s) => s.category === cat.key);
            return (
              <label
                key={cat.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  padding: '8px 0', borderBottom: i < NOTIFICATION_CATEGORIES.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>{cat.label}</span>
                <input
                  type="checkbox"
                  checked={setting?.enabled ?? true}
                  onChange={(e) => toggleNotificationCategory(cat.key, e.target.checked)}
                />
              </label>
            );
          })}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Push-уведомления</div>
        {pushState === 'unsupported' && (
          <div style={{ fontSize: 13, color: C.subtle }}>Этот браузер не поддерживает push-уведомления.</div>
        )}
        {pushState === 'ios-not-installed' && (
          <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
            На iPhone/iPad push работает только после установки на "Домашний экран": в Safari нажмите "Поделиться" → "На экран «Домой»", затем откройте приложение оттуда.
          </div>
        )}
        {(pushState === 'subscribed' || pushState === 'unsubscribed') && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pushState === 'subscribed' ? 12 : 0 }}>
              <span style={{ fontSize: 14 }}>{pushState === 'subscribed' ? 'Уведомления включены на этом устройстве' : 'Уведомления выключены на этом устройстве'}</span>
              <Btn small variant={pushState === 'subscribed' ? 'secondary' : 'primary'} disabled={pushBusy} onClick={togglePush}>
                {pushState === 'subscribed' ? 'Отключить' : 'Включить'}
              </Btn>
            </div>
            {pushState === 'subscribed' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {isManagement && (
                  <Select value={testCategory} onChange={(e) => setTestCategory(e.target.value)} style={{ width: 'auto', flex: 1, minWidth: 140 }}>
                    {NOTIFICATION_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </Select>
                )}
                <Btn small variant="secondary" disabled={pushBusy} onClick={sendTestPush}>Отправить тестовое</Btn>
              </div>
            )}
            {testSent && <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>✓ Отправлено — проверьте уведомления на устройстве</div>}
          </>
        )}
        {pushError && <div className="alert alert-error" style={{ marginTop: 8 }}>{pushError}</div>}
      </Card>

      {!isManagement && myDocuments && myDocuments.length > 0 && (
        <Card>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Мои документы</div>
          {myDocuments.map((d, i) => (
            <div key={d.id} style={{ padding: '8px 0', borderBottom: i < myDocuments.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{DOC_TYPE_LABELS[d.doc_type]}{d.title ? ` · ${d.title}` : ''}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>Истекает {new Date(d.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>Документы</div>
        <a href="/legal/oferta" target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 14, color: C.primary, textDecoration: 'none', marginBottom: 8 }}>Публичная оферта</a>
        <a href="/legal/privacy_policy" target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 14, color: C.primary, textDecoration: 'none' }}>Политика конфиденциальности</a>
      </Card>

      <Card>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={analyticsConsent} onChange={(e) => toggleAnalyticsConsent(e.target.checked)} style={{ marginTop: 2 }} />
          <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
            Разрешить использование обезличенных агрегированных данных для аналитики. Можно включить или отключить в любой момент.
          </span>
        </label>
      </Card>

      <div onClick={handleSwitch} style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Сменить компанию</div>
          <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>{currentCompany?.name}</div>
        </div>
        <span style={{ fontSize: 20, color: C.border }}>›</span>
      </div>

      <button
        onClick={logout}
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Icon name="logout" size={16} color={C.red} />
        <span style={{ fontSize: 15, color: C.red, fontWeight: 600 }}>Выйти</span>
      </button>
    </div>
  );
}
