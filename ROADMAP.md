# Review and roadmap

Started as a review of a single AI-generated `index.html` on 2026-10-05. The parser is covered by tests with invented chats, the page is checked end to end in headless Firefox, and it has been run against one real iPhone en-US export. Android and other languages are tested only with invented lines that follow the known export layouts.

## Verdict

The page works, renders correctly, and the core design is sound: no backend, no storage, all untrusted text is HTML-escaped before it reaches the DOM. No XSS path was found. The bugs from the first review are fixed and the pre-launch hardening is done (both below). What is left before a public launch is a short list of decisions under "Before going public".

## Fixed on 2026-10-05

Each fix has a test (now under `tests/core`, run `npm test`), and the page was checked against one real iPhone en-US export.

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
12. **Third-party requests.** JSZip and the fonts are served from the site itself. The page now makes no request to any other server.

## Hardening done on 2026-10-05

- **Split into files.** Page shell, styles, a core for parsing and analysis with no DOM access, rendering and loading, and a worker.
- **Content-Security-Policy.** Only the site's own files load; no inline scripts; scripts cannot open connections. Checked in Firefox: no violations with the example chat, a text file, a zip, and a 300,000-message file.
- **Web Worker.** Parsing and analysis run off the main thread, with a status line while they run. The worker keeps the text for the date-order switch, so the page holds no second copy. Falls back to the main thread where workers are refused.
- **Parse report.** After loading, the page states messages read, lines, platform, date order, system notices skipped, and any entries whose date could not be read (with a warning when that is more than 2%).
- **Size caps.** 250 MB of text, 400 MB zip, and the chat inside a zip is checked before unpacking.
- **Privacy note, source link, favicon, Open Graph title and description.**

## Repository housekeeping on 2026-10-06

- MIT licence added.
- Source formatted with Prettier; no behaviour change.
- GitHub Actions runs `npm run check` on Node 22 and 24 for every pull request and every push to `main`.
- Bug report template that asks for invented lines instead of a real chat.
- `CONTRIBUTING.md` with setup, code style and test conventions.
- A Pages workflow that builds and deploys `dist/`. It runs on every push to `main` and can also be started by hand. The repository was made public and the page first deployed on 2026-10-07, to <https://nicolasfeoli.github.io/whatsapp-chat-analyzer/>.

### Rewrite in TypeScript on 2026-10-06

- **Strict TypeScript.** The three JavaScript files (`core.js`, `app.js`, `worker.js`) became small modules under `src/core`, `src/ui` and `src/worker`. Message kinds, analysis results and worker messages are discriminated unions.
- **Same behaviour.** The old implementation was kept as the specification while porting. Parsing and analysis were compared on tens of thousands of generated chats, and the rendered report was compared string for string. The README screenshots were retaken from the built page and came out pixel for pixel the same, so they were left as they were.
- **Tooling.** Vite builds the page, Vitest runs the tests, ESLint (typescript-eslint, strict type-checked) and Prettier keep the style. `npm run check` runs all of it and is what CI runs. The page now has a build step: it is no longer a folder that can be served as it is.
- **JSZip from npm.** It is bundled into the page's own script at build time; the vendored copy is gone. Fonts moved to `public/fonts/`. The built page still requests nothing from another server.
- **Tests for the page.** Section renderers, charts, file loading, the worker client and the real `index.html` are tested in a simulated browser, including a chat made of markup. The suite went from one file of parser tests to 1,809 tests in 59 files, with coverage thresholds of 90% for the core and 85% each for the page and the worker code.
- **Known limits are pinned.** `tests/core/known-limits.test.ts` has tests for the parser limits listed below, so fixing one means changing a test on purpose.
- **Escaping checked by the compiler.** Markup has its own type, `SafeHtml`. Only `escapeHtml` and the `` html`...` `` tag produce it, and the tag does not accept plain strings, so chat text that was never escaped cannot reach `innerHTML`.
- **Whole words in the markup.** Element ids, CSS classes and `data-` attributes were renamed from the old abbreviations (`.c`, `.sw`, `#tip`, `data-v`) to names that say what they are. The stylesheet's declarations did not change, and the rendered report was compared with the old one again after the renaming.
- **A page controller that can be started more than once.** `main.ts` only gathers the browser's services; `page-controller.ts` holds the behaviour and receives them as parameters, so each test starts a page of its own.
- **Licence notices in the build.** The bundler strips the comments that carried the notices of JSZip and the libraries inside it. `public/THIRD-PARTY-LICENCES.txt` restores them and is copied into `dist/`; a test keeps it in step with the installed versions.
- **The core cannot reach the DOM.** `tsconfig.core.json` compiles `src/core` without the DOM library, and ESLint forbids it browser globals and imports from the page.
- **Any thrown object with a message is shown.** As in the JavaScript version, a failure while reading a file shows the `message` of whatever was thrown, also when it is not an `Error` of the page's own realm.

## Known limits

- Pasted chat lines from a real participant are counted as extra messages from them.
- iPhone system or media lines in a language without a marker table are dropped rather than counted.
- A message that only says something like `<lol>` is counted as media.
- A typed message that contains "security code", "missed video call", "end-to-end encrypted" or the Spanish equivalents is dropped as a system notice.
- A contact whose name has a group verb in the middle, such as "Uncle Left Shark", is dropped as a system notice. "Left Shark" is kept.
- "This message was deleted by admin Bob" counts as typed text, because the deleted-message marker must match the whole line.
- The words of a caption are counted only when the caption stands in front of the placeholder, as iPhone writes it. A caption on the lines after an attached file is not counted. A caption never counts as a typed message, a question or a laugh.
- Mentions are read from iPhone exports only. Android writes a mention as `@` and a phone number, which cannot be matched to a name. A mention is matched to a participant by name, so two participants saved under the same name are counted as one.
- Catchphrases are runs of two or three neighbouring words. A phrase that several people share is nobody's catchphrase, however typical of the chat it is.
- "Then and now" compares message counts only, and needs a chat of at least sixty days.
- "Hide names" replaces names and hides message text, and takes the words of the names out of the word lists. Nicknames, the remaining words and the dates are still shown, so a screenshot can still give a chat away to somebody who knows it.
- A typed continuation line that itself starts like a timestamp (`01/01/24 10:00 - breakfast with Bob: yes`) becomes a message from an invented sender.
- A participant whose only messages are dated more than ten minutes before the message above them is folded away as pasted text. A line pasted after a media message is counted as folded but its text is not kept.
- Media is split by type only when the placeholder names it. An Android export made without media writes the same `<Media omitted>` for everything, so its media stays one number. An attached document whose file name contains a word such as "video" is counted under that word.
- A reply is credited to whoever wrote the message just before it, because an export does not record which message a reply quotes. In a busy group, "who answers whom" therefore also counts people who merely wrote next.
- A question counts as unanswered only when its sender's turn closed the conversation. A question the group talked past is not detected, and any message from somebody else counts as an answer.
- Seconds above 59 roll over into the next minute, and "13:00 AM" is read as 01:00, instead of being rejected.
- Year-first dates with a two-digit year are misread: `24/12/31` as 24 December 2031, `45/12/31` as 31 December 1945.
- Forcing a date order that the file contradicts rejects every date and reports "no messages" instead of ignoring the forced order.
- Words are split at a curly apostrophe (`don’t`) and at accents typed as combining characters.
- The legend reads "1 others" for a single extra person, and "Busiest day ... with 1 messages" for a day with one message.
- Only Latin and Latin Extended font subsets are vendored.
- The policy is a `<meta>` tag, so it cannot forbid other sites from framing the page, and it does not cover the worker script itself (which only runs this repo's code). Sending it as an HTTP header would close both; GitHub Pages cannot set headers, Cloudflare Pages and Netlify can.
- Inline `style` attributes are still allowed, because the charts set colours and widths that way.
- The built page cannot be opened straight from disk: the browser refuses its scripts and styles, so it has to be served over HTTP. The main-thread fallback remains for browsers that refuse or lack module workers.
- `npm run dev` relaxes `connect-src` to the dev server's own WebSocket so hot reload works. The file on disk and the production build keep `connect-src 'none'`.
- The status line names the stage but shows no percentage.

## Risks of running it publicly

### Privacy and trust

- **The promise is now enforced for the page, with gaps.** See the policy notes under Known limits.
- **Future additions can break it by accident.** Analytics, error reporters such as Sentry, session replay, and "AI summary" features all tend to capture page content. Each would ship private messages to a third party.
- **Other people's data.** A chat contains messages from people who did not agree to analysis. With no server you are not processing it, and that must stay true.
- **Screenshots.** The page shows real names and two full messages (first and longest), and users will share screenshots. The "Hide names" switch replaces the names with neutral labels and hides message text; it is off by default, and its gaps are listed under Known limits.
- **Hosting account is the trust root.** A compromised GitHub account or an expired custom domain lets an attacker serve a version that exfiltrates chats. Use 2FA, and keep the domain on auto-renew.

### Legal

- **Trademark.** Meta's brand rules do not allow "WhatsApp" in a product name or domain in a way that suggests affiliation, and domains containing it do get takedown notices. Use a neutral name with "for WhatsApp" as a descriptor, keep the disclaimer, and do not use the logo or the brand green.

### Product

- **Wrong numbers look authoritative.** The parse report now says what was read and skipped, but a user can still ignore it.
- **Interpersonal harm.** "Who replies slower", "who starts conversations", "who answers whom" and "whose questions go unanswered" are rough heuristics that will be used in arguments. State the method next to the number and keep the tone light.
- **Self-inflicted denial of service.** Size caps and the worker limit this; a chat just under the caps can still exhaust memory on a phone. Only the user is affected.
- **Cost and abuse.** None. Static hosting, no backend, no accounts, nothing to scrape or spam.

## Improvements

### Before going public

These need a decision rather than more code.

- Decide on the name, given the trademark risk above.
- Decide whether to stay on GitHub Pages. It is live there now; a host that can send headers allows a stricter policy.
- Add a social preview image. (`og:url` is set and the footer links to the public repo.)
- Try it by hand on a real phone, in Chrome and in Safari, with a real Android export.

### Correctness and robustness

- Verify the PT, DE, FR and IT markers against real exports, and move them into table-driven locale packs.
- Fold pasted chat lines from real participants without breaking time-zone changes.
- Let the user merge participants (renamed contacts, number versus saved name) and exclude one.
- Report edited-message counts; they are already detected and then thrown away.
- Use `Intl.Segmenter` for emoji and for word splitting in languages without spaces.
- Real progress percentage while parsing.
- Replace inline style attributes so the policy can drop `unsafe-inline` for styles.

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

- GitHub Actions: validate HTML.
- One smoke test in a real browser (Playwright against `vite preview`): load a `.txt`, check that the report renders with no Content-Security-Policy violation. It is the only way to prove that `worker-src 'self'` and `connect-src 'none'` work together with the real worker; the suite uses stand-ins for `Worker` and for the worker's global scope.
- Dependabot for the npm dependencies.
- A `SECURITY.md` with a contact address.
