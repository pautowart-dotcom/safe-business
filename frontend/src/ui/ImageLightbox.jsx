import { useRef, useState } from 'react';
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

function dist(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

// Настоящее приближение (12.08.2026: "в фотоотчётах никак приблизить фото" —
// показ покрупнее без масштабирования оказался недостаточным) — pinch двумя
// пальцами и двойной тап, с перетаскиванием, когда фото уже увеличено.
// Без внешней библиотеки — жест несложный (масштаб + сдвиг через
// CSS transform), но нужен per-image state, поэтому отдельный компонент.
function ZoomableImage({ url }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const stateRef = useRef({
    pinchStartDist: 0,
    pinchStartScale: 1,
    dragStart: null,
    posStart: { x: 0, y: 0 },
    lastTapTime: 0,
  });

  function clampPos(nextPos, nextScale) {
    // Простой клэмп — не даём утащить изображение полностью за пределы
    // экрана при масштабе > 1 (без точного расчёта габаритов картинки,
    // достаточно грубой оценки от масштаба, чтобы не улетало насовсем).
    if (nextScale <= 1) return { x: 0, y: 0 };
    const maxOffset = (nextScale - 1) * 160;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, nextPos.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, nextPos.y)),
    };
  }

  function resetZoom() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  function handleTouchStart(e) {
    const s = stateRef.current;
    if (e.touches.length === 2) {
      s.pinchStartDist = dist(e.touches[0], e.touches[1]);
      s.pinchStartScale = scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - s.lastTapTime < 300) {
        // Двойной тап — переключатель между "как есть" и увеличенным видом.
        if (scale > 1) resetZoom();
        else { setScale(DOUBLE_TAP_SCALE); setPos({ x: 0, y: 0 }); }
        s.lastTapTime = 0;
        return;
      }
      s.lastTapTime = now;
      if (scale > 1) {
        s.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        s.posStart = pos;
      }
    }
  }

  function handleTouchMove(e) {
    const s = stateRef.current;
    if (e.touches.length === 2 && s.pinchStartDist > 0) {
      e.preventDefault();
      const ratio = dist(e.touches[0], e.touches[1]) / s.pinchStartDist;
      const next = Math.max(1, Math.min(MAX_SCALE, s.pinchStartScale * ratio));
      setScale(next);
      setPos((p) => clampPos(p, next));
    } else if (e.touches.length === 1 && s.dragStart && scale > 1) {
      e.preventDefault();
      const next = {
        x: s.posStart.x + (e.touches[0].clientX - s.dragStart.x),
        y: s.posStart.y + (e.touches[0].clientY - s.dragStart.y),
      };
      setPos(clampPos(next, scale));
    }
  }

  function handleTouchEnd(e) {
    const s = stateRef.current;
    if (e.touches.length < 2) s.pinchStartDist = 0;
    if (e.touches.length === 0) {
      s.dragStart = null;
      if (scale < 1.05) resetZoom();
    }
  }

  return (
    <img
      src={url}
      alt=""
      onClick={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={(e) => { e.stopPropagation(); scale > 1 ? resetZoom() : setScale(DOUBLE_TAP_SCALE); }}
      style={{
        maxWidth: '92vw', maxHeight: '85vh', borderRadius: 8, objectFit: 'contain', flexShrink: 0,
        transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
        transition: scale === 1 ? 'transform 0.15s ease-out' : 'none',
        // 'none' только когда реально увеличено — иначе браузер вообще не
        // пропускал обычный вертикальный свайп между фото к JS (жалоба
        // владельца 12.08.2026: "листать свайпом вниз не работает, только
        // ползунком"). 'pan-y' в состоянии покоя отдаёт вертикальный скролл
        // контейнеру как раньше, но всё равно не даёт браузеру перехватить
        // pinch своим нативным зумом — это по-прежнему ловит JS-обработчик.
        touchAction: scale > 1 ? 'none' : 'pan-y',
        cursor: scale > 1 ? 'grab' : 'zoom-in',
      }}
    />
  );
}

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
          background: 'rgba(255,255,255,0.15)', border: 'none', color: '#FFF', fontSize: 18, cursor: 'pointer', zIndex: 1,
        }}
      >
        ✕
      </button>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: -4 }}>Двойной тап или разведите пальцы, чтобы приблизить</div>
      {images.map((url, i) => (
        <ZoomableImage key={i} url={url} />
      ))}
    </div>,
    document.body
  );
}
