// ─────────────────────────────────────────────────────
// Newsletter mailer — Resend wrapper + HTML template.
// Resend 的 batch API 一次最多 100 封，超過會自動切片。
// 失敗的子請求會回傳但不會 throw，由上層決定怎麼處理。
// ─────────────────────────────────────────────────────

const { Resend } = require('resend');
const crypto = require('crypto');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM || 'Koimsurai <hello@koimsurai.com>';
const NEWSLETTER_REPLY_TO = process.env.NEWSLETTER_REPLY_TO || '';
const PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || 'https://koimsurai.com').replace(/\/$/, '');
const BATCH_SIZE = 100;

let resendClient = null;
function getResend() {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(RESEND_API_KEY);
  return resendClient;
}

function isMailerConfigured() {
  return Boolean(RESEND_API_KEY);
}

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function postUrl(post) {
  return `${PUBLIC_SITE_URL}/blog/${post.id}`;
}

function unsubscribeUrl(token) {
  return `${PUBLIC_SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

// ── HTML template ───────────────────────────────────
function renderEmail({ post, subscriber }) {
  const title = escapeHtml(post.title);
  const excerpt = escapeHtml(post.excerpt || '').slice(0, 320);
  const url = postUrl(post);
  const unsub = unsubscribeUrl(subscriber.unsubscribe_token);
  const greeting = subscriber.name
    ? `Hi ${escapeHtml(subscriber.name)}，`
    : 'Hi，';

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0c0a18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang TC','Noto Sans TC',sans-serif;color:#e7e3f7;">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">
${excerpt} · Koimsurai 新文章上架
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a18;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <!-- header -->
      <tr><td style="padding:8px 0 24px 0;">
        <a href="${PUBLIC_SITE_URL}" style="color:#c7b8ff;text-decoration:none;font-size:14px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;">
          ✦ Koimsurai
        </a>
      </td></tr>

      <!-- card -->
      <tr><td style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:36px 32px;">
        <p style="margin:0 0 18px 0;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(199,184,255,0.6);font-weight:600;">
          New Post
        </p>
        <h1 style="margin:0 0 16px 0;font-size:24px;line-height:1.4;color:#ffffff;font-weight:700;">
          ${title}
        </h1>
        ${excerpt ? `<p style="margin:0 0 24px 0;font-size:15px;line-height:1.75;color:rgba(231,227,247,0.75);">
          ${excerpt}${post.excerpt && post.excerpt.length > 320 ? '…' : ''}
        </p>` : ''}
        <p style="margin:8px 0 0 0;">
          <a href="${url}" style="display:inline-block;padding:11px 22px;background:rgba(199,184,255,0.08);border:1px solid rgba(199,184,255,0.35);color:#ffffff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:500;letter-spacing:0.02em;">
            閱讀全文 →
          </a>
        </p>
      </td></tr>

      <!-- greeting -->
      <tr><td style="padding:28px 4px 0 4px;font-size:13px;line-height:1.7;color:rgba(231,227,247,0.55);">
        ${greeting}
        <br>
        感謝你訂閱 Koimsurai。如果今天這封信打擾到你，請點下面的退訂連結，下次就不會再寄了。
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:32px 4px 0 4px;border-top:1px solid rgba(255,255,255,0.06);margin-top:24px;font-size:11px;line-height:1.7;color:rgba(231,227,247,0.4);">
        <p style="margin:24px 0 0 0;">
          You're receiving this because you subscribed at
          <a href="${PUBLIC_SITE_URL}" style="color:rgba(199,184,255,0.7);text-decoration:underline;">${PUBLIC_SITE_URL.replace(/^https?:\/\//, '')}</a>.
        </p>
        <p style="margin:8px 0 0 0;">
          <a href="${unsub}" style="color:rgba(199,184,255,0.7);text-decoration:underline;">一鍵退訂</a>
          &nbsp;·&nbsp;
          <a href="${PUBLIC_SITE_URL}/blog" style="color:rgba(199,184,255,0.7);text-decoration:underline;">所有文章</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderSubject(post) {
  return `${post.title} — Koimsurai 新文章`;
}

// ── Plain-text fallback (improves deliverability) ──
function renderText({ post, subscriber }) {
  const url = postUrl(post);
  const unsub = unsubscribeUrl(subscriber.unsubscribe_token);
  return [
    post.title,
    '',
    post.excerpt || '',
    '',
    `閱讀全文：${url}`,
    '',
    '— Koimsurai',
    '',
    `退訂：${unsub}`,
  ].join('\n');
}

// ── Batch send ──────────────────────────────────────
// subscribers: [{ email, name, unsubscribe_token }]
// post: { id, title, excerpt }
// Returns { sent, failed, errors }
async function sendNewsletter({ post, subscribers }) {
  const resend = getResend();
  if (!resend) {
    return { sent: 0, failed: 0, errors: ['RESEND_API_KEY not configured'] };
  }
  if (!subscribers.length) {
    return { sent: 0, failed: 0, errors: [] };
  }

  const subject = renderSubject(post);
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const chunk = subscribers.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((sub) => ({
      from: NEWSLETTER_FROM,
      to: [sub.email],
      subject,
      html: renderEmail({ post, subscriber: sub }),
      text: renderText({ post, subscriber: sub }),
      ...(NEWSLETTER_REPLY_TO ? { reply_to: NEWSLETTER_REPLY_TO } : {}),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl(sub.unsubscribe_token)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    try {
      const { data, error } = await resend.batch.send(payload);
      if (error) {
        failed += chunk.length;
        errors.push(error.message || JSON.stringify(error));
        continue;
      }
      sent += chunk.length;
      // Resend returns an array under data.data with per-email ids; we don't
      // inspect them individually here — Resend will retry transient failures.
      void data;
    } catch (err) {
      failed += chunk.length;
      errors.push(err.message || String(err));
    }
  }

  return { sent, failed, errors };
}

module.exports = {
  isMailerConfigured,
  generateToken,
  sendNewsletter,
  unsubscribeUrl,
  postUrl,
};
