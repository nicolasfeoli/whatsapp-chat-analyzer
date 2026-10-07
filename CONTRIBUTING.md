# Contributing

## The one rule that is not about code

**Never commit, attach or paste a real chat.** An export holds messages from people who did not agree to share them, and a public repository cannot take them back.

- Test data is invented, line by line. The builders in `tests/fixtures/` exist so that a test states only the part of a line it is about.
- Bug reports reproduce the problem with two or three invented lines that keep the layout of the real ones (date, time, punctuation). The issue template asks for this.
- `.gitignore` blocks `*.zip`, `_chat.txt` and the usual export filenames. It is a safety net, so still read `git status` before every commit.
- Keep your own exports outside the repository folder.

## Setup

Node 22 or newer.

```sh
npm install
npm run dev      # Vite dev server with hot reload
```

Before opening a pull request:

```sh
npm run check
```

It runs, in order, the type check, ESLint, the Prettier check, the tests with coverage thresholds and the production build. CI runs the same command on Node 22 and 24. The individual steps are `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:coverage` and `npm run build`; `npm run format` rewrites files in place and `npm run test:watch` reruns tests as you edit.

## Where code goes

- `src/core/` has no DOM and no browser globals. It runs in the page, in the worker and in Node tests, so anything that touches `document` or `window` belongs in `src/ui/`. `tsconfig.core.json` compiles the core without the DOM library and ESLint forbids it the browser's globals, so a slip fails `npm run check`.
- `src/core/types.ts` holds the shared types. Analysis results cross the worker boundary by structured clone, so they are plain data: `Map` and `Date` are fine, class instances and functions are not.
- `src/ui/sections/` has one module per section of the report, and `src/ui/charts/` one per chart.
- `src/ui/main.ts` only gathers what the page needs from the real browser. What the page does lives in `src/ui/page-controller.ts`, which receives all of it as parameters, so nothing else runs on import.
- Every piece of text that comes from a chat (names, messages, the file title) goes through `escapeHtml` in `src/ui/html.ts` before it reaches the DOM. Markup is built with the `` html`...` `` tag from the same module and has the type `SafeHtml`; the tag's placeholders do not accept a plain string, so forgetting to escape is a compile error. Put markup on the page with `setInnerHtml`, not by assigning to `innerHTML`.
- Class names, ids and `data-` attributes are whole words (`heatmap-cell`, `data-bucket-index`). A name that TypeScript reads back or toggles is a named constant next to the renderer that emits it.
- `index.html` carries the Content-Security-Policy. `connect-src` stays `'none'`; a feature that needs the network does not belong in this project.

## Code style

ESLint and the compiler enforce the first group. The second group is on the author and the reviewer.

Enforced:

- Strict TypeScript with the extra flags in `tsconfig.base.json`.
- Explicit return types on functions and explicit types on everything a module exports.
- No `any`, no non-null assertions, no `@ts-ignore`.
- `switch` statements over a union handle every member.
- Identifiers have at least three characters. The exceptions are `i` and `j` for loop indices and `x` and `y` for coordinates.
- No nested ternaries, one variable per declaration, braces around every block, `===` only, no reassigned parameters.
- Prettier formatting (100 columns, single quotes). Formatting of embedded languages is switched off, because Prettier would otherwise re-indent the markup inside `` html`...` `` templates and change the strings the page renders.

By convention:

- Names are whole words that say what the value is: `messages`, not `msgs`; `currentStreak`, not `cur`.
- Functions are small and do one thing. Prefer an early return and a named intermediate value to a dense expression.
- Every number with a meaning is a named constant with a comment saying why it has that value, for example `LARGEST_ZIP_FILE_IN_BYTES`.
- Every exported symbol has a TSDoc comment. Every regular expression that is not obvious has a comment showing the export line it matches and why it is written that way.
- Message kinds and worker messages are discriminated unions. Data that is not mutated is `readonly`.
- Prose uses British spelling: analyse, colour, licence.

## Tests

- `tests/` mirrors `src/`: the tests for `src/core/parsing/date-order.ts` are in `tests/core/parsing/date-order.test.ts`.
- Tests run in Node by default. A file that needs a DOM opts in with `// @vitest-environment jsdom` on its first line.
- A `describe` block names the function or the situation; an `it` title is a sentence about behaviour, such as "returns null when there is nothing to read".
- Build chat lines with the helpers in `tests/fixtures/` instead of long string literals, and give test numbers a named constant when the number is the point of the test.
- Every test arranges what it needs and can be run on its own (`npx vitest run path -t "title"`). Tests of the page start a fresh page each, through `startPage` with a window of their own.
- A test of a threshold has a case on each side of it, with the arithmetic in a comment. "Does nothing" is asserted by what did not happen (`not.toHaveBeenCalled()`), not only by the absence of an exception.
- A bug fix comes with a test that fails without it.
- `tests/core/known-limits.test.ts` pins inputs the parser is known to get wrong, each listed under "Known limits" in [ROADMAP.md](ROADMAP.md). If you fix one, change its test on purpose, move it to the suite of the module that now handles it, and remove the line from the roadmap.
- Results must not depend on the machine's time zone. Tests that are about a time zone set `TZ` themselves and restore it.
- Coverage thresholds are 90% for `src/core`, 85% for `src/ui` and 85% for `src/worker`, each measured on its own. The report is written to `coverage/`.

## Behaviour changes

The numbers and wording the page shows are pinned by tests. A change to either is welcome when it is deliberate: say so in the pull request, update the tests that pin it, and update the README screenshots in `docs/` if the first screen of the example chat looks different.
