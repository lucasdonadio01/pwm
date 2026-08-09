# AGENTS.md — read me before touching anything

This repo is worked on by several assistants (Claude Code, ChatGPT/cowork, Gemini 3.6 Flash) plus **Lucas**, the owner.
**Keep this file short.** It's read every session — if it grows, it costs everyone tokens.
These docs are in English for token efficiency. **This changes nothing about the app: all UI text stays in Rioplatense Spanish.** Lucas speaks Spanish — talk to him in Spanish.

## What this is
Two sibling apps, static vanilla site (**no build step**), one repo:
- **PWM** (movies/series) → `index.html`, `js/`
- **PRB** (books) → `prb/index.html`, `prb/js/`

Live at `lucasdonadio01.github.io/pwm/` and `/pwm/prb/` (GitHub Pages, publishes on push to `main`).
One piece of infra outside the repo: GIF search goes through the **`pwm-gif-search` Cloudflare Worker** (`workers/gif-search/`), which holds the GIPHY key as a Worker secret and only allows the live/local origins. No key ships in the frontend configs.

## Golden rules
1. **Shared code → `js/shared.js` (`APPKIT`)**, loaded by both apps: accounts + PIN, photo cropper, tier-row config, image export, toast. Don't duplicate it in either `app.js`.
2. **New data → JSON blobs in the `settings` table.** Never change the Supabase schema. Keys in use: `reading`, `watchmeta`, `tierlists`, `tierdata`, `tierrows`, `calendars`, `calevents`, `accounts`, `extra_films`, `extra_books`, `order`, `reviewgif`, `reviewlikes`, `reviewpix:<itemId>:<userId>` (this last one is heavy + lazy — see the Log).
3. **There is REAL user data in Supabase.** Never bulk-delete `reviews`/`settings`. If you write while testing, clean it up afterwards.
4. **Cache-bust:** touched JS or CSS -> bump `?v=` in **both** `index.html` files. Otherwise stale assets ship (this already broke the "Leyendo" layout once). PWM's is rewritten with a timestamp by every full pipeline run (a data refresh needs a fresh `data.js` URL); PRB's is hand-bumped and stays a plain number. Either is fine, they do not have to match.
5. **Footer version stamp:** `WM.build` / `PRB.build` in `js/data.js` and `prb/js/data.js`, bumped by hand. The pipeline **reads and preserves** the existing version and only refreshes `built` -- it used to hardcode it and quietly reset PWM on every run.
6. **Everything must stay free.** No build step, no npm at runtime, no paid services.
7. **All user-facing UI text is Rioplatense Spanish** (vos / mirá / elegí).

## Gotchas that cost someone a session
Promoted out of old Log entries so they survive the "replace, don't append" rule.
- **Never `Get-Content`/`Set-Content` these files from PowerShell 5.1** — it reads UTF-8 as ANSI and double-encodes. Four files were corrupted this way. Use the Edit tool.
- **Build stamp is local time**, `Argentina Standard Time`: `(Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")`. Using the UTC hour with a `-03:00` suffix reads 3h ahead.
- **The headless preview pane never fires `rAF`** (no compositing) and `ResizeObserver` doesn't fire either. Anything animated has to be reasoned about or driven with a `setTimeout` shim; it cannot be observed there.
- **Verifying tier/board state in the pane:** `WM.movies` does NOT include extras and `verdictOf` merges the Letterboxd baseline. Evaluate against the board's owner (`def:<uid>`), not whoever you're logged in as — a naive localStorage check reports false positives.
- **GitHub drops most scheduled runs on this repo.** Measured: ~40 runs over 2.5 days where `*/10` alone should give ~144, and the 09:00 daily went days without firing -- which is why nobody noticed `TMDB_TOKEN` had been corrupted. Two frequent crons competing made it worse, so there is now **one** (`*/15`) plus the daily. Do not add a third.
- **A corrupted secret fails silently.** A `TMDB_TOKEN` with a stray non-ASCII character throws `Cannot convert argument to a ByteString` from `fetch`, which the per-film `catch` swallows into a warning. If films stop being created, read the Action log before anything else.

## Handoff protocol
**When you finish:** commit (never leave half-done work uncommitted) · mark status in `correcciones.md` (✅ / 🚧 / ⛔) · **replace** the Log entry below with yours · if Lucas must do something by hand, write it under "Needs Lucas" — the other assistant cannot see your chat.

**When you start:** read this file · run `git log --oneline -10` and `git status` · if there are uncommitted changes that aren't yours, **don't touch them** — ask first.

`correcciones.md` is Lucas's spec file and stays in Spanish.

## Needs Lucas
- ~~GIF search key~~ → GIPHY is stored as the `GIPHY_API_KEY` secret on the `pwm-gif-search` Worker. It is no longer shipped in either frontend config. Tenor stays optional.
- ~~Google Books API key~~ → your key `AIzaSyDr-xp0-Wvx0RKbV7RL6qmeKHZ5jGPqPkM` is now in `PRB.keys.googlebooks`.

## Log — ONLY the latest entry. Replace it, don't append (history is in `git log`).

### 2026-08-09 - Claude - photos on reviews + shareable review links (PWM + PRB), 1.40
_(Previous entry: Codex's GIPHY-proxy Worker, 1.37 — it is in `git log`, and the Worker itself is now noted under "What this is".)_
- **Share a single review:** `#share-review` in the opened review builds `?review=<itemId>&user=<ownerId>` via the new `APPKIT.appUrl()` and hands it to `APPKIT.shareLink()` (native share sheet on mobile, clipboard on desktop, `execCommand` only as the insecure-context fallback). The `openDeepLink()` that consumes those params already existed in both apps — it was only unreachable because nothing produced the URL.
- Deep links now **toast instead of failing silently** when the item is gone, and an unknown `user=` falls back to the viewer instead of opening a blank review.
- **A shared link opens `openReviewCard()`, not `openSheet()`** — a centred modal (`.reviewcard`, z-index 118, bottom sheet under 480px) with the photos, the review like, "ver perfil", "ver la ficha" and close. The side sheet stays for in-app navigation; someone arriving from outside came for that one review. Keep the two paths separate if you touch this.
- **`escapeHtml` in both apps now coerces to string.** PWM's threw `s.replace is not a function` on any number (`f.year`), which kills the whole caller's render — it cost a debugging round here and would have kept doing it.
- **New: up to 4 photos per review, rendered ONLY in the opened review** (`mode: 'review'` sheet). Never in home cards, never in "lo que dijeron los demás" — those get a marker (`.verdict__pics`, an icon in the home chip) that opens the review. Full-screen viewer in `APPKIT.openLightbox`.
- **They are the first lazy `settings` blob.** One row per review, `reviewpix:<itemId>:<userId>`, deliberately kept **out of the bulk pull** (`key=not.like.reviewpix:*`) and out of localStorage — base64 photos would bloat the boot payload and blow the 5MB quota. `pull()` also fetches the bare KEY list, so `hasReviewPics()` is sync and a review with no photos costs zero requests. Values land in an in-memory cache, cleared on every pull.
- Store API (both apps, same names): `hasReviewPics` / `reviewPicsCached` (sync) · `loadReviewPics` / `saveReviewPics` (async; `loadReviewPics` returns `null` when it could not read, `[]` when there is nothing).
- `APPKIT.shrinkImage(src, maxSide, maxBytes)` is the new browser-side compressor: worst case (7.6MB of random noise) → 168KB / 1280×960 / 393ms. Reuse it, don't write another canvas resize.
- **Gotcha fixed while here:** an overlay opened on top of the sheet must restore `document.body.style.overflow` to its previous value, not `''` — resetting it unlocks the page behind a sheet that is still open. `openLightbox` does that; the older pickers still hardcode `''` (harmless today, they only open from full-page views).
- Verified in the real browser against the live Supabase: index + lazy fetch round-trip, gallery, lightbox nav, editor add/remove, and that the pix key never reaches `getSetting()` or localStorage. The scratch rows written for that test were deleted; `settings` is back to its original 10 keys. Share links + the card verified end to end in both apps (copied URL → fresh load → centred card, right review and author, URL cleaned; photos + lightbox above the card; like wiring checked with the store stubbed so no real like was written; profile / ficha / close; mobile bottom sheet; stale id → toast). NOT verified: the logged-out path past the PIN pad — the gate keeps `location.search` intact and `enterAs()` runs `startApp()`, but entering someone's PIN was not mine to do.
- Heads up for whoever reads the `settings` table: `reviewpix:the-grand-budapest-hotel:luke` is **real user data** (photos Lucas already attached), not a test row. Leave it.
