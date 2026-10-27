import "server-only";

/* ═══════════════════════════════════════════════════════════
   TRANSACTIONAL EMAIL — Brevo (https://developers.brevo.com).
   Env: BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME. Without an
   API key nothing is sent and the caller gets `not_configured`
   so the admin can hand the link over manually.
   ═══════════════════════════════════════════════════════════ */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_FROM = "telliancapital@wondercode.ch";
const DEFAULT_FROM_NAME = "Tellian Capital";

export type SendResult =
  | { sent: true }
  | { sent: false; error: "not_configured" | string };

interface SendEmailInput {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { sent: false, error: "not_configured" };

  const sender = {
    email: process.env.EMAIL_FROM || DEFAULT_FROM,
    name: process.env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME,
  };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [input.to],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Brevo send failed", { status: res.status, detail });
      return { sent: false, error: `brevo_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("Brevo send error", err);
    return { sent: false, error: (err as Error)?.message || "network_error" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ActivationEmailInput {
  to: string;
  name: string;
  link: string;
  ttlHours: number;
}

export function sendActivationEmail({
  to,
  name,
  link,
  ttlHours,
}: ActivationEmailInput): Promise<SendResult> {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);
  const subject = "Ihr Zugang zum Tellian Capital Kundenportal / Your Tellian Capital portal access";

  const text = [
    `Guten Tag ${name}`,
    "",
    "Ihr Zugang zum Tellian Capital Kundenportal wurde eingerichtet.",
    "Öffnen Sie den folgenden Link, geben Sie Ihre Kunden-ID ein, legen Sie Ihr Passwort fest und richten Sie Ihre Authenticator-App ein:",
    "",
    link,
    "",
    `Der Link ist einmalig gültig und läuft in ${ttlHours} Stunden ab.`,
    "",
    "---",
    "",
    `Dear ${name}`,
    "",
    "Your access to the Tellian Capital client portal has been set up.",
    "Open the link below, enter your client ID, set your password and set up your authenticator app:",
    "",
    link,
    "",
    `The link can be used once and expires in ${ttlHours} hours.`,
    "",
    "Tellian Capital AG",
  ].join("\n");

  const html = `<!doctype html>
<html lang="de">
  <body style="margin:0;padding:0;background:#F4F4F0;font-family:Inter,Helvetica,Arial,sans-serif;color:#191718;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F4F0;">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D8D5CF;">
          <tr><td style="padding:40px 40px 8px;">
            <div style="font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#8A857C;">Kundenportal · Client Portal</div>
            <div style="width:28px;height:2px;background:#191718;margin:16px 0 20px;"></div>
            <h1 style="font-family:Lustria,Georgia,serif;font-weight:400;font-style:italic;font-size:28px;line-height:1.1;margin:0;">Willkommen bei Tellian Capital.</h1>
          </td></tr>
          <tr><td style="padding:16px 40px 0;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 12px;">Guten Tag ${safeName}</p>
            <p style="margin:0 0 12px;">Ihr Zugang zum Tellian Capital Kundenportal wurde eingerichtet. Öffnen Sie den Link, geben Sie Ihre Kunden-ID ein, legen Sie Ihr Passwort fest und richten Sie Ihre Authenticator-App ein.</p>
          </td></tr>
          <tr><td style="padding:12px 40px 8px;">
            <a href="${safeLink}" style="display:inline-block;background:#281F33;color:#F4F4F0;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;padding:16px 32px;">Zugang aktivieren →</a>
          </td></tr>
          <tr><td style="padding:8px 40px 24px;font-size:13px;line-height:1.6;color:#68635A;">
            <p style="margin:0;">Der Link ist einmalig gültig und läuft in ${ttlHours} Stunden ab. Falls die Schaltfläche nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:</p>
            <p style="margin:8px 0 0;word-break:break-all;"><a href="${safeLink}" style="color:#281F33;">${safeLink}</a></p>
          </td></tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background:#D8D5CF;"></div></td></tr>
          <tr><td style="padding:24px 40px 0;font-size:14px;line-height:1.6;color:#68635A;">
            <p style="margin:0 0 12px;">Dear ${safeName}</p>
            <p style="margin:0 0 12px;">Your access to the Tellian Capital client portal has been set up. Open the link above, enter your client ID, set your password and set up your authenticator app. The link can be used once and expires in ${ttlHours} hours.</p>
          </td></tr>
          <tr><td style="padding:24px 40px 40px;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#8A857C;">Tellian Capital AG · FINMA-lizenziert · Zürich</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendEmail({ to: { email: to, name }, subject, html, text });
}
