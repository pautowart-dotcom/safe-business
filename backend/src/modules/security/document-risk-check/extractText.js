// Извлечение текстового слоя из загруженного файла (PDF/DOCX) — только
// текст, без OCR: сканы/фото документов без текстового слоя вернут пустую
// или мусорную строку, это ожидаемое ограничение первой версии (19.08.2026).
const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy();
    }
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  throw new Error('Неподдерживаемый тип файла');
}

module.exports = { extractText };
