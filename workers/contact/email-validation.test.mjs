import test from "node:test";
import assert from "node:assert/strict";
import { parseEmail, checkMailDomain } from "./email-validation.mjs";

test("common addresses, plus tags, subdomains and internationalized domains", () => {
  for (const address of ["name@example.com", "first.last+funding@sub.example.co.uk", "o'hara@example.com"]) {
    assert.equal(parseEmail(address)?.address, address);
  }
  assert.deepEqual(parseEmail("Name@EXAMPLE.COM"), { address: "Name@example.com", domain: "example.com" });
  assert.equal(parseEmail("name@bücher.de")?.domain, "xn--bcher-kva.de");
});

test("bad local parts, labels, lengths and URL/header injection are rejected", () => {
  for (const address of [
    "", null, 42, "name", "a@@example.com", "@example.com", "name@", "a b@example.com",
    ".a@example.com", "a.@example.com", "a..b@example.com", "a@localhost", "a@1.2.3.4",
    "a@-example.com", "a@example-.com", "a@example..com", "a@example.com.", "a@_mail.example.com",
    "a@example.com/path", "a@example.com:443", "a@example.com?x=1", "a@exam%70le.com",
    "a@example.com\r\nBcc:x@y.com", "a@[::1]", "a@exam\\ple.com", "a@\u0000example.com",
    `${"a".repeat(65)}@example.com`, `a@${"a".repeat(64)}.com`,
    `${"a".repeat(64)}@${Array(4).fill("b".repeat(60)).join(".")}.com`,
  ]) assert.equal(parseEmail(address), null, String(address));
});

function dnsMock(records) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: new URL(url), options });
    const record = records[new URL(url).searchParams.get("type")];
    if (record instanceof Error) throw record;
    return Response.json(record ?? { Status: 0 });
  };
  return { calls, fetch };
}

test("MX domain is accepted; lookup discloses only the domain to the fixed resolver", async () => {
  const dns = dnsMock({ MX: { Status: 0, Answer: [{ type: 15, data: "10 mx.example.com." }] } });
  assert.equal(await checkMailDomain("example.com", dns.fetch), "valid");
  assert.equal(dns.calls.length, 1);
  assert.equal(dns.calls[0].url.origin, "https://cloudflare-dns.com");
  assert.equal(dns.calls[0].url.searchParams.get("name"), "example.com");
  assert.equal(dns.calls[0].options.headers.Accept, "application/dns-json");
  assert.equal(dns.calls[0].options.redirect, "manual");
});

test("NXDOMAIN and null MX are rejected without A/AAAA fallback", async () => {
  for (const MX of [{ Status: 3 }, { Status: 0, Answer: [{ type: 15, data: "0 ." }] }]) {
    const dns = dnsMock({ MX });
    assert.equal(await checkMailDomain("example.com", dns.fetch), "invalid");
    assert.equal(dns.calls.length, 1);
  }
});

test("A-only and AAAA-only implicit MX domains are accepted", async () => {
  for (const record of [{ A: { Status: 0, Answer: [{ type: 1, data: "192.0.2.1" }] } },
    { AAAA: { Status: 0, Answer: [{ type: 28, data: "2001:db8::1" }] } }]) {
    const dns = dnsMock(record);
    assert.equal(await checkMailDomain("example.com", dns.fetch), "valid");
    assert.equal(dns.calls.length, 3);
  }
});

test("domains without mail routes are rejected; unrelated CNAME/TXT records do not pass", async () => {
  const dns = dnsMock({
    MX: { Status: 0, Answer: [{ type: 5, data: "alias.example.net." }] },
    A: { Status: 0, Answer: [{ type: 16, data: "not an IP" }] },
  });
  assert.equal(await checkMailDomain("example.com", dns.fetch), "invalid");
});

test("SERVFAIL, network/HTTP/JSON errors and malformed responses are retryable", async () => {
  for (const MX of [{ Status: 2 }, { Status: 5 }, { Status: 0, TC: true }, null,
    { Status: 0, Answer: {} }, { Status: 0, Answer: [{ type: 15, data: "bad" }] }, new Error("offline")]) {
    const dns = dnsMock({ MX: MX ?? { not: "DNS" } });
    assert.equal(await checkMailDomain("example.com", dns.fetch), "unavailable");
  }
  assert.equal(await checkMailDomain("example.com", async () => new Response("down", { status: 503 })), "unavailable");
  assert.equal(await checkMailDomain("example.com", async () => new Response(null, { status: 302, headers: { Location: "https://other.example" } })), "unavailable");
  assert.equal(await checkMailDomain("example.com", async () => new Response("{")), "unavailable");
});

test("failed address fallback is retryable unless the other address family succeeds", async () => {
  for (const validIPv6 of [false, true]) {
    const dns = dnsMock({
      A: { Status: 2 },
      AAAA: validIPv6 ? { Status: 0, Answer: [{ type: 28, data: "2001:db8::1" }] } : { Status: 0 },
    });
    assert.equal(await checkMailDomain("example.com", dns.fetch), validIPv6 ? "valid" : "unavailable");
  }
});

test("slow DNS lookup is aborted after four seconds", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const checking = checkMailDomain("example.com", async (_url, { signal }) => {
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Timeout"))));
  });
  t.mock.timers.tick(4000);
  assert.equal(await checking, "unavailable");
});
