document.documentElement.classList.add("js");

const pageLanguage = document.documentElement.lang.toLowerCase();
const isEnglish = pageLanguage.startsWith("en");
const themeToggle = document.querySelector(".theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeStorageKey = "realityforge-theme";

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  themeColor?.setAttribute("content", isDark ? "#090d14" : "#f8f6f2");

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.setAttribute(
      "aria-label",
      isEnglish
        ? isDark ? "Switch to light mode" : "Switch to dark mode"
        : isDark ? "Light Mode aktivieren" : "Dark Mode aktivieren",
    );
  }
}

applyTheme(document.documentElement.dataset.theme || "light");

themeToggle?.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);

  try {
    localStorage.setItem(themeStorageKey, theme);
  } catch (error) {
    // Das Theme bleibt für die aktuelle Sitzung aktiv, auch wenn Speicherung blockiert ist.
  }
});

colorSchemeQuery.addEventListener?.("change", (event) => {
  try {
    if (localStorage.getItem(themeStorageKey)) return;
  } catch (error) {
    // Ohne verfügbaren Speicher folgt die Seite weiterhin der Systemeinstellung.
  }

  applyTheme(event.matches ? "dark" : "light");
});

const languageLinks = document.querySelectorAll("[data-language-link]");

function syncLanguageLinks() {
  languageLinks.forEach((link) => {
    link.setAttribute("href", `${link.dataset.languagePath}${window.location.hash}`);
  });
}

syncLanguageLinks();
window.addEventListener("hashchange", syncLanguageLinks);

const form = document.querySelector(".contact-form");

if (form) {
  const submitButton = form.querySelector('[type="submit"]');
  const submitLabel = submitButton.querySelector(".submit-label") || submitButton;
  const idleLabel = submitLabel.textContent;
  const status = form.querySelector(".form-status");
  // Also tolerate an older cached HTML page loading the updated shared script.
  const endpoint = form.getAttribute("action") || "https://realityforge-foerderungen-contact.realityforgeeu.workers.dev/";
  const copy = isEnglish ? {
    sending: "Sending …",
    success: "Your enquiry has been submitted. We will get back to you by email.",
    invalid: "Please check your entries. Name, a valid email address and a message are required.",
    limited: "Too many attempts. Please wait a minute before trying again. Your entries have been kept.",
    error: "Sending could not be confirmed. Your entries have been kept. Please try again later or email us directly at realityforgeeu@gmail.com.",
    required: "Please fill in this field.",
  } : {
    sending: "Wird gesendet …",
    success: "Eure Anfrage wurde übermittelt. Wir melden uns per E-Mail bei euch.",
    invalid: "Bitte prüft eure Angaben. Name, eine gültige E-Mail-Adresse und eine Nachricht sind erforderlich.",
    limited: "Zu viele Versuche. Bitte wartet eine Minute und versucht es erneut. Eure Eingaben bleiben erhalten.",
    error: "Der Versand konnte nicht bestätigt werden. Eure Eingaben bleiben erhalten. Bitte versucht es später erneut oder schreibt direkt an realityforgeeu@gmail.com.",
    required: "Bitte füllt dieses Feld aus.",
  };
  let sending = false;

  form.querySelectorAll("[required]").forEach((input) => {
    input.addEventListener("input", () => input.setCustomValidity(""));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    form.querySelectorAll("[required]").forEach((input) => {
      input.setCustomValidity(input.value.trim() ? "" : copy.required);
    });
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const payload = { language: isEnglish ? "en" : "de" };
    ["name", "email", "startup", "phase", "message", "website"].forEach((key) => {
      payload[key] = String(data.get(key) || "").trim();
    });
    sending = true;
    submitButton.disabled = true;
    submitLabel.textContent = copy.sending;
    form.setAttribute("aria-busy", "true");
    status.textContent = copy.sending;
    status.dataset.state = "pending";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        status.textContent = response.status === 429 ? copy.limited
          : response.status === 400 || response.status === 413 ? copy.invalid : copy.error;
        status.dataset.state = "error";
      } else {
        form.reset();
        status.textContent = copy.success;
        status.dataset.state = "success";
      }
    } catch {
      status.textContent = copy.error;
      status.dataset.state = "error";
    } finally {
      clearTimeout(timeout);
      sending = false;
      form.removeAttribute("aria-busy");
      submitButton.disabled = false;
      submitLabel.textContent = idleLabel;
      status.focus({ preventScroll: true });
    }
  });
  // Without JavaScript the disabled button prevents form data ending up in a URL.
  submitButton.disabled = false;
}

document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
