// Common mailbox syntax, matching the unquoted addresses accepted by the form.
// Quoted local parts and SMTPUTF8 local parts are intentionally not supported.
export function parseEmail(address) {
  if (typeof address !== "string" || address.length > 254) return null;
  const parts = address.split("@");
  if (parts.length !== 2) return null;
  const [local, rawDomain] = parts;
  if (!local || local.length > 64 ||
      !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)) {
    return null;
  }
  // Only domain characters, never a URL/path, credentials, port or IP literal.
  if (!rawDomain || /[^\p{L}\p{M}\p{N}.-]/u.test(rawDomain)) return null;
  let domain;
  try {
    domain = new URL(`https://${rawDomain}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const labels = domain.split(".");
  if (domain.length > 253 || labels.length < 2 || !/[a-z]/i.test(labels.at(-1)) ||
      labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    return null;
  }
  const normalized = `${local}@${domain}`;
  return normalized.length <= 254 ? { address: normalized, domain } : null;
}

// This checks domain mail routing, never the existence/ownership of a mailbox.
// Only the domain is sent to Cloudflare DNS, not the address or form contents.
export async function checkMailDomain(domain, fetchDns = (url, options) => fetch(url, options)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  async function lookup(type) {
    const url = new URL("https://cloudflare-dns.com/dns-query");
    url.searchParams.set("name", domain);
    url.searchParams.set("type", type);
    const response = await fetchDns(url.toString(), {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
      // Workers supports only "follow"/"manual"; reject redirects via !ok below.
      redirect: "manual",
    });
    if (!response.ok) throw new Error("DNS unavailable");
    const result = await response.json();
    if (!result || result.TC || ![0, 3].includes(result.Status) ||
        (result.Answer !== undefined && !Array.isArray(result.Answer))) {
      throw new Error("DNS unavailable");
    }
    return result;
  }
  try {
    const mx = await lookup("MX");
    if (mx.Status === 3) return "invalid"; // NXDOMAIN
    const records = (mx.Answer || []).filter(record => record.type === 15);
    if (records.length) {
      const exchanges = records.map(record => {
        const match = /^(\d+)\s+(\S+)$/.exec(record.data);
        if (!match || Number(match[1]) > 65535) throw new Error("Invalid DNS response");
        return match[2];
      });
      // A null MX ("0 .") explicitly declares that the domain accepts no mail.
      return exchanges.some(exchange => exchange !== ".") ? "valid" : "invalid";
    }
    // SMTP allows implicit MX via A/AAAA when there is no explicit MX (RFC 5321).
    // Do not reject legitimate small/self-hosted mail domains just for lacking MX.
    const fallback = await Promise.allSettled([lookup("A"), lookup("AAAA")]);
    if (fallback.some(result => result.status === "fulfilled" && result.value.Status === 0 &&
        (result.value.Answer || []).some(record => [1, 28].includes(record.type) && record.data))) {
      return "valid";
    }
    return fallback.some(result => result.status === "rejected") ? "unavailable" : "invalid";
  } catch {
    // Timeouts, SERVFAIL and resolver outages are not evidence of an invalid address.
    return "unavailable";
  } finally {
    clearTimeout(timeout);
  }
}
