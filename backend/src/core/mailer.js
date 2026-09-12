const nodemailer = require('nodemailer');
const pool = require('../db/pool');

// SMTP вместо отдельного transactional-сервиса (SendGrid и т.п.) — осознанный
// выбор для старта: без регистрации в новом внешнем сервисе с иностранной
// оплатой, хорошая доставляемость именно в РФ-почтовые ящики (клиенты
// продукта — там). SMTP_* заполняются в backend/.env на сервере, здесь не
// хранится ничего секретного.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('Почта не настроена: заполните SMTP_HOST/SMTP_USER/SMTP_PASSWORD в .env');
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  return transporter;
}

// Письма — вспомогательная функция, не критический путь: если почта ещё не
// настроена или временно недоступна, вызывающий код должен сам решить,
// критично ли это (см. auth.routes.js — регистрация не должна падать из-за
// письма, а восстановление пароля без него бесполезно для клиента).
//
// attachments (19.08.2026, анонимный разовый аудит) — nodemailer принимает
// массив как есть ({ filename, content } с Buffer в content), просто
// прокидываем без изменений.
//
// meta/email_log (12.09.2026, прямой запрос владельца: "хоть как-то знать
// пришло ли на почту") — раньше единственным следом неудачной отправки был
// console.error в конкретном вызывающем коде (в 5+ разных местах, каждое
// само по себе), нигде не сохранялось и не было видно в админке. Теперь
// КАЖДЫЙ вызов sendMail (а не только помеченные meta) пишет строку в
// email_log — success=true/false, текст ошибки при неудаче. purpose по
// умолчанию 'other' для мест, которые ещё не размечены явно (см.
// migrations/0118_email_log.sql про честную границу — это факт "SMTP
// принял", не факт "дошло до входящих"). Запись в БД сама по себе не
// должна ронять письмо/запрос — обёрнута в свой try/catch, ошибка лога
// только выводится в консоль.
async function sendMail({ to, subject, html, attachments, meta = {} }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const { purpose = 'other', refTable = null, refId = null } = meta;
  let success = false;
  let errorText = null;
  try {
    await getTransporter().sendMail({ from, to, subject, html, attachments });
    success = true;
  } catch (err) {
    errorText = err.message || String(err);
    throw err;
  } finally {
    pool
      .query(
        `INSERT INTO email_log (purpose, recipient, subject, success, error_text, ref_table, ref_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [purpose, to, subject || null, success, errorText, refTable, refId]
      )
      .catch((logErr) => console.error('email_log insert failed:', logErr));
  }
}

module.exports = { sendMail };
