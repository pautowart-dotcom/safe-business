import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePullToRefresh } from '../context/PullToRefreshContext.jsx';
import { Card, Select, C } from '../ui/components.jsx';

// Раньше единственный способ посмотреть фото до/после — открыть визит целиком
// на редактирование и разглядеть два превью 48×48px, где тап по превью ещё и
// запускал замену фото, а не просмотр. Отдельная лента "с фото" плюс
// полноэкранный просмотр по тапу — без формы редактирования между ними.
export default function PhotoReports() {
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
          <Card key={v.id} style={{ marginBottom: 10 }}>
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
                  onClick={() => setLightbox(photos.map((x) => x.url))}
                  style={{ cursor: 'pointer', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', background: C.surface }}
                >
                  <img src={p.url} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {lightbox && createPortal(
        // Портал прямо в body — страница листается внутри контейнера с
        // -webkit-overflow-scrolling: touch (Layout.jsx), а на iOS position:
        // fixed внутри такого контейнера привязывается к нему самому, а не к
        // экрану целиком: шапка оставалась кликабельной поверх, а долистать
        // до следующих фото было невозможно (overflow контейнера, не окна).
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            padding: '60px 16px 24px', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            onClick={() => setLightbox(null)}
            aria-label="Закрыть"
            style={{
              position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', fontSize: 18, cursor: 'pointer',
            }}
          >
            ✕
          </button>
          {lightbox.map((url, i) => (
            <img key={i} src={url} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
