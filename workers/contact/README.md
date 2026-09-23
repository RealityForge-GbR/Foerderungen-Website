# Kontaktformular

Die Website bleibt statisch auf GitHub Pages. Das deutsche und englische Formular
senden JSON per HTTPS an einen separaten Cloudflare Worker:

`https://realityforge-foerderungen-contact.realityforgeeu.workers.dev/`

## Versand

- Empfänger: `realityforgeeu@gmail.com` (in Cloudflare verifiziert).
- Absender: `foerdercheck@kontakt.realityforge.eu`.
- Reply-To: die validierte E-Mail-Adresse aus dem Formular. Antworten im
  Mailprogramm gehen damit direkt an die anfragende Person.
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
- Fester Empfänger und eingeschränkte E-Mail-Bindung, keine automatischen Antworten
  an frei wählbare Adressen, Plain-Text-Nachricht und serverseitige Längen-/Formatprüfung.
- E-Mail-Prüfung vor dem Versand: übliches unquoted Mailbox-Format (keine SMTPUTF8-
  Localparts), Längen und Domainlabels; internationale Domains werden für Reply-To
  in ASCII/Punycode normalisiert. Cloudflare DNS-over-HTTPS erhält nur die Domain.
  MX wird zuerst geprüft; ohne MX sind A/AAAA als implizite Mailroute zulässig.
  NXDOMAIN, Null-MX und Domains ohne Mailroute werden abgewiesen. DNS-Ausfälle und
  Zeitüberschreitungen (maximal 4 Sekunden) erzeugen eine gesonderte, wiederholbare
  Fehlermeldung, ohne die Anfrage zu versenden oder Eingaben zu löschen.
  Diese Prüfung bestätigt weder die Existenz noch den Besitz eines konkreten
  Postfachs. Es gibt keine SMTP-Postfachabfrage und keine Bestätigungs-Mail.
- Verstecktes Honeypot-Feld; höchstens 3 Versuche pro IP und Minute sowie
  30 validierte Anfragen pro Minute **je Cloudflare-Standort**. Cloudflares
  Rate-Limiter ist eventual-consistent, kein globales hartes Kontingent.
  Bei gezieltem verteiltem Spam wäre Turnstile eine mögliche zusätzliche Maßnahme.
- Maximal 24.000 Bytes Request-Body und 5.000 Zeichen Nachricht.
- Keine automatische Wiederholung bei Netzwerkfehlern. Eingaben bleiben bei
  Fehlern erhalten; nur eine bestätigte erfolgreiche Übermittlung leert das Formular.
- Der Submit-Button bleibt ohne JavaScript deaktiviert; ein E-Mail-Link steht als
  Alternative bereit. Während des Versands sind doppelte Klicks gesperrt.

## Test und Veröffentlichung

Vom Repository-Root, mit Node.js und einer autorisierten Wrangler-Anmeldung:

```sh
node --test workers/contact/contact.test.mjs workers/contact/email-validation.test.mjs workers/contact/frontend.test.mjs
node --check script.js
git diff --check
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc --dry-run
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc
```

Die Tests verwenden gemockte Cloudflare-Bindungen und versenden keine E-Mails.
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
