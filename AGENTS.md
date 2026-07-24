# AGENTS.md — read me before touching anything

This repo is worked on by several assistants (Claude Code, ChatGPT/cowork) plus **Lucas**, the owner.
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
- None.

## Log — ONLY the latest entry. Replace it, don't append (history is in `git log`).

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
