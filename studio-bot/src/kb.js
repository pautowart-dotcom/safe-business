// «База студии» (baza.md) и настройки (config.json). Строки с [ЗАПОЛНИТЬ]
// выкидываем до отправки в ИИ — чтобы он не принял заглушку за факт.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLACEHOLDER = '[ЗАПОЛНИТЬ]';

function loadConfig(file = path.join(ROOT, 'config.json')) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cleanKb(raw) {
  const lines = raw.split(/\r?\n/);
  const filled = lines.filter((l) => !l.includes(PLACEHOLDER));
  return {
    text: filled.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    total: lines.filter((l) => /^\s*-\s/.test(l)).length,
    empty: lines.length - filled.length,
  };
}

function loadKb(file = path.join(ROOT, 'baza.md')) {
  return cleanKb(fs.readFileSync(file, 'utf8'));
}

// Тон общения и образцы фраз (stil.md) — редактируется так же просто, как база.
function loadStyle(file = path.join(ROOT, 'stil.md')) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
}

module.exports = { loadConfig, loadKb, cleanKb, loadStyle, PLACEHOLDER };
