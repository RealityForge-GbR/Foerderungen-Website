document.documentElement.classList.add("js");

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
