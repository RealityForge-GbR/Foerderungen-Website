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
node --test workers/contact/contact.test.mjs workers/contact/frontend.test.mjs
node --check script.js
git diff --check
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc --dry-run
npx --yes wrangler@4.136.3 deploy --config workers/contact/wrangler.jsonc
```

Die Tests verwenden gemockte Cloudflare-Bindungen und versenden keine E-Mails.
Ein echter Zustelltest erfolgt über das produktive Formular mit klar als Test
gekennzeichneten Angaben. Erfolg im Browser und Eingang im Postfach prüfen.

Lokale Browser-Aufrufe an den produktiven Worker werden absichtlich wegen ihres
abweichenden Origins abgewiesen. Das erlaubt auch die Prüfung der Fehlermeldung,
ohne eine E-Mail zu senden. Die Produktions-Origin-Allowlist nicht für lokale Tests
aufweichen.

Backend zuerst veröffentlichen und prüfen, danach Frontend über den bestehenden
GitHub-Pages-Branch `main`. Keine API-Tokens oder sonstigen Zugangsdaten ins Repo
eintragen; Wrangler verwendet die bestehende lokale Anmeldung.
