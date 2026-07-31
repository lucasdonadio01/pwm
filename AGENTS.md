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

### 2026-07-31 · Claude — v42 / PWM+PRB 1.30
- **Letterboxd reviews now sync every 15'.** New `--rss-only` mode in the pipeline: one RSS request per member (no TMDB, no watchlists), surgically rewrites just the `WM.letterboxd` block in `data.js` by text so the rest stays byte-identical, and writes nothing when there are no changes — no change, no commit, no Pages deploy. Third cron in the workflow; the run mode is picked with a `case` on `github.event.schedule`.
- New arrivals push a `review_publish` activity item carrying `via: 'letterboxd'`, so `activityCopy` renders "…publicó una reseña **desde Letterboxd**" with a `sync` icon, in both apps (the notification centre is shared). `--dry-run` prints the items without touching `data.js` or Supabase.
- **RSS never overwrites an existing review.** Its text is a downgrade — it strips the quotation marks the reviews page keeps (caught on Luke's Hunger Games entry). Left unchecked the daily full run and the 15' run would trade that field back and forth, two commits a day, degrading the text each time. Only a genuinely new entry, a changed rating, or a review where there was none counts.
- **The 15' mode also has to CREATE the film.** `WM.movies` only holds watchlist titles; the full run quietly calls `buildFromTmdb` for anything reviewed that nobody has listed (that is why there are 0 orphan baseline entries today). Without the same step a fresh review would land in `WM.letterboxd` with no film to hang off and stay invisible everywhere — nothing iterates the baseline, `profileStats` walks `movies` — until the next daily run. The RSS already carries the TMDB id, so it costs one call. If TMDB fails the review is still recorded and the run warns; the daily refresh picks up the film later.
- `pushActivity` preserves `readBy`/`dismissedBy` on items it already knows. Resetting them meant the daily refresh could resurrect notifications the user had already read.
- ⚠️ **Cron floor is 5 minutes and scheduled runs get delayed under load** — Lucas asked for 1'. Anything shorter than 5' is a number in a file, not latency, and every run that finds something commits + redeploys. 15' is the tradeoff; it is one number in the workflow.
- Verified against the real feeds: dry-run parsed both, found the 2 genuine deltas, left `data.js` byte-identical. Then a real local run (Supabase pointed at a dead host so nothing was written remotely) → wrote only the new film, **second run reported no news** (idempotent), `data.js` still parses. Restored afterwards. NOT verified: the notification rendering end-to-end — that needs a real Supabase write against live user data.
