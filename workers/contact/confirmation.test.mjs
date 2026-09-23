import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { confirmationMail, confirmationRecipientKey, verifyConfirmationToken, sendConfirmation } from "./confirmation.mjs";

afterEach(() => mock.restoreAll());

test("DE/EN receipts have a fixed sender, team reply-to and automatic-mail headers", () => {
  for (const language of ["de", "en"]) {
    const mail = confirmationMail("test@example.com", language);
    assert.equal(mail.from.email, "foerdercheck@kontakt.realityforge.eu");
    assert.equal(mail.to, "test@example.com");
    assert.equal(mail.replyTo, "realityforgeeu@gmail.com");
    assert.equal(mail.headers["Auto-Submitted"], "auto-generated");
    assert.match(mail.text, /48/);
    assert.match(mail.text, /Patrick & Evgeni/);
    assert.equal(mail.html, undefined);
    assert.match(mail.subject, language === "de" ? /Danke/ : /Thank you/);
  }
});

test("recipient limiter uses hashes and groups case, plus and Gmail aliases", async () => {
  const key = await confirmationRecipientKey("te.st+one@gmail.com");
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, await confirmationRecipientKey("TEST+two@googlemail.com"));
  assert.equal(await confirmationRecipientKey("Test+one@example.com"), await confirmationRecipientKey("test@example.com"));
  assert.notEqual(key, await confirmationRecipientKey("other@gmail.com"));
});

test("verification sends the secret only to Cloudflare and rejects provider failures", async () => {
  const fetch = mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.body.get("secret"), "test-only");
    assert.equal(options.body.get("response"), "token");
    assert.equal(options.redirect, "manual");
    return Response.json({ success: true, hostname: "foerderungen.realityforge.eu", action: "contact" });
  });
  assert.equal(await verifyConfirmationToken("token", "test-only", "192.0.2.1"), true);
  for (const implementation of [
    async () => { throw new Error("Offline"); },
    async () => new Response("", { status: 503 }),
    async () => new Response("", { status: 302 }),
    async () => new Response("not JSON"),
  ]) {
    fetch.mock.mockImplementation(implementation);
    assert.equal(await verifyConfirmationToken("token", "test-only", "192.0.2.1"), false);
  }
});

test("missing credentials and confirmation bindings fail closed", async () => {
  assert.equal(await verifyConfirmationToken("token", "", "192.0.2.1"), false);
  assert.equal(await sendConfirmation({}, "test@example.com", "de"), "unavailable");
});
