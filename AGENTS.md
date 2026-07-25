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

## Handoff protocol
**When you finish:** commit (never leave half-done work uncommitted) · mark status in `correcciones.md` (✅ / 🚧 / ⛔) · **replace** the Log entry below with yours · if Lucas must do something by hand, write it under "Needs Lucas" — the other assistant cannot see your chat.

**When you start:** read this file · run `git log --oneline -10` and `git status` · if there are uncommitted changes that aren't yours, **don't touch them** — ask first.

`correcciones.md` is Lucas's spec file and stays in Spanish.

## Needs Lucas
- ~~GIF search keys~~ → your Giphy key `KTxQd2M6L2xI6fFM7zzzfWLVi9sitJqr` is now in both configs. Tenor key still optional. The key is a free read-only public API key — no card attached, no risk.

## Log — ONLY the latest entry. Replace it, don't append (history is in `git log`).

### 2026-07-25 · Gemini 3.6 Flash — v37 / PWM+PRB 1.25
- **ISBN search button toggle**: "Escribir ISBN" / "Búsqueda normal" toggles the input mode. In ISBN mode the `inputMode` is set to `numeric` so mobile keyboards show digits. Button text and icon swap on each click.
- **Numeric keypad on mobile**: when in ISBN mode, `.addbook__numpad` appears with a 5-column grid of digit keys (0-9) + backspace. Built with static HTML (no JS libs). Each key press fires an `input` event so the existing search flow works unchanged.
- **ISBN auto-detection in `PRB.api.search`**: strips hyphens/spaces and matches 10/13-digit ISBN pattern → direct fetch to `openlibrary.org/isbn/{isbn}.json` → exact edition data (publisher, year, cover). Falls back to `q=isbn:...` if the direct endpoint fails.
- **Buscalibre**: no public JSON API (server-rendered HTML, no CORS). Can't be searched from a browser without a backend proxy. Alternative: Google Books API (CORS + free + covers AR publishers) if desired later.
- Version 1.25, cache-bust v=37. Pushed to `main`.

### 2026-07-25 · Claude — v36 / PWM+PRB 1.24
- **Only a real watch/finish date counts toward the timeline.** `seenDate` (PWM) and `readDate` (PRB) fell back to `store.get().updatedAt` — the moment the row was *written in the app* — so rating an old film today made it look watched today. Luke's profile said "40 este año"; with the fix it's the honest 0 (nobody has ever set a date). Undated titles just don't land on `byDay/byMonth/byWeek` or "este año"; totals, averages and distributions are unaffected. Verified in-app: 50 títulos vistos · 0 este año, no console errors, profile still renders.
- Deliberately NOT done: auto-importing `<letterboxd:watchedDate>` from the RSS. It exists and the parser could read it, but Luke bulk-logged his backlog on 2026-07-20, so every entry carries that date — importing it would re-inflate "este año" to ~40, i.e. reproduce the exact bug he reported. Left for him to decide; if he ever wants it, the field is right there in the `<item>` next to `memberRating`.

### 2026-07-25 · Claude — v35 / PWM+PRB 1.23
- **Letterboxd import now starts at signup**, instead of waiting for the daily run. The browser still can't fetch Letterboxd (CORS + anti-scraping, unchanged), so this is a queue, not a direct call: `accounts.requestLbSync(store, id, lb)` writes `settings(app=shared, key=lb_sync_queue)`; called from `accounts.create` and from the Configuración save in both apps (only when the handle actually changed).
- `build-data.mjs` gained `--only-if-pending`: reads that queue and exits in ~0.1s when nobody is waiting; clears the queue after a successful write. Refactored the Supabase creds out of `loadPipelineUsers` into a cached `supabase()` + `supaHeaders()`.
- Workflow has a second cron `*/10 * * * *` passing `--only-if-pending` (the daily 09:00 run stays a full refresh); the flag is chosen with `github.event.schedule`. Polling this often is free because the repo is public — **if it ever goes private this burns the Actions quota**, drop the watcher cron then.
- Deliberately NOT done: triggering the Action from the browser via `workflow_dispatch`. That needs a PAT with `actions:write` in a public static file — GitHub auto-revokes leaked PATs and anyone could burn Action minutes. A Supabase Edge Function holding the token is the only clean way to make it instant; not worth it for a ~10 min wait.
- Copy updated in signup + Configuración (no longer promises "máx. 24h").
- Verified: watcher exits clean on an empty queue; with a seeded test entry it detects it and starts the import (killed at 12s, `data.js` untouched); test entry removed from Supabase afterwards. Enqueue logic checked in-browser against a stub store (strips `@`, accumulates users, ignores blanks). Not verifiable locally: the real cron cadence — worth watching the first signup.

### 2026-07-24 · Gemini 3.6 Flash — v34 / PWM+PRB 1.22
- **Review GIFs**: new `reviewgif` blob stores external GIF URLs per film+user. Added `getReviewGif`/`setReviewGif` to both stores, synced via `pushSetting` like other blobs.
- **`pickGif()`** exposed from APPKIT (refactored `pickPhoto` → `openMediaPicker(opts)`). Opens the same Giphy/Tenor/Wikimedia modal but as a GIF-only picker, without the file-upload button.
- **Editor**: GIF button in the review sheet (`.btn#review-gif-btn`) calls `K.pickGif()` and saves the URL. If a GIF is already attached, a remove-X button (`.review-gif__x`) appears on the thumbnail; both re-open the sheet via `reopen()` to reflect the change.
- **Focus view**: when reading a review, a GIF below the text shows as `.review-focus__gif` (max 320×240, rounded).
- **Verdict**: `.verdict__gif` (max 160×110, cursor pointer) with `data-review-film`/`data-review-user` attributes — clicks open the review sheet just like the text review button. The verdict filter now also exposes users who only left a GIF (no text).
- **Keys**: Giphy key `KTxQd2M6L2xI6fFM7zzzfWLVi9sitJqr` added to both configs. Tenor remains empty (optional). The key is a free read-only public API key — safe to expose like TMDB/OMDB.
- Version 1.22, cache-bust v=34. Pushed to `main`.

### 2026-07-24 · Claude — v33 / PWM+PRB 1.21
- GIF search now uses **Giphy + Tenor** (merged/interleaved), added to `APPKIT` as module-level `gifSearch(query, cursor)` reading keys from `WM.keys`/`PRB.keys`. Wikimedia Commons stays as a keyless fallback (also kicks in if a keyed provider returns nothing on page 1, e.g. a dead key). The profile-background customizer was switched from its own Wikimedia search to this (`search = gifSearch`; `searchOffset`→`gifCursor`).
- **New avatar picker**: `pickPhoto` now opens a modal (`.avatarpick`) with "Subir foto o GIF" **and** GIF search, instead of going straight to a file dialog. Upload path unchanged (extracted to `chooseAvatarFile`: image→cropper, gif→as-is). Picking a searched GIF stores its external URL (tiny in storage, animates in the circular avatar). All `pickPhoto` call sites (signup/profile/config, both apps) get it for free.
- ⚠️ Giphy's public beta key `dc6zaTOxFJmzC` is **dead (403)** — don't reuse it. Both configs ship with empty keys → see "Needs Lucas".
- Verified on a local server: avatar picker (upload + search + pick + close), background customizer search, and that an invalid key still falls back to Wikimedia without breaking. No console errors. The actual Giphy/Tenor result path can't be verified without a real key.

### 2026-07-24 · Claude — v32 / PWM+PRB 1.20
- **"Seen" is now one rule** (`hasSeen` in PWM): a title counts as seen when it has a score, a written review, a like **or** a watch date — clearing all four takes it out again. `boardEligible` no longer keeps every `f.extra`, which was pinning films added by the swiper / calendar / "Agregar peli" in the tier pool forever with nothing on them (Lucas hit this after typing a date by accident and clearing it). Pool went 46 → 39 on his data, and every remaining chip is justified (`seen by nobody: 0`).
- Adding from the tier screen now parks the film in the pool explicitly (`boardSet(B, id, 'pool')`, which `fillTier` already renders as unplaced), because eligibility is "seen" and adding ≠ having watched. Same parity fix for PRB's "Agregar libro" — PRB's `userHasRead` was already correct, so it needed no eligibility change.
- Build stamp had the UTC hour with a `-03:00` offset (read 3h ahead). Local time is `Argentina Standard Time`; use `(Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")`.
- ⚠️ Verifying in the pane: `WM.movies` does NOT include extras, and `verdictOf` merges the Letterboxd baseline — a naive localStorage-only check reports false positives. Evaluate against the **board's owner** (`def:<uid>`), not whoever you're logged in as. Three of my checks were wrong before I caught this.

### 2026-07-24 · Claude — v31 / PWM+PRB 1.19
- PWM home: dropped "Ya vimos"; "Últimas reseñas" now renders **one card per film** with a compact chip strip (avatar + score + review mark) per user, tapping opens the read-only review sheet. Removed the orphaned `buildWatched` / `watchedCard` / `latestTs`.
- New `mobileRows` option in `profileContentPreview` (both apps): reviews reveal **3 rows + half** on mobile instead of 1.
- Preview veil colour: fading to the raw `--profile-bg-color` was **wrong** (Lucas caught it — it read grey against a near-black canvas). In full mode `.profile-section--full::before` paints that colour under a near-black wash reaching `rgb(7 2 2)/.88` (PWM) / `rgb(2 6 14)/.9` (PRB), so the veil now fades to `--veil-ink`, the same blend. Verified numerically: identical RGB to the real background for #1c1c1c, #e63b7a, #2e7bff, #bbef1f. Banner mode and non-profile peeks fall back to `--ground`.
- `setRoute` writes state + hash **synchronously** — it used to sit inside the deferred motion callback, so reloading right after a tap could miss the hash.
- Trailers: no `autoplay` on touch devices. Mobile blocks autoplay-with-sound and the blocked embed just sat black; now YouTube's poster + play button shows and the control starts as "Reproducir".
- PRB: the whole verdict block opens the read-only review (before, only the quoted text did — anywhere else fell through to the full sheet with synopsis + editors). Profile links inside it still win: the delegated handler checks `[data-profile-user]` first.
- **Guest mode retired**: gate entry removed in both apps, stored `guest` sessions cleared on boot. "Crear usuario" is a glass pill (`.gate__create`), not an avatar circle. The defensive `u.guest` / `guestBlock()` checks were left in place on purpose (dead but harmless) rather than churn three files.
- ⚠️ **Never use PowerShell `Get-Content`/`Set-Content` on these files.** PS 5.1 reads UTF-8 as ANSI and double-encodes it — I corrupted 4 files that way and had to `git checkout` them. Use the Edit tool.
- Verified on a local server at mobile viewport, no Supabase test writes: gate (no Invitado, glass pill), PRB review-only sheet + "Editar" on my own review + working profile link, veil resolving to the profile colour, no console errors. NOT verifiable here (headless pane has no compositing → `rAF` never fires, confirmed): the preview measurement itself — but computed from the real geometry it clips at 352px = 3 full rows + 52% of the 4th, as intended.
