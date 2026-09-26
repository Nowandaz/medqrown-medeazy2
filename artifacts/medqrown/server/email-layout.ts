/**
 * Shared branded HTML layout for every outgoing email. The wording comes from the editable
 * templates (plain text with {placeholders}); this only decides how it looks.
 */
import type { EmailVariables } from "./stage11-email";

const BRAND = "#0f766e";

const SUBTITLES: Record<string, string> = {
  invite_set_password: "Welcome — set your password",
  existing_student_enrolled: "You're in for this cohort",
  renewal_7_days: "Membership renewal",
  renewal_3_days: "Membership renewal",
  renewal_last_day: "Membership renewal",
  payment_approved: "Payment approved",
  payment_rejected: "Payment update",
  announcement: "Class announcement",
  waitlist_registration_open: "Registration is open",
  password_reset: "Student Portal — Password Reset",
};

/** Which variable holds the email's main link, and the button label for it. */
const PRIMARY_LINK: Record<string, [string, string]> = {
  invite_set_password: ["renew_link", "Set my password"],
  renewal_7_days: ["renew_link", "Renew now"],
  renewal_3_days: ["renew_link", "Renew now"],
  renewal_last_day: ["renew_link", "Renew now"],
  announcement: ["announcement_link", "Open link"],
  waitlist_registration_open: ["renew_link", "Sign up now"],
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const linkify = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+/g, (url) =>
  `<a href="${url}" style="color:${BRAND};word-break:break-all">${url}</a>`);

function button(href: string, label: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0"><tr><td style="border-radius:10px;background:${BRAND}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function codeBox(code: string) {
  return `<div style="margin:18px 0;padding:18px;border-radius:12px;background:#f1f5f4;border:1px solid #dfe7e5;text-align:center">
<span style="font-size:32px;font-weight:800;letter-spacing:10px;color:#0b1f1d;font-family:'SFMono-Regular',Consolas,monospace">${escapeHtml(code)}</span></div>`;
}

export function renderEmailHtml(templateKey: string, subject: string, text: string, variables: EmailVariables): string {
  const baseKey = templateKey.replace(/^custom:/, "");
  const subtitle = SUBTITLES[baseKey] ?? subject;
  const [linkVar, linkLabel] = PRIMARY_LINK[baseKey] ?? [];
  const primaryLink = linkVar ? String(variables[linkVar] ?? "").trim() : "";
  const code = String(variables.reset_code ?? "").trim();
  const name = String(variables.student_name ?? "").trim();
  let buttonUsed = false;

  const blocks = text.trim().split(/\n{2,}/).map((paragraph) => {
    const lines = paragraph.split("\n");
    const htmlLines = lines.map((line) => {
      const trimmed = line.trim();
      if (primaryLink && trimmed === primaryLink && !buttonUsed) {
        buttonUsed = true;
        return "__BUTTON__";
      }
      let html = linkify(escapeHtml(line));
      if (name && /^(hello|hi|dear)\b/i.test(trimmed)) html = html.replace(escapeHtml(name), `<strong>${escapeHtml(name)}</strong>`);
      if (code) html = html.replace(escapeHtml(code), `<strong>${escapeHtml(code)}</strong>`);
      return html;
    });
    const parts: string[] = [];
    let current: string[] = [];
    for (const line of htmlLines) {
      if (line === "__BUTTON__") {
        if (current.length) parts.push(`<p style="margin:0 0 14px">${current.join("<br>")}</p>`);
        current = [];
        parts.push(button(primaryLink, linkLabel!));
      } else current.push(line);
    }
    if (current.length) parts.push(`<p style="margin:0 0 14px">${current.join("<br>")}</p>`);
    if (code && paragraph.includes(code)) parts.push(codeBox(code));
    return parts.join("");
  });
  if (primaryLink && !buttonUsed) blocks.push(button(primaryLink, linkLabel!));

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2f1">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f1;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1c2b29">
<tr><td style="background:linear-gradient(135deg,#0f766e,#115e59);padding:26px 28px">
<div style="font-size:22px;font-weight:800;color:#ffffff">MedQrown <span style="color:#99f6e4">MedEazy</span></div>
<div style="margin-top:4px;font-size:14px;color:#ccfbf1">${escapeHtml(subtitle)}</div>
</td></tr>
<tr><td style="padding:26px 28px 8px;font-size:15px;line-height:1.6">${blocks.join("")}</td></tr>
<tr><td style="padding:14px 28px 26px;border-top:1px solid #edf1f0;font-size:12px;line-height:1.5;color:#6b7c79">
MedQrown MedEazy · Academic Consultancy<br>Questions? Reply to this email or WhatsApp +254 702 797 977.
</td></tr>
</table></td></tr></table></body></html>`;
}
