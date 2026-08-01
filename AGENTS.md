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

### 2026-08-01 - Claude - PWM: orden de "Ultimas resenas"
- **Imported reviews had no timestamp at all.** The profile sorted by `store.get().updatedAt` and home by `watchedAt || updatedAt`; a Letterboxd review has no Supabase row, so every one scored 0 and the list fell back to `data.js` order. Bian's newest review rendered third.
- `scrapeRSS` now reads `<pubDate>` into **`loggedAt`**, written by both the full run and `--rss-only`. New `reviewTime(fid, uid)` in `app.js` = `updatedAt || loggedAt`, used by the profile and by `latestReviews()`.
- ⚠️ **`loggedAt` is deliberately NOT `date`.** `date` feeds `seenDate`/`byDay`/"este ano"; v36 refused to import `watchedDate` precisely because a bulk-logged backlog would inflate those. Publication time is a different fact and only orders lists — keep them separate.
- Backfilling `loggedAt` on old entries **counts as a change but not as news**, so the first run writes 69 dates and sends zero notifications instead of alerting on every historical review.
- ⚠️ Still open, both pre-existing: the pipeline hardcodes `BUILD_VERSION = '1.4'` and rewrites `?v=` with a timestamp, so it stomps the hand-maintained stamp and PWM/PRB now disagree (1.4 vs 1.34). And **GitHub is dropping ~90% of the scheduled runs** on this repo (40 runs over 2.5 days; the 09:00 daily had not fired in days, which is why nobody noticed TMDB_TOKEN was corrupted). Consider fewer, wider-spaced crons.
- Verified against the live feeds: dry-run reports 69 dates and 0 notifications, `data.js` untouched; the real local run wrote them and Bian's reviews now sort 2026-07-25 `finding-emily` first, then 05-16, 03-12, 03-07 - chronological. 204 films, 181 entries, 0 orphans.
