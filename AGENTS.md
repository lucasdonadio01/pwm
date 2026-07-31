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

### 2026-07-31 · Claude — v41 / PWM+PRB 1.29
- **Exact scores by typing the number.** Stars still snap to halves; tapping the `.stars-value` number swaps it for a field where you type `3.8`. New `wireScoreEntry` + `halfStep` + `roundScore` in `APPKIT` (rule 1 — the three call sites were near-identical): `mountInteractiveStars`, `mountSwiperStars` (PWM) and `mountStars` (PRB). One decimal, clamped 0–5, comma or dot.
- The field is `type="text"`, **not** `number`, and parses by hand. A number input returns `''` for anything it dislikes, so `4,2` and a typo like `abc` both came back empty and **wiped the rating** — caught in testing. Now empty means "clear" (deliberate) and unparseable means "leave it alone".
- `numEl.dataset.editing` guards the redraw: the stars' `pointerleave` calls `setVisual`, which would overwrite the open field if you swept the mouse over the widget mid-typing.
- **`dist` is now bucketed with `halfStep`** in both `profileStats`, and `openRatingBreakdown` filters the same way. Without it a 3.8 landed in `dist[3.8]`, which `distChart` never reads (it only walks the ten half-star steps) — the title would have silently vanished from "Cómo puntuás".
- ⚠️ The previous Log entry said v39 / 1.27 but committed code was already `?v=40` / 1.28 — the stamp was bumped without replacing the entry. Bumped to `?v=41` / 1.29 from the real state.
- Verified on a local server, **no Supabase writes**: helper driven in isolation through 8 cases (3.8 · `4,2` · `abc` · `7`→5 · `3.84`→3.8 · spaces · Escape · empty→clear) with the exact applied sequence checked; `halfStep` 3.8→4, 3.7→3.5, 4.9→5; both apps boot clean on 1.29 with no console errors. NOT verified: the widget inside a real film/book sheet — that needs a PIN login and a rating write against real user data.
