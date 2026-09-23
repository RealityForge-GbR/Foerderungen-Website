import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const origin = "https://foerderungen.realityforge.eu";
const payload = {
  name: "Test Gründer", email: "test@example.com", startup: "Testprojekt",
  phase: "Ideenphase / Vorgründung", message: "Testanfrage mit Umlauten: äöü.\nZweite Zeile.",
  website: "", language: "de",
};

beforeEach(() => {
  mock.method(globalThis, "fetch", async () => Response.json({
    Status: 0, Answer: [{ type: 15, data: "10 mx.example.com." }],
  }));
});
afterEach(() => mock.restoreAll());

function request(body = payload, overrides = {}) {
  return new Request("https://contact.example/", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
    body: JSON.stringify(body), ...overrides,
  });
}

function bindings(options = {}) {
  const sent = [];
  const confirmations = [];
  return {
    sent, confirmations,
    EMAIL: { async send(mail) { if (options.fail) throw new Error("Provider unavailable"); sent.push(mail); } },
    CONFIRMATION_EMAIL: { async send(mail) {
      assert.equal(sent.length, 1, "internal delivery must succeed first");
      if (options.confirmationFail) throw new Error("Receipt unavailable");
      confirmations.push(mail);
    } },
    CONFIRMATION_RATE_LIMITER: { async limit() { return { success: !options.recipientLimited }; } },
    TURNSTILE_SECRET_KEY: "test-secret-not-a-real-key",
    CONTACT_RATE_LIMITER: { async limit() { return { success: !options.limited }; } },
    CONTACT_GLOBAL_LIMITER: { async limit() { return { success: !options.globallyLimited }; } },
  };
}

test("sends once to the fixed inbox, sets reply-to, preserves text and returns CORS", async () => {
  const env = bindings();
  const response = await worker.fetch(request({ ...payload, to: "attacker@example.com" }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(env.sent.length, 1);
  assert.equal(env.sent[0].to, "realityforgeeu@gmail.com");
  assert.equal(env.sent[0].replyTo, payload.email);
  assert.ok(env.sent[0].text.includes(payload.message));
  assert.equal(env.sent[0].html, undefined);
  assert.equal(env.confirmations.length, 0, "cached forms without a token cannot send receipts");
});

test("preflight is allowed only for the production origin", async () => {
  const env = bindings();
  const response = await worker.fetch(request(null, { method: "OPTIONS", body: undefined }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST");
  const blocked = await worker.fetch(request(null, { method: "OPTIONS", body: undefined, headers: { Origin: "https://other.example" } }), env);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(env.sent.length, 0);
});

test("invalid or injected fields never send mail", async () => {
  for (const change of [
    { name: " " }, { name: "x\r\nBcc: victim@example.com" }, { email: "bad" },
    { email: "a@b.de\r\nBcc: x@y.de" }, { message: " " }, { message: "x".repeat(5001) },
    { startup: 42 }, { phase: "x\u0000y" }, { name: null },
  ]) {
    const env = bindings();
    assert.equal((await worker.fetch(request({ ...payload, ...change }), env)).status, 400);
    assert.equal(env.sent.length, 0);
  }
});

test("malformed, oversized and non-JSON bodies are rejected", async () => {
  const env = bindings();
  assert.equal((await worker.fetch(request(null, { body: "{" }), env)).status, 400);
  assert.equal((await worker.fetch(request(null, { body: "x".repeat(24001) }), env)).status, 413);
  assert.equal((await worker.fetch(request(null, { headers: { Origin: origin, "Content-Type": "text/plain" } }), env)).status, 415);
  for (const body of [null, [], "text"]) assert.equal((await worker.fetch(request(body), env)).status, 400);
  assert.equal(env.sent.length, 0);
});

test("honeypot silently drops spam", async () => {
  const env = bindings();
  assert.equal((await worker.fetch(request({ ...payload, website: "spam" }), env)).status, 200);
  assert.equal(env.sent.length, 0);
});

test("per-IP and aggregate rate limits block sending with Retry-After", async () => {
  for (const options of [{ limited: true }, { globallyLimited: true }]) {
    const env = bindings(options);
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal(env.sent.length, 0);
  }
});

test("delivery errors and missing bindings never return success", async () => {
  for (const env of [bindings({ fail: true }), {}]) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  }
});

test("unsupported methods and paths never send mail", async () => {
  const env = bindings();
  assert.equal((await worker.fetch(request(null, { method: "GET", body: undefined }), env)).status, 405);
  assert.equal((await worker.fetch(new Request("https://contact.example/other"), env)).status, 404);
  assert.equal(env.sent.length, 0);
});

test("invalid email formats never reach DNS or the email provider", async () => {
  for (const email of ["a..b@example.com", "a@-example.com", "a@localhost", "a@1.2.3.4"]) {
    const env = bindings();
    const response = await worker.fetch(request({ ...payload, email }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "email_format");
    assert.equal(env.sent.length, 0);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test("nonexistent and null-MX domains never send email", async () => {
  for (const dns of [{ Status: 3 }, { Status: 0, Answer: [{ type: 15, data: "0 ." }] }]) {
    globalThis.fetch.mock.mockImplementation(async () => Response.json(dns));
    const env = bindings();
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "email_domain");
    assert.equal(env.sent.length, 0);
  }
});

test("temporary DNS failure gives a retryable error, not invalid-email or success", async () => {
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ Status: 2 }));
  const env = bindings();
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "email_check_unavailable");
  assert.equal(env.sent.length, 0);
});

test("honeypot and rate-limited requests do not perform DNS lookups", async () => {
  await worker.fetch(request({ ...payload, website: "spam" }), bindings());
  await worker.fetch(request(), bindings({ limited: true }));
  await worker.fetch(request(), bindings({ globallyLimited: true }));
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

function mockVerification(result = { success: true, hostname: "foerderungen.realityforge.eu", action: "contact" }) {
  globalThis.fetch.mock.mockImplementation(async (url) => Response.json(
    String(url).includes("/siteverify") ? result : { Status: 0, Answer: [{ type: 15, data: "10 mx.example.com." }] },
  ));
}

test("verified submission sends a fixed receipt only to the validated email after internal delivery", async () => {
  mockVerification();
  const env = bindings();
  const response = await worker.fetch(request({ ...payload, turnstileToken: "valid-token", to: "attacker@example.org" }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).confirmation, "sent");
  assert.equal(env.confirmations.length, 1);
  const receipt = env.confirmations[0];
  assert.equal(receipt.to, payload.email);
  assert.equal(receipt.replyTo, "realityforgeeu@gmail.com");
  assert.match(receipt.text, /innerhalb von 48 Stunden/);
  for (const value of [payload.name, payload.message, payload.startup, "attacker@example.org"]) {
    assert.ok(!receipt.text.includes(value), "no user-controlled content in receipt");
  }
});

test("invalid, missing, expired or wrong-site tokens cannot trigger a receipt", async () => {
  for (const result of [
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "attacker.example", action: "contact" },
    { success: true, hostname: "foerderungen.realityforge.eu", action: "other" },
    { success: "true", hostname: "foerderungen.realityforge.eu", action: "contact" },
  ]) {
    mockVerification(result);
    const env = bindings();
    const response = await worker.fetch(request({ ...payload, turnstileToken: "invalid-token" }), env);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "verification");
    assert.equal(env.sent.length + env.confirmations.length, 0);
  }
  mockVerification();
  for (const token of ["", null, 42, "x".repeat(2049)]) {
    const env = bindings();
    const response = await worker.fetch(request({ ...payload, turnstileToken: token }), env);
    assert.equal(response.status, 400);
    assert.equal(env.sent.length + env.confirmations.length, 0);
  }
});

test("internal failure never sends a receipt", async () => {
  mockVerification();
  const env = bindings({ fail: true });
  const response = await worker.fetch(request({ ...payload, turnstileToken: "valid-token" }), env);
  assert.equal(response.status, 503);
  assert.equal(env.confirmations.length, 0);
});

test("receipt failure or recipient limit does not turn a delivered enquiry into an error", async () => {
  mockVerification();
  for (const options of [{ confirmationFail: true }, { recipientLimited: true }]) {
    const env = bindings(options);
    const response = await worker.fetch(request({ ...payload, turnstileToken: "valid-token" }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).confirmation, "unavailable");
    assert.equal(env.sent.length, 1);
    assert.equal(env.confirmations.length, 0);
  }
});
