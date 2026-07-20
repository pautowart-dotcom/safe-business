import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, Field, TextInput, Btn, Icon, C } from '../ui/components.jsx';

const ROLE_LABELS = { owner: 'Владелец', admin: 'Администратор', master: 'Мастер' };

export default function Settings() {
  const { user, currentCompany, isManagement, logout, switchCompany, renameCurrentCompany, setUserAvatar } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [analyticsConsent, setAnalyticsConsent] = useState(!!user?.analytics_consent);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  useEffect(() => {
    api.get('/platform/companies/current').then((res) => setCompany(res.data));
  }, []);

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
