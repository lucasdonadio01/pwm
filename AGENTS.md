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

### 2026-07-24 · Claude — pushed to origin/main (commits 7ec1504, fb4f727, f0395cc)
- Items 22–31 (see `correcciones.md`). Hash routing (F5 + Back/Forward) both apps; PWM home "quién puntuó" chips with star + blurred teaser tinted by profile bg (I inherited this half-done home-reviews feature uncommitted and finished it, item 23, bundled with Lucas's OK); PWM watchlist filtered numbering starts at 1; PRB review-like pill turns red; PRB profile stat cards persist open/closed; smoother section + overlay-close animations; PRB "Agregar libro" from Leyendo marks the book as reading.
- Profile "Últimas reseñas" + Watchlist got the blurred peek (ported `profileContentPreview` to PRB); removed the top "Ver todas" button so the peek "Ver más"/"Ver menos" is the only toggle; reviews reveal 3 rows before the blur (`desktopRows:3`). Gate redesign: real users up top with an always-on neon glow in their own colour, Invitado + Crear usuario as a secondary row below.
- Assets v29; PWM/PRB 1.17. Verified in a local server (no Supabase test writes): no console errors; gate structure + button removal confirmed. NOT verifiable in this headless pane (no compositing → rAF/ResizeObserver don't fire): the profile blur measurement and the Leyendo add-flow — both are verbatim/logic ports of working code, worth a real-browser check.
