# Fonts

The fonts are kept in the repository so the page loads nothing from other servers.
Vite copies this folder to `dist/fonts/` unchanged, and `fonts.css` refers to the
font files by relative path, so the folder works under any base path.

| Files                         | Source                                                          | Licence                                    |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `bricolage-grotesque-*.woff2` | `@fontsource-variable/bricolage-grotesque` 5.3.0                | SIL OFL 1.1 (`bricolage-grotesque.LICENSE`) |
| `ibm-plex-*.woff2`            | `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` 5.x | SIL OFL 1.1 (`ibm-plex.LICENSE`)           |

Only the Latin and Latin Extended subsets are included. Other scripts fall back to
system fonts.
