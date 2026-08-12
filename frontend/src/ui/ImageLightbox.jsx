import { createPortal } from 'react-dom';

// Полноэкранный просмотр фото — вынесено из PhotoReports.jsx (12.08.2026),
// чтобы тем же способом смотреть фото и в самой форме визита (Visits.jsx),
// не только в отдельной ленте "Фотоотчёты".
//
// Портал прямо в body — страница листается внутри контейнера с
// -webkit-overflow-scrolling: touch (Layout.jsx), а на iOS position: fixed
// внутри такого контейнера привязывается к нему самому, а не к экрану
// целиком: шапка оставалась кликабельной поверх, а долистать до следующих
// фото было невозможно (overflow контейнера, не окна).
//
// images — массив URL или null (лайтбокс скрыт).
export default function ImageLightbox({ images, onClose }) {
  if (!images || images.length === 0) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        padding: '60px 16px 24px', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      <button
        onClick={onClose}
        aria-label="Закрыть"
        style={{
          position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', fontSize: 18, cursor: 'pointer',
        }}
      >
        ✕
      </button>
      {images.map((url, i) => (
        <img key={i} src={url} alt="" style={{ maxWidth: '92vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
      ))}
    </div>,
    document.body
  );
}
