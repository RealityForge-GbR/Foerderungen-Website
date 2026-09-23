import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../../script.js", import.meta.url), "utf8");
function setup({ language = "de", fetch, hasForm = true, valid = true } = {}) {
  const values = { name: "Test", email: "test@example.com", startup: "", phase: "", message: "Testnachricht", website: "" };
  const listeners = {};
  const status = { textContent: "", dataset: {}, focus() { this.focused = true; } };
  const label = { textContent: "Absenden" };
  const button = { disabled: true, querySelector() { return label; } };
  const required = ["name", "email", "message"].map(key => ({
    get value() { return values[key]; }, setCustomValidity(text) { this.error = text; }, addEventListener() {},
  }));
  const form = {
    action: "https://realityforge-foerderungen-contact.realityforgeeu.workers.dev/",
    getAttribute(name) { return name === "action" ? this.action : null; },
    querySelector(selector) { return selector === ".form-status" ? status : button; },
    querySelectorAll() { return required; },
    reportValidity() { return valid && required.every(input => !input.error); },
    addEventListener(name, listener) { listeners[name] = listener; },
    setAttribute() {}, removeAttribute() {},
    reset() { this.resetCalled = true; },
  };
  const root = { lang: language, classList: { add() {} }, dataset: { theme: "light" }, style: {} };
  vm.runInNewContext(script, {
    document: {
      documentElement: root,
      querySelector(selector) { return selector === ".contact-form" && hasForm ? form : null; },
      querySelectorAll() { return []; },
    },
    window: { matchMedia() { return { addEventListener() {} }; }, addEventListener() {}, location: { hash: "" } },
    FormData: class { get(key) { return values[key]; } },
    AbortController, setTimeout, clearTimeout,
    fetch: fetch || (async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
  });
  return { form, status, label, button, values, submit: () => listeners.submit({ preventDefault() {} }) };
}

test("successful submission resets form, restores button, announces status", async () => {
  let sent;
  const ui = setup({ fetch: async (url, options) => {
    sent = { url, options };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  } });
  assert.equal(ui.button.disabled, false);
  await ui.submit();
  assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.credentials, "omit");
  assert.equal(JSON.parse(sent.options.body).email, "test@example.com");
  assert.equal(ui.form.resetCalled, true);
  assert.equal(ui.status.dataset.state, "success");
  assert.equal(ui.status.focused, true);
  assert.equal(ui.button.disabled, false);
  assert.equal(ui.label.textContent, "Absenden");
});

test("delivery errors, rate limits, invalid JSON and network errors preserve inputs", async () => {
  for (const outcome of [400, 413, 429, 503, "network", "json", "false-success"]) {
    const ui = setup({ fetch: async () => {
      if (outcome === "network") throw new TypeError("Offline");
      return { ok: outcome === "false-success", status: outcome, json: async () => {
        if (outcome === "json") throw new SyntaxError("Invalid JSON");
        return { ok: false };
      } };
    } });
    await ui.submit();
    assert.equal(ui.status.dataset.state, "error");
    assert.equal(ui.form.resetCalled, undefined);
    assert.equal(ui.values.message, "Testnachricht");
    assert.equal(ui.button.disabled, false);
    if (outcome === 429) assert.match(ui.status.textContent, /eine Minute/);
  }
});

test("double submit does not send twice while a request is pending", async () => {
  let resolve, count = 0;
  const ui = setup({ fetch: () => { count++; return new Promise(done => { resolve = done; }); } });
  const pending = ui.submit();
  assert.equal(ui.button.disabled, true);
  assert.equal(ui.status.dataset.state, "pending");
  await ui.submit();
  assert.equal(count, 1);
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await pending;
});

test("invalid fields and whitespace-only required fields do not submit", async () => {
  let calls = 0;
  const fetch = async () => { calls++; };
  await setup({ valid: false, fetch }).submit();
  const ui = setup({ fetch });
  ui.values.name = "   ";
  await ui.submit();
  assert.equal(calls, 0);
});

test("existing English page receives English feedback", async () => {
  const ui = setup({ language: "en" });
  await ui.submit();
  assert.match(ui.status.textContent, /Your enquiry has been submitted/);
});

test("shared script still supports business card pages without forms", () => {
  assert.doesNotThrow(() => setup({ hasForm: false }));
});

test("email validation errors explain the problem and preserve all inputs in both languages", async () => {
  for (const language of ["de", "en"]) {
    for (const code of ["email_format", "email_domain", "email_check_unavailable"]) {
      const ui = setup({ language, fetch: async () => ({
        ok: false, status: code === "email_check_unavailable" ? 503 : 400,
        json: async () => ({ ok: false, code }),
      }) });
      const before = { ...ui.values };
      await ui.submit();
      assert.deepEqual(ui.values, before);
      assert.equal(ui.form.resetCalled, undefined);
      assert.equal(ui.status.dataset.state, "error");
      assert.equal(ui.button.disabled, false);
      assert.match(ui.status.textContent, /Format|format|Domain|domain/);
      if (code === "email_check_unavailable") {
        assert.match(ui.status.textContent, /nichts versendet|Nothing has been sent/);
      }
    }
  }
});
