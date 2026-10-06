# Review and roadmap

Review of `index.html` as of 2026-10-05. The parser and analysis code were run in Node against synthetic exports in several formats, and the page was rendered in headless Firefox. It has not been tested against real exports from every platform, so the format notes below come from synthetic lines that follow the known export layouts.

## Verdict

The page works, renders correctly, and the core design is sound: no backend, no storage, all untrusted text is HTML-escaped before it reaches the DOM. No XSS path was found. The bugs from the first review are fixed (below). What still stands between this and a public launch is in "Before going public".

## Fixed on 2026-10-05

Each fix has a test in `test/parser.test.js` (run `node --test`), and the page was checked against one real iPhone en-US export.

1. **Crash on large chats.** The spread into `Math.max` is now a loop. Tested with 400,000 messages.
2. **iPhone deleted messages, locations and polls.** Lines carrying the left-to-right mark are now classified by type instead of all being dropped. System notices are still dropped.
3. **Reply times on Android.** Minute-resolution exports are detected; a same-minute reply reads "under 1 min" and the chart says times are rounded.
4. **Wrong `.txt` picked from a zip.** Prefers `_chat.txt`, then a file with "WhatsApp" in its name, then a top-level `.txt`.
5. **People named like system verbs.** "Left Shark" is kept; "Bob changed the group name to ..." is still dropped.
6. **Pasted chat lines.** A sender who only appears in short runs that jump back in time is folded into the message the lines were pasted in. Pasted lines from real participants still count as their messages; see the comment on `foldQuoted` for why.
7. **Ambiguous dates.** With both readings in order, the shorter overall span wins, then the browser region. The manual switch remains.
8. **Impossible dates** such as 31/02 are rejected.
9. **Other languages.** Android placeholders are recognised in any language. Deleted, attachment, poll and location markers were added for Portuguese, German, French and Italian. Arabic, Persian and Devanagari digits and Arabic am/pm are read. These strings come from memory of the export formats and have not been checked against real exports in those languages.
10. **Counting.** Keycap emojis and subdivision flags are counted; Android `null` lines count as media; the reply insight and chart share one threshold; a participant named "Others" no longer collides with the grouped series.
11. **Markup.** Proper `<head>`, `lang`, meta description.
12. **Third-party requests.** JSZip and the fonts are vendored under `vendor/`. The page now makes no request to any other server.

## Known limits

- Pasted chat lines from a real participant are counted as extra messages from them.
- iPhone system or media lines in a language without a marker table are dropped rather than counted.
- A message that only says something like `<lol>` is counted as media.
- Only Latin and Latin Extended font subsets are vendored.

## Risks of running it publicly

### Privacy and trust

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

- Add a CSP meta tag (`default-src 'self'; connect-src 'none'`; hashes for inline script and style, or split them into files).
- Add a visible parse report: lines read, messages parsed, lines skipped, detected platform and date order.
- Add a short privacy note in the footer with a link to the source.
- Add a licence, favicon, and Open Graph tags.
- Cap input size with a clear message, and parse in a Web Worker with a progress indicator.

### Correctness and robustness

- Split parser, analysis and rendering into modules.
- Verify the PT, DE, FR and IT markers against real exports, and move them into table-driven locale packs.
- Fold pasted chat lines from real participants without breaking time-zone changes.
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
