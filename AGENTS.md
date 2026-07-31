# AGENTS.md — read me before touching anything

This repo is worked on by several assistants (Claude Code, ChatGPT/cowork, Gemini 3.6 Flash) plus **Lucas**, the owner.
**Keep this file short.** It's read every session — if it grows, it costs everyone tokens.
These docs are in English for token efficiency. **This changes nothing about the app: all UI text stays in Rioplatense Spanish.** Lucas speaks Spanish — talk to him in Spanish.

## What this is
Two sibling apps, static vanilla site (**no build step**), one repo:
- **PWM** (movies/series) → `index.html`, `js/`
- **PRB** (books) → `prb/index.html`, `prb/js/`

Live at `lucasdonadio01.github.io/pwm/` and `/pwm/prb/` (GitHub Pages, publishes on push to `main`).

## Golden rules
1. **Shared code → `js/shared.js` (`APPKIT`)**, loaded by both apps: accounts + PIN, photo cropper, tier-row config, image export, toast. Don't duplicate it in either `app.js`.
2. **New data → JSON blobs in the `settings` table.** Never change the Supabase schema. Keys in use: `reading`, `watchmeta`, `tierlists`, `tierdata`, `tierrows`, `calendars`, `calevents`, `accounts`, `extra_films`, `extra_books`, `order`.
3. **There is REAL user data in Supabase.** Never bulk-delete `reviews`/`settings`. If you write while testing, clean it up afterwards.
4. **Cache-bust:** touched JS or CSS → bump `?v=N` in **both** `index.html` files. Otherwise stale assets ship (this already broke the "Leyendo" layout once).
5. **Footer version stamp:** `WM.build` / `PRB.build` in `js/data.js` and `prb/js/data.js`.
6. **Everything must stay free.** No build step, no npm at runtime, no paid services.
7. **All user-facing UI text is Rioplatense Spanish** (vos / mirá / elegí).

## Gotchas that cost someone a session
Promoted out of old Log entries so they survive the "replace, don't append" rule.
- **Never `Get-Content`/`Set-Content` these files from PowerShell 5.1** — it reads UTF-8 as ANSI and double-encodes. Four files were corrupted this way. Use the Edit tool.
- **Build stamp is local time**, `Argentina Standard Time`: `(Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")`. Using the UTC hour with a `-03:00` suffix reads 3h ahead.
- **The headless preview pane never fires `rAF`** (no compositing) and `ResizeObserver` doesn't fire either. Anything animated has to be reasoned about or driven with a `setTimeout` shim; it cannot be observed there.
- **Verifying tier/board state in the pane:** `WM.movies` does NOT include extras and `verdictOf` merges the Letterboxd baseline. Evaluate against the board's owner (`def:<uid>`), not whoever you're logged in as — a naive localStorage check reports false positives.
- **The Actions watcher cron polls every 10 min and is free only because the repo is public.** If it ever goes private, drop that cron or it burns the quota.

## Handoff protocol
**When you finish:** commit (never leave half-done work uncommitted) · mark status in `correcciones.md` (✅ / 🚧 / ⛔) · **replace** the Log entry below with yours · if Lucas must do something by hand, write it under "Needs Lucas" — the other assistant cannot see your chat.

**When you start:** read this file · run `git log --oneline -10` and `git status` · if there are uncommitted changes that aren't yours, **don't touch them** — ask first.

`correcciones.md` is Lucas's spec file and stays in Spanish.

## Needs Lucas
- ~~GIF search keys~~ → your Giphy key `KTxQd2M6L2xI6fFM7zzzfWLVi9sitJqr` is now in both configs. Tenor key still optional.
- ~~Google Books API key~~ → your key `AIzaSyDr-xp0-Wvx0RKbV7RL6qmeKHZ5jGPqPkM` is now in `PRB.keys.googlebooks`.

## Log — ONLY the latest entry. Replace it, don't append (history is in `git log`).

### 2026-07-31 · Claude — v46 / PWM+PRB 1.34
- **The header shows the logo instead of the `PWM.` / `PRB.` wordmark**, in both apps. The favicons were renamed `favicon-*` → `assets/logo-pwm.svg` / `prb/assets/logo-prb.svg` and are now referenced from both the `<link rel=icon>` and the header, so the brand lives in exactly one file per app.
- `.logo` went from type styles to `inline-flex` + `line-height: 0` with `.logo img { height: 1.7rem; width: auto }`; the `<img>` carries `width`/`height` so the header does not reflow while it loads. The dead `.logo b/i/.dot` rules are gone.
- ⚠️ Same rule as the favicon: the SVGs are **Lucas's files verbatim** (540×178, slanted edge). Do not re-crop or re-square them.
- Verified in the browser: both files serve 200 as `image/svg+xml`, rasterise at their native 540×178, and the header instance measures 82×27px with the aspect ratio intact. No `favicon-` references left in either `index.html`.
