import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Select, C } from '../ui/components.jsx';
import ImageLightbox from '../ui/ImageLightbox.jsx';

// Раньше единственный способ посмотреть фото до/после — открыть визит целиком
// на редактирование и разглядеть два превью 48×48px, где тап по превью ещё и
// запускал замену фото, а не просмотр. Отдельная лента "с фото" плюс
// полноэкранный просмотр по тапу — без формы редактирования между ними.
export default function PhotoReports() {
  const navigate = useNavigate();
  const { isManagement } = useAuth();
  const [visits, setVisits] = useState([]);
  const [masters, setMasters] = useState([]);
  const [masterFilter, setMasterFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  function load() {
    setLoading(true);
    const params = { hasPhotos: true };
    if (masterFilter) params.masterMembershipId = masterFilter;
    api.get('/modules/visits', { params }).then((res) => setVisits(res.data)).finally(() => setLoading(false));
  }

  useEffect(load, [masterFilter]);
  usePullToRefresh(load);

  useEffect(() => {
    if (isManagement) {
      api.get('/platform/memberships/roster').then((res) => setMasters(res.data.filter((m) => m.role === 'master')));
    }
  }, [isManagement]);

  function photosOf(v) {
    return [
      v.photo_before_url && { url: v.photo_before_url, label: 'До' },
      v.photo_before_url_2 && { url: v.photo_before_url_2, label: 'До (2)' },
      v.photo_after_url && { url: v.photo_after_url, label: 'После' },
      v.photo_after_url_2 && { url: v.photo_after_url_2, label: 'После (2)' },
    ].filter(Boolean);
  }

  if (loading) return <div className="page-loading">Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Фотоотчёты</div>

      {isManagement && masters.length > 0 && (
        <Select value={masterFilter} onChange={(e) => setMasterFilter(e.target.value)} style={{ marginBottom: 16 }}>
          <option value="">Все мастера</option>
          {masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      )}

      {visits.length === 0 && <div className="empty-hint">Визитов с фото пока нет</div>}

      {visits.map((v) => {
        const photos = photosOf(v);
        return (
          // Ведёт на тот же экран редактирования визита, что и из Финансов
          // (?open=<id>, Visits.jsx это уже умеет) — не дублируем разметку
          // визита здесь ради деталей (материалы, скидка, способ оплаты).
          <Card key={v.id} onClick={() => navigate(`/visits?open=${v.id}`)} style={{ marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v.client_last_name} {v.client_first_name}</div>
                <div style={{ fontSize: 12, color: C.subtle, marginTop: 2 }}>
                  {v.service} {isManagement && v.master_name && `· ${v.master_name.split(' ')[0]} `}· {new Date(v.visit_at).toLocaleString('ru-RU')}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightbox(photos.map((x) => x.url)); }}
                  style={{ cursor: 'pointer', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: C.surface }}
                >
                  <img src={p.url} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <ImageLightbox images={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
