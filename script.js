document.documentElement.classList.add("js");

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
    themeToggle.setAttribute("aria-pressed", String(!isDark));
    themeToggle.setAttribute("aria-label", isDark ? "Light Mode aktivieren" : "Dark Mode aktivieren");
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

const form = document.querySelector(".contact-form");

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const recipient = form.dataset.recipient;
    const name = data.get("name");
    const startup = data.get("startup") || "Nicht angegeben";
    const phase = data.get("phase") || "Nicht angegeben";
    const email = data.get("email");
    const message = data.get("message");
    const subject = `Fördercheck-Anfrage von ${name}${startup !== "Nicht angegeben" ? ` · ${startup}` : ""}`;
    const body = [
      `Name: ${name}`,
      `E-Mail: ${email}`,
      `Startup / Projekt: ${startup}`,
      `Phase: ${phase}`,
      "",
      "Vorhaben:",
      message,
    ].join("\n");

    const status = form.querySelector(".form-status");
    status.textContent = "Euer E-Mail-Programm wird geöffnet …";
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
