# WhatsApp Chat Analyzer

A small static site that reads a WhatsApp chat export (`.txt` or `.zip`) and shows who writes most, when the chat is alive, how fast each person replies, and which words and emojis define it.

Everything runs in the browser tab. The export is parsed locally and is not uploaded anywhere; there is no backend.

Not affiliated with, endorsed by, or connected to WhatsApp or Meta.

## Use it

Serve the folder and open it:

```sh
python3 -m http.server 8000
```

Opening `index.html` straight from disk also works in Firefox; other browsers may refuse the worker, in which case the page analyses on the main thread instead.

Then load an export: in WhatsApp open a chat, choose Export chat, pick Without media, and drop the file on the page.

## Layout

| File | What it does |
| --- | --- |
| `index.html` | Page shell and Content-Security-Policy |
| `core.js` | Parsing and analysis; no DOM, shared by page, worker and tests |
| `app.js` | Rendering, file loading, example chat |
| `worker.js` | Runs `core.js` off the main thread |
| `style.css` | Styles |
| `vendor/` | JSZip and fonts, so nothing loads from other servers |

## What it supports today

- Android and iPhone exports, English and Spanish, 12 or 24 hour clocks
- Day/month and month/day dates, with a manual switch when the file is ambiguous
- Portuguese, German, French and Italian on a best-effort basis
- `.zip` exports (JSZip, vendored)

The page loads nothing from other servers; the zip library and fonts live in `vendor/`.

## Tests

```sh
node --test
```

The tests cover `core.js` and use invented chats only.

## Status

The page was generated with AI and then reviewed. Fixed bugs, known limits, risks of hosting it publicly, and planned work are in [ROADMAP.md](ROADMAP.md).

## Contributing test data

Never commit a real chat. `.gitignore` blocks the usual export filenames, but check `git status` before every commit. Test fixtures must be invented.
