// Bot API по HTTPS, без библиотек. Токен — STUDIO_BOT_TOKEN.
const API = 'https://api.telegram.org';

async function call(method, payload = {}, timeoutMs = 15000) {
  const res = await fetch(`${API}/bot${process.env.STUDIO_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) console.error(`[tg] ${method}: ${data.description}`);
  return data;
}

// Отправка с файлами (multipart). files: { имяПоля: путь к файлу }.
async function upload(method, fields, files) {
  const fs = require('fs');
  const path = require('path');
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  for (const [k, file] of Object.entries(files)) form.append(k, new Blob([fs.readFileSync(file)]), path.basename(file));
  const res = await fetch(`${API}/bot${process.env.STUDIO_BOT_TOKEN}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok) console.error(`[tg] ${method}: ${data.description}`);
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { call, upload, esc };
