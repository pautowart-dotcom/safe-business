import { useState } from 'react';
import axios from 'axios';
import { Card, Btn, TextInput, Field, Badge, C, F } from '../ui/components.jsx';

// Бесплатный аудит карточки Яндекс.Карт без регистрации (23.08.2026) —
// публичная страница вне Layout/PrivateRoute, по образцу AnonymousAudit.jsx,
// но проще: один шаг (ссылка → отчёт), без гостевого аккаунта и без токена —
// свой собственный axios-инстанс без общего интерсептора авторизации
// (frontend/src/api/client.js), чтобы не трогать уже залогиненную сессию
// в том же браузере и не тянуть в публичный запрос чужой Bearer-токен.
const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 30000 });

function IntroForm({ url, setUrl, onCheck, checking, error }) {
  return (
    <Card>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Бесплатная проверка карточки на Яндекс.Картах</div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16, lineHeight: 1.5 }}>
        Вставьте ссылку на карточку своей компании — покажем, что стоит улучшить, чтобы карточка
        приводила больше клиентов. Бесплатно, без регистрации.
      </div>
      <Field label="Ссылка на карточку в Яндекс.Картах">
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yandex.ru/maps/org/..."
        />
      </Field>
      {error && <div className="alert alert-error">{error}</div>}
      <Btn onClick={onCheck} disabled={checking}>{checking ? 'Проверяем…' : 'Проверить карточку'}</Btn>
    </Card>
  );
}

function ResultView({ fields, findings, onReset }) {
  return (
    <div>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{fields.title || 'Карточка'}</div>
        <div style={{ fontSize: 13, color: C.secondary, marginBottom: 10 }}>
          {fields.ratingValue != null ? `Рейтинг ${fields.ratingValue.toFixed(1)}` : 'Рейтинга пока нет'}
          {fields.reviewCount != null ? ` · ${fields.reviewCount} отзывов` : ''}
          {fields.photosCount != null ? ` · ${fields.photosCount} фото` : ''}
        </div>
        <Badge color={C.orange} bg={C.orangeBg}>Найдено рекомендаций: {findings.length}</Badge>
      </Card>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Что стоит улучшить</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {findings.map((f) => (
            <div key={f.code} style={{ paddingBottom: 12, borderBottom: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.5 }}>
              {f.text}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: C.secondary, lineHeight: 1.5, marginBottom: 12 }}>
          Это часть того, за чем следит «Безопасный бизнес» — сроки документов, журналы, чек-листы,
          чтобы ничего важного не выпадало из внимания.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={onReset}>Проверить другую ссылку</Btn>
          <a href="/register" style={{ textDecoration: 'none' }}>
            <Btn>Узнать про Безопасный бизнес</Btn>
          </a>
        </div>
      </Card>
    </div>
  );
}

export default function YandexCardAudit() {
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function check() {
    if (!url.trim()) {
      setError('Вставьте ссылку на карточку');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const { data } = await publicApi.post('/platform/yandex-card-audit', { url: url.trim() });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось проверить карточку');
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setResult(null);
    setUrl('');
    setError('');
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px', fontFamily: F, height: '100vh', overflowY: 'auto' }}>
      {!result && <IntroForm url={url} setUrl={setUrl} onCheck={check} checking={checking} error={error} />}
      {result && <ResultView fields={result.fields} findings={result.findings} onReset={reset} />}
    </div>
  );
}
