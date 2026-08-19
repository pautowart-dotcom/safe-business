const nodemailer = require('nodemailer');

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
async function sendMail({ to, subject, html, attachments }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({ from, to, subject, html, attachments });
}

module.exports = { sendMail };
