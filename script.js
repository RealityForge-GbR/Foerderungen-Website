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
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const recipient = form.dataset.recipient;
    const name = data.get("name");
    const notProvided = isEnglish ? "Not provided" : "Nicht angegeben";
    const startup = data.get("startup") || notProvided;
    const phase = data.get("phase") || notProvided;
    const email = data.get("email");
    const message = data.get("message");
    const subject = isEnglish
      ? `Funding check enquiry from ${name}${startup !== notProvided ? ` · ${startup}` : ""}`
      : `Fördercheck-Anfrage von ${name}${startup !== notProvided ? ` · ${startup}` : ""}`;
    const body = (isEnglish
      ? [
          `Name: ${name}`,
          `Email: ${email}`,
          `Company / project: ${startup}`,
          `Phase: ${phase}`,
          "",
          "Project:",
          message,
        ]
      : [
          `Name: ${name}`,
          `E-Mail: ${email}`,
          `Startup / Projekt: ${startup}`,
          `Phase: ${phase}`,
          "",
          "Vorhaben:",
          message,
        ]).join("\n");

    const status = form.querySelector(".form-status");
    status.textContent = isEnglish
      ? "Your email application is opening …"
      : "Euer E-Mail-Programm wird geöffnet …";
    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
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
