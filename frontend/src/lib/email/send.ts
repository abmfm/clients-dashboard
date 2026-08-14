import "server-only";

/**
 * Sends transactional email through Resend.
 *
 * Chosen because it needs one API key and no SMTP credentials, and it will
 * deliver from `onboarding@resend.dev` to a verified address before any domain
 * is set up - so booking alerts work on day one.
 *
 * Every failure is swallowed and reported, never thrown: an email problem must
 * not turn a successful booking into an error on the client's screen.
 */

const ENDPOINT = "https://api.resend.com/emails";

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY is not set." };
  if (!to) return { sent: false, reason: "No notification address configured." };

  const from = process.env.EMAIL_FROM || "Twelve East <onboarding@resend.dev>";

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      return { sent: false, reason: data.message ?? `Resend returned ${response.status}.` };
    }

    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Send failed." };
  }
}

/** Plain, readable booking alert. Deliberately no images and no tracking. */
export function bookingEmail(params: {
  clientName: string;
  kind: string;
  when: string;
  isExtra: boolean;
  location?: string | null;
  notes?: string | null;
  siteUrl?: string;
}) {
  const { clientName, kind, when, isExtra, location, notes, siteUrl } = params;

  const subject = `${clientName} booked a ${kind} session — ${when}`;

  const rows: [string, string][] = [
    ["Client", clientName],
    ["Session", kind],
    ["When", when],
    ["Type", isExtra ? "Extra session (charged separately)" : "Included in package"],
  ];
  if (location) rows.push(["Location", location]);
  if (notes) rows.push(["Notes", notes]);

  const text = [
    `${clientName} booked a ${kind} session.`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    siteUrl ? `Review it: ${siteUrl}/admin/requests` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280">Twelve East</p>
  <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;letter-spacing:-0.01em">
    New booking from ${escapeHtml(clientName)}
  </h1>

  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rows
      .map(
        ([k, v]) => `<tr>
      <td style="padding:9px 0;color:#6b7280;width:110px;vertical-align:top">${escapeHtml(k)}</td>
      <td style="padding:9px 0;font-weight:500">${escapeHtml(v)}</td>
    </tr>`
      )
      .join("")}
  </table>

  ${
    siteUrl
      ? `<a href="${siteUrl}/admin/requests"
         style="display:inline-block;margin-top:20px;background:#111827;color:#fff;
                text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px">
        Review the request
      </a>`
      : ""
  }
</div>`.trim();

  return { subject, html, text };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
