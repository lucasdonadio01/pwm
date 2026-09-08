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

### 2026-09-08 - Claude - Musuq Pacha's site moved out of this repo
_(Previous entry: the Musuq Pacha symbol generator, built here over 08/09 — it is in `git log`. Before that, photos on reviews + shareable review links, PWM + PRB 1.40. **Nothing in PWM/PRB changed in either session**; that feature is untouched and still awaiting Lucas's approval.)_
- **`musuq-pacha/simbolos/` is gone from this repo on purpose.** The symbol generator now lives in its own repo, **`github.com/lucasdonadio01/musuq-pacha`**, published at **https://lucasdonadio01.github.io/musuq-pacha/**. Lucas asked for a repo exclusive to Musuq Pacha; keeping a copy here would have meant two versions drifting apart.
- **Everything hard-won about that site — the shared morph engine, the forced mirror symmetry, the Bayer-dithered PixelBlast, the coarse entry transition, the no-rAF-while-hidden trap — is written up in that repo's own `AGENTS.md` and `README.md`.** Don't look for it here; `git log` has the code history but the notes moved with the code.
- What stays in this repo from the TIF: `musuq-pacha/assets/` (the 3D board, `.blend` / `.glb` / `mapa_conosur.json`) and the `TIF-*.md` documents, all still untracked and **not mine** — I never touched them.
- `.claude/launch.json` now points the preview server at `C:/Users/CHIA/Code/musuq-pacha`, which is where the site is checked out locally.
- Spec for Lucas is `correcciones.md` #44, which now points at the new repo.
- **PWM and PRB were not touched in this session.** The last real app change is still 1.40.
