const SENDER = "foerdercheck@kontakt.realityforge.eu";
const TEAM = "realityforgeeu@gmail.com";

export async function verifyConfirmationToken(token, secret, ip) {
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: controller.signal,
      redirect: "manual",
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true
      && result.hostname === "foerderungen.realityforge.eu"
      && result.action === "contact";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function confirmationRecipientKey(address) {
  // Store no raw email address in the rate limiter. Group common aliases too.
  let [local, domain] = address.toLowerCase().split("@");
  local = local.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replaceAll(".", "");
    domain = "gmail.com";
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${local}@${domain}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function confirmationMail(address, language) {
  const english = language === "en";
  // Fixed text only: never echo user-controlled names, messages or links to visitors.
  const paragraphs = english ? [
    "Hello,",
    "Thank you for your interest in RealityForge funding support!",
    "We have received your enquiry. We will take a look at your project and usually get back to you within 48 hours.",
    "If you would like to add anything, simply reply to this email.",
    "Best wishes,\nPatrick & Evgeni\nRealityForge GbR\nhttps://foerderungen.realityforge.eu/",
    "This is an automatic acknowledgement. If you did not submit an enquiry, you can ignore this email.",
  ] : [
    "Hallo,",
    "vielen Dank für dein Interesse an RealityForge Förderungen!",
    "Deine Anfrage ist bei uns angekommen. Wir schauen uns dein Vorhaben an und melden uns in der Regel innerhalb von 48 Stunden bei dir.",
    "Falls du noch etwas ergänzen möchtest, antworte einfach auf diese E-Mail.",
    "Viele Grüße\nPatrick & Evgeni\nRealityForge GbR\nhttps://foerderungen.realityforge.eu/",
    "Dies ist eine automatische Eingangsbestätigung. Falls du keine Anfrage gestellt hast, kannst du diese E-Mail ignorieren.",
  ];
  return {
    from: { email: SENDER, name: "RealityForge Förderungen" },
    to: address,
    replyTo: TEAM,
    subject: english ? "Thank you for your enquiry at RealityForge" : "Danke für deine Anfrage bei RealityForge",
    text: paragraphs.join("\n\n"),
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  };
}

export async function sendConfirmation(env, address, language) {
  try {
    if (!env.CONFIRMATION_EMAIL || !env.CONFIRMATION_RATE_LIMITER) return "unavailable";
    const key = await confirmationRecipientKey(address);
    const { success } = await env.CONFIRMATION_RATE_LIMITER.limit({ key });
    if (!success) return "unavailable";
    await env.CONFIRMATION_EMAIL.send(confirmationMail(address, language));
    return "sent";
  } catch {
    // The internal enquiry already succeeded. Never ask visitors to resubmit it
    // just because their receipt failed, and never log provider errors with PII.
    return "unavailable";
  }
}
