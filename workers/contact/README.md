# Kontaktformular

Die Website bleibt statisch auf GitHub Pages. Das deutsche und englische Formular
senden JSON per HTTPS an einen separaten Cloudflare Worker:

`https://realityforge-foerderungen-contact.realityforgeeu.workers.dev/`

## Versand

- Empfänger: `realityforgeeu@gmail.com` (in Cloudflare verifiziert).
- Absender: `foerdercheck@kontakt.realityforge.eu`.
- Reply-To: die validierte E-Mail-Adresse aus dem Formular. Antworten im
  Mailprogramm gehen damit direkt an die anfragende Person.
- Nach erfolgreichem internen Versand geht eine kurze Eingangsbestätigung an die
  validierte Formularadresse. Sie bedankt sich für das Interesse und nennt eine
  übliche Antwortzeit von 48 Stunden. Antworten darauf gehen an das Team-Postfach.
  Die vorhandene englische Seite erhält die entsprechende englische Bestätigung.
- Bestätigungen verwenden eine separate `CONFIRMATION_EMAIL`-Bindung, denselben
  festgelegten Absender, ausschließlich festen Plain-Text und Auto-Submitted-
  Header. Keine eingegebenen Namen, Nachrichten oder Links werden zurückgespiegelt.
  So kann der öffentliche Endpunkt keine frei formulierten E-Mails weiterleiten.
- Ein Fehler beim Bestätigungsversand ändert eine bereits zugestellte interne
  Anfrage nicht in einen Fehler. Das Frontend meldet die erfolgreiche Anfrage,
  behauptet aber nur bei akzeptiertem Bestätigungsversand, dass eine Bestätigung
  versendet wurde. Provider-Annahme ist keine Garantie für die Postfachzustellung.
- Cloudflare Email Sending ist ausschließlich für `kontakt.realityforge.eu`
  aktiviert. Die zugehörigen SPF-, DKIM-, DMARC- und Bounce-Einträge werden von
  Cloudflare verwaltet. Die Website-DNS-Einträge und eingehende E-Mails der
  Hauptdomain bleiben unverändert.
- Die Email-Preview-Funktion für die Versanddomain ist deaktiviert. Der Worker
  schreibt weder Formularinhalte noch IP-Adressen in eigene Logs oder Datenbanken.
  Cloudflare verarbeitet die Daten für den Transport; die zugestellte Anfrage
  liegt anschließend im Gmail-Postfach. Der Hinweis am Formular benennt diesen Weg.

## Schutz und Verhalten

- Nur POST mit JSON; CORS ausschließlich für `https://foerderungen.realityforge.eu`.
  CORS ist kein Bot-Schutz, weil Nicht-Browser-Clients den Origin-Header nachbauen können.
- Fester interner Empfänger und eingeschränkte E-Mail-Bindung, Plain-Text-Nachricht
  und serverseitige Längen-/Formatprüfung.
- E-Mail-Prüfung vor dem Versand: übliches unquoted Mailbox-Format (keine SMTPUTF8-
  Localparts), Längen und Domainlabels; internationale Domains werden für Reply-To
  in ASCII/Punycode normalisiert. Cloudflare DNS-over-HTTPS erhält nur die Domain.
  MX wird zuerst geprüft; ohne MX sind A/AAAA als implizite Mailroute zulässig.
  NXDOMAIN, Null-MX und Domains ohne Mailroute werden abgewiesen. DNS-Ausfälle und
  Zeitüberschreitungen (maximal 4 Sekunden) erzeugen eine gesonderte, wiederholbare
  Fehlermeldung, ohne die Anfrage zu versenden oder Eingaben zu löschen.
  Diese Prüfung bestätigt weder die Existenz noch den Besitz eines konkreten
  Postfachs. Die Eingangsbestätigung ist kein Double-Opt-in und keine zusätzliche
  Postfachprüfung. Es gibt keine SMTP-Postfachabfrage.
- Cloudflare Turnstile im Managed-Modus, nur für `foerderungen.realityforge.eu`.
  Das Widget wird nur sichtbar, falls eine Interaktion erforderlich ist. Das
  Backend prüft Token, Hostname und Aktion `contact` vor dem Versand; Tokens sind
  einmalig und werden nach jedem Sendeversuch im Frontend erneuert. Der geheime
  Schlüssel liegt ausschließlich im Worker-Secret `TURNSTILE_SECRET_KEY`.
- Kompatibilität mit alten gecachten Seiten: Anfragen ohne das neue Token-Feld
  werden weiterhin ausschließlich intern zugestellt, niemals automatisch extern
  beantwortet. Ein vorhandenes, aber ungültiges Token führt zur Ablehnung.
- Verstecktes Honeypot-Feld; höchstens 3 Versuche pro IP und Minute sowie
  30 validierte Anfragen pro Minute **je Cloudflare-Standort**. Cloudflares
  Rate-Limiter ist eventual-consistent, kein globales hartes Kontingent.
- Zusätzlich höchstens eine Bestätigung pro Empfänger und Minute je Standort,
  mit einem SHA-256-Hash statt einer Klartextadresse als Limiter-Key. Großschreibung,
  Plus-Aliasse und Gmail-Punktaliase werden zusammengefasst. Kein hartes Tageslimit.
- Maximal 24.000 Bytes Request-Body und 5.000 Zeichen Nachricht.
- Keine automatische Wiederholung bei Netzwerkfehlern. Eingaben bleiben bei
  Fehlern erhalten; nur eine bestätigte erfolgreiche Übermittlung leert das Formular.
- Der Submit-Button bleibt ohne JavaScript deaktiviert; ein E-Mail-Link steht als
  Alternative bereit. Während des Versands sind doppelte Klicks gesperrt.

## Test und Veröffentlichung

Vom Repository-Root, mit Node.js und einer autorisierten Wrangler-Anmeldung:

```sh
node --test workers/contact/contact.test.mjs workers/contact/email-validation.test.mjs workers/contact/frontend.test.mjs workers/contact/confirmation.test.mjs
node --check script.js
git diff --check
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc --dry-run
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc
```

Die Tests verwenden gemockte Cloudflare-Bindungen und versenden keine E-Mails.
Sie decken Bestätigungstexte, beide Versandwege, deren Fehlerfälle, Empfängerlimits,
Turnstile-Ablehnung und gecachte Seiten ohne Bestätigung ab.
Auch die DNS-Antworten sind in diesen Tests gemockt. Neue Netzwerklogik zusätzlich
in der echten Workers-Laufzeit prüfen, bevor sie produktiv geschaltet wird:

```sh
npx --yes wrangler@4.136.3 dev --remote --config workers/contact/wrangler.jsonc --port 8787
```

Diese isolierte Vorschau ersetzt den produktiven Worker nicht. Test-POSTs an
`http://127.0.0.1:8787/` brauchen den produktiven Origin-Header und den gleichen
JSON-Body wie das Formular. `test@form-check.invalid` und `test@example.com`
sollen `400 / email_domain` liefern, ohne eine Nachricht zu verschicken.
Die Vorschau nutzt echte E-Mail-Bindungen: erfolgreiche Tests ausschließlich an
das eigene, fest konfigurierte Postfach und als technische Tests kennzeichnen.

Ein echter Zustelltest erfolgt über das produktive Formular mit klar als Test
gekennzeichneten Angaben. Erfolg im Browser und Eingang im Postfach prüfen.

Lokale Browser-Aufrufe an den produktiven Worker werden absichtlich wegen ihres
abweichenden Origins abgewiesen. Das erlaubt auch die Prüfung der Fehlermeldung,
ohne eine E-Mail zu senden. Die Produktions-Origin-Allowlist nicht für lokale Tests
aufweichen.

Backend zuerst veröffentlichen und prüfen, danach Frontend über den bestehenden
GitHub-Pages-Branch `main`. Keine API-Tokens oder sonstigen Zugangsdaten ins Repo
eintragen; Wrangler verwendet die bestehende lokale Anmeldung.

## Betrieb und Kosten

Turnstile nutzt den kostenlosen Tarif. Email Sending nutzt den vorhandenen
Workers-Paid-Tarif: derzeit 3.000 ausgehende E-Mails pro Monat enthalten, danach
0,35 USD je 1.000 E-Mails. Bestätigungen an nicht verifizierte Besucheradressen
zählen in dieses Kontingent; der interne Versand an die verifizierte Gmail-Adresse
bleibt kostenfrei. Keine Tarifänderung wird für diese Funktion vorgenommen.
Kontingent und Zustellfehler im Cloudflare-Email-Sending-Dashboard beobachten.

- https://developers.cloudflare.com/email-service/platform/pricing/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
