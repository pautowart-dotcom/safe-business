import api from '../api/client.js';

// Общий blob-download (отчёт безопасности, журналы, досье, экспорт базы
// клиентов) — все дергают этот же паттерн: GET как blob, временная ссылка,
// клик, отзыв URL. downloadPdf — прежнее имя/сигнатура (не трогаем
// существующие вызовы), downloadFile — общий вариант с произвольным типом,
// добавлен 13.08.2026 для CSV-экспорта клиентской базы.
export async function downloadFile(url, filename, mimeType, setError, errorFallback = 'Не удалось скачать файл') {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: mimeType }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    setError(err.response?.data?.error || errorFallback);
  }
}

export async function downloadPdf(url, filename, setError) {
  return downloadFile(url, filename, 'application/pdf', setError, 'Не удалось сформировать PDF');
}
