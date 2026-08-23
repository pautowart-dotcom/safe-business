import { useEffect, useState } from 'react';

// Порог, с которого включается десктопный каркас (сайдбар вместо нижней
// навигации) — см. Layout.jsx и Dashboard.jsx. 900px — обычный ноутбук уже
// шире, планшет в портретной ориентации ещё нет, остаётся мобильным видом.
const QUERY = '(min-width: 900px)';

export default function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window !== 'undefined' && window.matchMedia(QUERY).matches));

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}
