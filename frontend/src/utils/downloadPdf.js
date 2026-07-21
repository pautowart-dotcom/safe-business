import api from '../api/client.js';

// Общий blob-download для PDF-экспортов (отчёт безопасности, журналы,
// досье) — все дергают этот же паттерн: GET как blob, временная ссылка,
// клик, отзыв URL.
export async function downloadPdf(url, filename, setError) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    setError(err.response?.data?.error || 'Не удалось сформировать PDF');
  }
}
