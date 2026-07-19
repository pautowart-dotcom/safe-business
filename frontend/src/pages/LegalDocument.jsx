import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import MarkdownLite from '../ui/MarkdownLite.jsx';
import { C, F } from '../ui/theme.js';

// Публичная страница (доступна без входа — ссылки на неё есть на форме
// приёма приглашения, до создания аккаунта). Текст документа хранится в
// БД и редактируется из панели администратора, не зашит в код.
export default function LegalDocument() {
  const { key } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setDoc(null);
    setError('');
    api
      .get(`/legal/${key}`)
      .then((res) => setDoc(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Не удалось загрузить документ'));
  }, [key]);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', minHeight: '100vh', background: C.bg, fontFamily: F, padding: '24px 20px 60px' }}>
      <button
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        ‹ Назад
      </button>
      {error && <div className="alert alert-error">{error}</div>}
      {!doc && !error && <div style={{ color: C.subtle }}>Загрузка...</div>}
      {doc && (
        <>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: C.primary }}>{doc.title}</div>
          <div style={{ fontSize: 12, color: C.subtle, marginBottom: 24 }}>
            Обновлено: {new Date(doc.updated_at).toLocaleDateString('ru-RU')}
          </div>
          <MarkdownLite text={doc.content} />
        </>
      )}
    </div>
  );
}
