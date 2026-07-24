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

### 2026-07-24 · Claude — v30 / PWM+PRB 1.18
- PWM home: dropped "Ya vimos"; "Últimas reseñas" now renders **one card per film** with a compact chip strip (avatar + score + review mark) per user, tapping opens the read-only review sheet. Removed the orphaned `buildWatched` / `watchedCard` / `latestTs`.
- New `mobileRows` option in `profileContentPreview` (both apps): reviews reveal **3 rows + half** on mobile instead of 1. The blur veil now fades to `var(--profile-bg-color)`, so it blends with the user's chosen profile background instead of the default ground.
- `setRoute` writes state + hash **synchronously** — it used to sit inside the deferred motion callback, so reloading right after a tap could miss the hash.
- Trailers: no `autoplay` on touch devices. Mobile blocks autoplay-with-sound and the blocked embed just sat black; now YouTube's poster + play button shows and the control starts as "Reproducir".
- PRB: the whole verdict block opens the read-only review (before, only the quoted text did — anywhere else fell through to the full sheet with synopsis + editors). Profile links inside it still win: the delegated handler checks `[data-profile-user]` first.
- **Guest mode retired**: gate entry removed in both apps, stored `guest` sessions cleared on boot. "Crear usuario" is a glass pill (`.gate__create`), not an avatar circle. The defensive `u.guest` / `guestBlock()` checks were left in place on purpose (dead but harmless) rather than churn three files.
- ⚠️ **Never use PowerShell `Get-Content`/`Set-Content` on these files.** PS 5.1 reads UTF-8 as ANSI and double-encodes it — I corrupted 4 files that way and had to `git checkout` them. Use the Edit tool.
- Verified on a local server at mobile viewport, no Supabase test writes: gate (no Invitado, glass pill), PRB review-only sheet + "Editar" on my own review + working profile link, veil resolving to the profile colour, no console errors. NOT verifiable here (headless pane has no compositing → `rAF` never fires, confirmed): the preview measurement itself — but computed from the real geometry it clips at 352px = 3 full rows + 52% of the 4th, as intended.
