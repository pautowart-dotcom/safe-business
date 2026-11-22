// Входящая переписка @bezbizru_bot.
// Один проход: точка, дата или заявка, затем ответ.
// Бумаги по сфере бот присылает сам. Нормы и шаги — только после оплаты.
const pool = require('../db/pool');
const freeTier = require('./freeTier');
const { isSubscriptionActive } = require('./middleware/subscription');
const { sendMessage, openButton } = require('./telegramBot');
const { decideTurn } = require('./telegramDialogRules');
const { replyFromKnowledge } = require('./telegramKnowledge');
const { parseDeadline, wantsHuman, isCorrection } = require('./telegramMemory');
const { registerDeadline } = require('./deadlines');
const { sendPushToSuperAdmins } = require('./pushNotify');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fallback(intent) {
  if (intent === 'support') return 'Опишите, что именно не открывается или на каком шаге застряли.';
  if (intent === 'short') return 'Напишите, чем занимается бизнес.';
  return 'Напишите, чем занимается бизнес. Дальше бумаги пришлю сам, по одной.';
}

function plain(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function resolveCompany(companies, text, savedId) {
  const n = plain(text);
  const named = companies.filter((c) => {
    const name = plain(c.name);
    return name.length >= 2 && n.includes(name);
  });
  if (named.length === 1) return named[0].id;
  if (savedId && companies.some((c) => c.id === savedId)) return savedId;
  if (companies.length === 1) return companies[0].id;
  return null;
}

function studioList(companies) {
  return companies.map((c) => c.name).filter(Boolean).join(', ');
}

async function accountFor(telegramUserId) {
  const { rows } = await pool.query(
    'SELECT user_id FROM telegram_links WHERE telegram_user_id = $1',
    [telegramUserId]
  );
  const userId = rows[0]?.user_id || null;
  if (!userId) return { userId: null, companies: [] };
  const { rows: companies } = await pool.query(
    `SELECT c.id, c.name
     FROM memberships m
     JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 AND m.invite_status = 'active' AND m.active = true
     ORDER BY c.name`,
    [userId]
  );
  return { userId, companies };
}

async function accessFor(companyId, userId) {
  if (!companyId) return { aiAllowed: false, conclusionOpen: false, paid: false };
  const { rows: flags } = await pool.query('SELECT free_addons FROM companies WHERE id = $1', [companyId]);
  const aiAllowed = !!flags[0]?.free_addons || await isSubscriptionActive(companyId);
  const conclusionOpen = await freeTier.canSeeConclusion({ companyId, userId });
  const { rows: payments } = await pool.query(
    `SELECT 1 FROM subscription_payments WHERE company_id = $1 AND status = 'succeeded'
     UNION ALL
     SELECT 1 FROM addon_purchases WHERE company_id = $1 AND status = 'succeeded'
       AND (report_id IS NOT NULL OR addon_key = 'document_templates')
     LIMIT 1`,
    [companyId]
  );
  return { aiAllowed, conclusionOpen, paid: aiAllowed || payments.length > 0 };
}

async function cabinetText(companyId, conclusionOpen) {
  const { rows } = await pool.query(
    `SELECT title, to_char(due_date, 'DD.MM.YYYY') AS due
     FROM deadlines
     WHERE company_id = $1 AND status = 'pending' AND due_date IS NOT NULL
     ORDER BY due_date ASC
     LIMIT 5`,
    [companyId]
  );
  const lines = rows.map((r) => `${r.due} — ${r.title}`);
  const parts = [lines.length ? `Ближайшие сроки:\n${lines.join('\n')}` : 'Внесённых сроков в кабинете пока нет.'];

  const { rows: openRows } = await pool.query(
    `SELECT violation_code, niche FROM security_violations
     WHERE company_id = $1 AND status = 'open'
     ORDER BY created_at DESC
     LIMIT 5`,
    [companyId]
  );
  const titles = [];
  if (openRows.length) {
    const repository = require('../modules/security/content/repository');
    for (const row of openRows) {
      const matrix = await repository.getViolationMatrix(row.niche);
      const title = matrix?.find((v) => v.code === row.violation_code)?.title;
      if (title) titles.push(title);
    }
  }
  if (titles.length) parts.push(`Не закрыто, только названия: ${titles.join('; ')}.`);
  else if (openRows.length) parts.push(`Не закрытых пунктов: ${openRows.length}. Названия откройте в кабинете.`);

  parts.push(conclusionOpen
    ? 'Норму и что сделать по пункту смотрите в кабинете. Отсюда это не пересказываю.'
    : 'Что делать по пункту и норма здесь не выдаются: это после оплаты.');
  return parts.join('\n\n');
}

async function correctDeadline(companyId, parsed) {
  const { rows } = await pool.query(
    `SELECT id, title FROM deadlines
     WHERE company_id = $1 AND note = 'Из Telegram' AND status = 'pending'
     ORDER BY id DESC LIMIT 1`,
    [companyId]
  );
  if (!rows[0]) return rememberDeadline(companyId, parsed);
  const title = /^не\b/i.test(parsed.title) ? rows[0].title : parsed.title;
  await pool.query(
    `UPDATE deadlines SET title = $2, due_date = $3::date, status = 'pending' WHERE id = $1`,
    [rows[0].id, title, parsed.iso]
  );
  return `Поправил в кабинете: ${title}, срок ${parsed.label}.`;
}

async function rememberDeadline(companyId, parsed) {
  const { rows } = await pool.query(
    `SELECT id FROM deadlines
     WHERE company_id = $1 AND status = 'pending' AND due_date = $2::date AND lower(title) = lower($3)
     LIMIT 1`,
    [companyId, parsed.iso, parsed.title]
  );
  if (rows[0]) return `В кабинете уже есть: ${parsed.title}, ${parsed.label}.`;
  await registerDeadline({
    companyId,
    category: parsed.category,
    title: parsed.title,
    dueDate: parsed.iso,
    note: 'Из Telegram',
    notify: false,
  });
  return `Записал в кабинет: ${parsed.title}, срок ${parsed.label}.`;
}

async function handoffToHuman({ userId, companyId, incoming, recent }) {
  const { rows: open } = await pool.query(
    `SELECT id FROM support_requests
     WHERE user_id = $1 AND status = 'open' AND message LIKE 'Из Telegram.%'
       AND created_at > now() - interval '12 hours'
     LIMIT 1`,
    [userId]
  );
  if (open[0]) return 'exists';
  const { rows: users } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  const email = users[0]?.email;
  if (!email) return null;
  const tail = (recent || []).slice(-4).map((m) => `${m.role === 'user' ? 'Человек' : 'Бот'}: ${m.text}`).join('\n');
  const message = `Из Telegram.\n${incoming}${tail ? `\n\nПеред этим:\n${tail}` : ''}`.slice(0, 2000);
  await pool.query(
    `INSERT INTO support_requests (user_id, company_id, email, message) VALUES ($1, $2, $3, $4)`,
    [userId, companyId, email, message]
  );
  const preview = incoming.length > 120 ? `${incoming.slice(0, 120)}…` : incoming;
  sendPushToSuperAdmins({
    title: 'Новое обращение в поддержку',
    body: `${email}: ${preview}`,
    url: '/office/support',
  }).catch((err) => console.error('sendPushToSuperAdmins (telegram) failed:', err));
  return 'created';
}

async function applyFeed(fromId, decision) {
  if (decision.feedAction === 'start' && decision.feedTitles?.length) {
    await pool.query(
      `UPDATE telegram_dialogs
       SET feed_stopped_at = NULL, feed_digest_at = NULL, feed_price_mentioned_at = NULL,
           feed_sphere = $2, updated_at = now()
       WHERE telegram_user_id = $1`,
      [fromId, decision.feedSphere]
    );
    await pool.query('DELETE FROM telegram_feed_items WHERE telegram_user_id = $1', [fromId]);
    await pool.query(
      `INSERT INTO telegram_feed_items (telegram_user_id, title, sort)
       SELECT $1, title, ord::smallint
       FROM unnest($2::text[]) WITH ORDINALITY AS papers(title, ord)`,
      [fromId, decision.feedTitles]
    );
  }
  if (decision.feedAction === 'close' && decision.closeTitle) {
    await pool.query(
      `UPDATE telegram_feed_items SET closed_at = now()
       WHERE telegram_user_id = $1 AND title = $2 AND closed_at IS NULL`,
      [fromId, decision.closeTitle]
    );
  }
  if (decision.feedAction === 'stop' || decision.feedDone) {
    await pool.query(
      `UPDATE telegram_dialogs
       SET feed_stopped_at = COALESCE(feed_stopped_at, now()), updated_at = now()
       WHERE telegram_user_id = $1`,
      [fromId]
    );
  }
}

async function handleIncoming({ fromId, chatId, text }) {
  const incoming = typeof text === 'string' ? text.trim() : '';
  const account = await accountFor(fromId);
  await pool.query(
    `INSERT INTO telegram_dialogs (telegram_user_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (telegram_user_id) DO UPDATE
       SET user_id = COALESCE(EXCLUDED.user_id, telegram_dialogs.user_id),
           updated_at = now()`,
    [fromId, account.userId]
  );

  const { rows } = await pool.query(
    `SELECT stage, to_char(greeted_on, 'YYYY-MM-DD') AS greeted_on, pain, needs_human, user_id, company_id,
            feed_sphere, feed_stopped_at
     FROM telegram_dialogs WHERE telegram_user_id = $1`,
    [fromId]
  );
  const savedCompanyId = rows[0].company_id;
  const companyId = resolveCompany(account.companies, incoming, savedCompanyId);
  if (companyId !== savedCompanyId) {
    await pool.query('UPDATE telegram_dialogs SET company_id = $2, updated_at = now() WHERE telegram_user_id = $1', [fromId, companyId]);
  }
  const access = await accessFor(companyId, account.userId);
  account.companyId = companyId;
  account.companyCount = account.companies.length;
  account.paid = access.paid;
  account.aiAllowed = access.aiAllowed;
  account.conclusionOpen = access.conclusionOpen;

  const { rows: feedRows } = await pool.query(
    `SELECT title, sent_at IS NOT NULL AS sent, closed_at IS NOT NULL AS closed
     FROM telegram_feed_items
     WHERE telegram_user_id = $1
     ORDER BY sort`,
    [fromId]
  );
  const dialog = {
    stage: rows[0].stage,
    greetedOn: rows[0].greeted_on,
    pain: rows[0].pain,
    needsHuman: rows[0].needs_human,
    userId: rows[0].user_id,
  };
  const feed = {
    stopped: !!rows[0].feed_stopped_at,
    sphereId: rows[0].feed_sphere,
    items: feedRows.map((item) => ({ title: item.title, sent: item.sent, closed: item.closed })),
  };
  const { rows: recent } = await pool.query(
    `SELECT role, text, intent, created_at FROM (
       SELECT role, text, intent, created_at
       FROM telegram_dialog_messages
       WHERE telegram_user_id = $1
       ORDER BY created_at DESC
       LIMIT 12
     ) t ORDER BY created_at ASC`,
    [fromId]
  );

  const decision = decideTurn({
    text: incoming,
    dialog,
    recent,
    companyCount: account.companyCount,
    linked: !!account.userId,
    aiAllowed: account.aiAllowed,
    conclusionOpen: account.conclusionOpen,
    paid: account.paid,
    now: new Date(),
    feed,
  });
  await pool.query(
    `INSERT INTO telegram_dialog_messages (telegram_user_id, role, text, intent)
     VALUES ($1, 'user', $2, $3)`,
    [fromId, incoming, decision.intent]
  );

  const parsed = parseDeadline(incoming, new Date());
  const correcting = isCorrection(incoming);
  let savedNote = null;
  if (parsed && parsed.invalid) {
    savedNote = 'Такой даты нет. Напишите день и месяц ещё раз, например 15.05.2027.';
  } else if (correcting && !parsed) {
    savedNote = 'Напишите новую дату так: что и до какого числа. Старую строку тогда поправлю.';
  } else if (parsed && account.companyId) {
    try {
      savedNote = correcting
        ? await correctDeadline(account.companyId, parsed)
        : await rememberDeadline(account.companyId, parsed);
    } catch (err) {
      console.error('telegram deadline failed', err.message);
      savedNote = null;
    }
  } else if (parsed && account.companyCount > 1) {
    savedNote = `Срок понял: ${parsed.title}, ${parsed.label}. Точек несколько: ${studioList(account.companies)}. Напишите название, тогда запишу.`;
  } else if (parsed) {
    savedNote = `Срок понял: ${parsed.title}, ${parsed.label}. В кабинет запишу после входа, кнопка слева. До входа дата только в этом чате.`;
  }

  await applyFeed(fromId, decision);

  const askHuman = wantsHuman(incoming) || (decision.intent === 'support' && /оплат|деньги списал/.test(plain(incoming)));
  let handed = null;
  if (askHuman && account.userId) {
    try {
      handed = await handoffToHuman({ userId: account.userId, companyId: account.companyId, incoming, recent });
    } catch (err) {
      console.error('telegram handoff failed', err.message);
    }
  }

  const needStudio = !account.companyId && (decision.lookupKnowledge || decision.loadCabinet);
  let reply;
  if (handed === 'created') reply = 'Передал в поддержку. Ответ придёт на почту кабинета.';
  else if (handed === 'exists') reply = 'Уже передал, заявка открыта.';
  else if (savedNote && decision.feedAction === 'start' && decision.fixedReply) {
    reply = `${savedNote}\n\n${decision.fixedReply}`;
  } else if (savedNote) reply = savedNote;
  else if (needStudio) {
    reply = account.companies.length
      ? `Точек несколько: ${studioList(account.companies)}. Напишите название, о какой речь.`
      : 'Чат не привязан к кабинету. Откройте его кнопкой и войдите.';
  } else if (decision.lookupKnowledge) {
    try {
      reply = await replyFromKnowledge(account.companyId, incoming, recent);
    } catch (err) {
      console.error('telegram knowledge failed', err.message);
      reply = null;
    }
    if (!reply) reply = 'В проверенной базе этого ответа нет. Шаги выдумывать не буду. Напишите «передайте человеку» и почту — передам.';
  } else if (decision.loadCabinet) {
    reply = await cabinetText(account.companyId, account.conclusionOpen);
  } else {
    reply = decision.fixedReply || fallback(decision.intent);
  }
  await pool.query(
    `INSERT INTO telegram_dialog_messages (telegram_user_id, role, text, intent)
     VALUES ($1, 'bot', $2, $3)`,
    [fromId, reply, decision.intent]
  );
  await pool.query(
    `UPDATE telegram_dialogs
     SET stage = $2, greeted_on = $3::date, pain = $4, needs_human = $5,
         interested_at = CASE WHEN $6::boolean AND interested_at IS NULL THEN now() ELSE interested_at END,
         updated_at = now()
     WHERE telegram_user_id = $1`,
    [fromId, decision.nextStage, decision.greetedOn, decision.pain, decision.needsHuman,
      decision.interested === true
      || ['price', 'advice', 'how', 'objection'].includes(decision.intent)
      || decision.nextStage === 'offered']
  );

  const markup = decision.showCabinet ? openButton('Открыть кабинет', '/') : undefined;
  await sendMessage(chatId, esc(reply), markup);
  return reply;
}

module.exports = { handleIncoming };
