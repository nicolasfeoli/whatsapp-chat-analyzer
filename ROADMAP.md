# Review and roadmap

Review of `index.html` as of 2026-10-05. The parser and analysis code were run in Node against synthetic exports in several formats, and the page was rendered in headless Firefox. It has not been tested against real exports from every platform, so the format notes below come from synthetic lines that follow the known export layouts.

## Verdict

The page works, renders correctly, and the core design is sound: no backend, no storage, all untrusted text is HTML-escaped before it reaches the DOM. No XSS path was found. It is not ready to be public yet, mainly because of one crash on large chats, a few iPhone parsing gaps, and third-party requests that weaken the "never uploaded" promise.

## Bugs found

Ordered by how much they matter.

1. **Crash on large chats.** `Math.max(...recs.map(...))` in `parseChat` spreads one argument per message. At about 125,000 messages Chrome and Node throw "Maximum call stack size exceeded"; Safari's limit is lower (about 65,000). Confirmed: 70,000 messages parse, 130,000 throw. Long-running couple and group chats reach this. Fix: replace with a loop.
2. **iPhone deleted messages are never counted.** iOS prefixes them with an invisible left-to-right mark, and the parser discards any line with that mark before checking whether it is a deleted message. The Deleted column is always 0 for iPhone exports. The same rule silently drops iOS locations, polls and contact cards.
3. **Reply times on Android show "1 s".** Android exports have minute resolution, so replies within the same minute have a gap of 0, which is displayed as "1 s". Should read "under 1 min", and the two platforms should not be presented with the same precision.
4. **Wrong `.txt` picked from a zip.** The code takes the first `.txt` in the archive. An export "with media" can contain other `.txt` attachments. Prefer `_chat.txt` or `WhatsApp Chat with *.txt`, then fall back to the largest.
5. **People whose name contains certain words vanish.** Any sender name containing "left", "added", "joined", "changed", "removed", "created", "deleted" (or the Spanish equivalents) is treated as a system message. A contact saved as "Left Shark" disappears.
6. **Quoted chat text creates phantom participants.** A message that contains a pasted line in export format starts a new message from a new "person". Mitigation: reject a timestamp that jumps backwards relative to both neighbours.
7. **Ambiguous dates default to day/month.** When every day and month is 12 or lower and both readings are in order, the code picks day/month. A US user gets a wrong timeline until they find the Switch link. Tie-break with `navigator.language`.
8. **Impossible dates roll over silently.** 31/02 becomes 2 March instead of being rejected.
9. **Only English and Spanish markers are recognised.** In German or Portuguese exports, "media omitted" and "message deleted" lines count as normal text and pollute the word list ("medien", "ausgeschlossen"). Non-Latin digits (Arabic, Persian, Hindi) give "No messages found".
10. **Smaller counting errors.** Keycap emojis (1️⃣) and subdivision flags are not counted. Android `null` and `POLL:` lines count as text. The insight uses a 5-reply minimum while the chart uses 3. A participant literally named "Others" collides with the grouped series.
11. **Markup.** `<title>`, `<link>` and `<style>` sit inside `<body>`; no `lang` attribute; the wrapper declares `color-scheme: light` while the page supports dark. Browsers tolerate it, validators do not.

## Risks of running it publicly

### Privacy and trust

- **Third-party script without integrity check.** JSZip loads from cdnjs with no `integrity` attribute. Whoever can change that file can read every chat loaded on the page. Vendor it into the repo or add SRI.
- **Google Fonts request.** Every visitor's IP goes to Google before they do anything. It undercuts the privacy pitch and has drawn GDPR complaints in the EU. Self-host the fonts or use system fonts.
- **The promise is not enforced.** "Never uploaded" is true today but only by convention. A Content-Security-Policy with `connect-src 'none'` makes the browser enforce it, and lets visitors verify it.
- **Future additions can break it by accident.** Analytics, error reporters such as Sentry, session replay, and "AI summary" features all tend to capture page content. Each would ship private messages to a third party.
- **Other people's data.** A chat contains messages from people who did not agree to analysis. With no server you are not processing it, and that must stay true.
- **Screenshots.** The page shows real names and two full messages (first and longest). Users will share screenshots. There is no way to hide names or message text.
- **Hosting account is the trust root.** A compromised GitHub account or an expired custom domain lets an attacker serve a version that exfiltrates chats. Use 2FA, and keep the domain on auto-renew.

### Legal

- **Trademark.** Meta's brand rules do not allow "WhatsApp" in a product name or domain in a way that suggests affiliation, and domains containing it do get takedown notices. Use a neutral name with "for WhatsApp" as a descriptor, keep the disclaimer, and do not use the logo or the brand green.
- **No licence file.** Without one, nobody may legally reuse the code. Pick one (MIT is the usual choice for this kind of project).

### Product

- **Wrong numbers look authoritative.** A partly parsed file still produces a confident dashboard. There is no "parsed N of M lines" indicator, so users cannot tell.
- **Interpersonal harm.** "Who replies slower" and "who starts conversations" are rough heuristics that will be used in arguments. State the method next to the number and keep the tone light.
- **Self-inflicted denial of service.** A huge or malicious zip is fully decompressed into memory and parsed on the main thread; the tab freezes or dies. Only the user is affected.
- **Cost and abuse.** None. Static hosting, no backend, no accounts, nothing to scrape or spam.

## Improvements

### Before going public

- Fix bugs 1 to 4.
- Vendor JSZip and fonts; add a CSP meta tag (`default-src 'self'; connect-src 'none'`; hashes for inline script and style, or split them into files).
- Add a visible parse report: lines read, messages parsed, lines skipped, detected platform and date order.
- Add a "not affiliated" line and a short privacy note in the footer with a link to the source.
- Add a licence, `lang`, meta description, favicon, and Open Graph tags; move head elements into `<head>`.
- Cap input size with a clear message, and parse in a Web Worker with a progress indicator.

### Correctness and robustness

- Split parser, analysis and rendering into modules with a test suite and invented fixtures per platform and locale.
- Table-driven locale packs for system, media and deleted markers (start with PT, DE, FR, IT).
- Normalise non-Latin digits before matching.
- Handle iOS left-to-right-mark lines by type instead of dropping them all.
- Let the user merge participants (renamed contacts, number versus saved name) and exclude one.
- Report edited-message counts; they are already detected and then thrown away.
- Use `Intl.Segmenter` for emoji and for word splitting in languages without spaces.
- Drop the retained raw text after parsing to halve memory use.

### Features

- Date range filter and per-person filter that update every chart.
- Shareable summary card rendered to an image, with an anonymise toggle (Person A, Person B) and message text hidden by default.
- "Wrapped"-style year recap view.
- Per-person heatmaps; who is active at which hours.
- Reply-time distribution rather than a single median; "left on read" longest waits.
- Who-replies-to-whom matrix for groups.
- Media breakdown by type (photos, voice notes, stickers), and most shared link domains.
- Emoji and word trends over time; first use of a word.
- Double-texting, monologue records, most active single hour.
- Install as a PWA with offline support, plus an Android share target so "Export chat" can send straight to the app.
- Spanish UI with a language toggle.
- Export the computed statistics as JSON or CSV.
- Optional on-device sentiment or topic grouping. Only if it runs fully in the browser; never through a hosted API.

### Accessibility and polish

- Heatmap cells and timeline bars are hover-only: add keyboard focus, `aria-label`s, and a data table alternative.
- Tooltips on touch devices need tap-to-pin.
- Heatmap relies on colour alone; print the value on hover is not enough for screen readers.
- Manual light and dark toggle (the CSS already supports `data-theme`).
- Loading state for big files; clearer error when a zip has no chat inside.

### Project hygiene

- GitHub Actions: run tests, validate HTML, deploy to Pages.
- Dependabot or a pinned-hash check for vendored libraries.
- Issue templates that warn against attaching real chats.
- A `SECURITY.md` with a contact address.
