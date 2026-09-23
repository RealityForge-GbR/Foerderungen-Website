import { parseEmail, checkMailDomain } from "./email-validation.mjs";

const ALLOWED_ORIGIN = "https://foerderungen.realityforge.eu";
const RECIPIENT = "realityforgeeu@gmail.com";
const SENDER = "foerdercheck@kontakt.realityforge.eu";
const MAX_BODY_BYTES = 24000;

function reply(status, code, cors = true) {
  return new Response(JSON.stringify({ ok: status === 200, code }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
      ...(cors ? { "Access-Control-Allow-Origin": ALLOWED_ORIGIN } : {}),
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

async function readBody(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES) {
    throw new RangeError("Body too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function field(value, max, required = false, multiline = false) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > max || (required && !text)) return null;
  // Keep newlines only in the message. Reject header injection/control characters.
  const controls = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  return controls.test(text) ? null : text;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/") return reply(404, "not_found", false);
    if (request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return reply(403, "origin", false);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin",
        },
      });
    }
    if (request.method !== "POST") return reply(405, "method");
    if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
      return reply(415, "content_type");
    }

    try {
      // CF-Connecting-IP is supplied by Cloudflare, not trusted from form fields.
      // Limits are deliberately checked before parsing or attempting email delivery.
      const ip = request.headers.get("CF-Connecting-IP");
      if (!ip || !env.CONTACT_RATE_LIMITER || !env.CONTACT_GLOBAL_LIMITER || !env.EMAIL) {
        return reply(503, "unavailable");
      }
      const { success } = await env.CONTACT_RATE_LIMITER.limit({ key: `foerderungen:${ip}` });
      if (!success) return reply(429, "rate_limit");

      let data;
      try {
        data = await readBody(request);
      } catch (error) {
        return reply(error instanceof RangeError ? 413 : 400, "invalid");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) return reply(400, "invalid");
      // Honeypot: appear successful to simple bots, without sending mail.
      if (typeof data.website !== "string") return reply(400, "invalid");
      if (data.website.trim()) return reply(200, "received");

      const name = field(data.name, 120, true);
      const email = field(data.email, 254, true);
      const startup = field(data.startup, 200);
      const phase = field(data.phase, 120);
      const message = field(data.message, 5000, true, true);
      if ([name, startup, phase, message].includes(null)) {
        return reply(400, "invalid");
      }
      const mailbox = parseEmail(email);
      if (!mailbox) return reply(400, "email_format");
      const globalLimit = await env.CONTACT_GLOBAL_LIMITER.limit({ key: "contact" });
      if (!globalLimit.success) return reply(429, "rate_limit");
      const mailDomain = await checkMailDomain(mailbox.domain);
      if (mailDomain === "invalid") return reply(400, "email_domain");
      if (mailDomain === "unavailable") return reply(503, "email_check_unavailable");

      // Fixed envelope, plain text only. Visitors can never choose a recipient.
      await env.EMAIL.send({
        from: { email: SENDER, name: "RealityForge Fördercheck" },
        to: RECIPIENT,
        replyTo: mailbox.address,
        subject: `Fördercheck-Anfrage von ${name}`,
        text: [
          "Neue Anfrage über foerderungen.realityforge.eu",
          "",
          `Name: ${name}`,
          `E-Mail: ${email}`,
          `Unternehmen / Projekt: ${startup || "Nicht angegeben"}`,
          `Phase: ${phase || "Nicht angegeben"}`,
          `Sprache: ${data.language === "en" ? "Englisch" : "Deutsch"}`,
          "",
          "Vorhaben:",
          message,
        ].join("\n"),
      });
      return reply(200, "received");
    } catch {
      // Do not log form contents, IP addresses or provider errors containing PII.
      return reply(503, "unavailable");
    }
  },
};
