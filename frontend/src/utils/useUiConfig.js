import { useEffect, useState } from 'react';
import api from '../api/client.js';

// Переключатели вида кабинета с сервера (26.10.2026, platform/index.js
// /ui-config) — чтобы новый вид можно было откатить строкой в .env без
// деплоя. Один запрос на загрузку страницы; пока не пришёл ответ — null.
let cached = null;

export function useUiConfig() {
  const [config, setConfig] = useState(cached);
  useEffect(() => {
    if (cached) return;
    api.get('/platform/ui-config', { silent: true })
      .then(({ data }) => { cached = data; setConfig(data); })
      .catch(() => setConfig({}));
  }, []);
  return config;
}
