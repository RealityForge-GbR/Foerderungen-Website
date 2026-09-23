import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const origin = "https://foerderungen.realityforge.eu";
const payload = {
  name: "Test Gründer", email: "test@example.com", startup: "Testprojekt",
  phase: "Ideenphase / Vorgründung", message: "Testanfrage mit Umlauten: äöü.\nZweite Zeile.",
  website: "", language: "de",
};

function request(body = payload, overrides = {}) {
  return new Request("https://contact.example/", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
    body: JSON.stringify(body), ...overrides,
  });
}

function bindings(options = {}) {
  const sent = [];
  return {
    sent,
    EMAIL: { async send(mail) { if (options.fail) throw new Error("Provider unavailable"); sent.push(mail); } },
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
