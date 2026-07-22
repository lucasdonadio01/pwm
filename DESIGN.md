# DESIGN.md — WatchMovies visual system

Mode: **Operate** (a tool the two owners use), staged with **Experience**-grade energy in the Home hero.
World is **brief-pinned**: "Neón Lux" — near-black cinema dark with electric neon accents and soft outer glow,
crossed with a Netflix-scale hero and Letterboxd's green-star rating grammar.

## Color strategy — Committed dark
Warm-black ground owns the surface; neon carries meaning (identity, action, rating), never decoration.

### Palette (from the pinned neon-lux swatches)
| Role | Hex | Use |
|---|---|---|
| Ground | `#0D0303` | app base (warm near-black) |
| Ground deep | `#070202` | vignette / behind-hero |
| Surface | `#171011` | cards, header, sheets |
| Surface raised | `#211618` | hover, inputs, chips |
| Hairline | `rgba(239,248,255,.10)` | 1px borders |
| Ink | `#EFF8FF` | primary text (cool white) |
| Ink-dim | `#A9A6AD` | secondary text |
| Ink-faint | `#6C676E` | meta / disabled |
| **Lime** | `#BBEF1F` | **rating stars** + highlights (ties to Letterboxd green) |
| **Hot** | `#FF0055` | brand hot accent (logo dot, focus glow) |
| Bian (pink) | `#FF2E9A` | Bian's identity, avatar ring, her attributions |
| Luke (red) | `#FF2D2D` | Luke's identity, avatar ring, his attributions |
| IMDb | `#F5C518` | IMDb badge |
| RT fresh | `#FA320A` | Rotten Tomatoes badge |

Active user tints the accent: the primary WATCH/action + focus glows adopt the current user's color
(pink for Bian, red for Luke) so the app "feels like yours". Lime stays constant for ratings.

## Typography (Google Fonts, free)
- **Display / titles / UI:** `Archivo` — weights 900 (marquee title), 800 (headings), 600 (buttons/nav), 500/400 (body).
  Hero movie title: Archivo 900, tight tracking (-0.02em), large scale (clamp ~3–6rem).
- **Mono labels / scores / meta:** `JetBrains Mono` 500–700, uppercase, letter-spacing .08em
  (SEASON • EPISODE, IMDB, RT, DURATION). This mono/eyebrow layer is the "premium neon" signature.
- Never Inter/Space Grotesk/Plex-as-display. Archivo is the workhorse-with-POV here.

## Material & shape — "Neon pill"
Signature carried from the swatch board: large **fully-rounded pills** with a soft outer neon glow.
- Buttons: pill (`border-radius: 999px`), filled = accent with `box-shadow: 0 0 24px accent/45%`, hover lifts glow.
- Avatars: circles with a 3px neon ring in the user's color + glow.
- Cards (posters): radius 16px, subtle hairline, poster fills; hover raises + neon edge in user color.
- Rating stars glow lime on fill.
- Corner radius scale: pill 999 / card 16 / chip 10 / input 12.

## Rating grammar (Letterboxd, half-star)
Five stars, selectable in **half increments (0.5–5.0)** via pointer position over each star.
Filled = lime with glow; empty = hairline outline. Numeric value shown in mono (e.g. `4.5`).

## Hero (Home)
Full-viewport backdrop (HD), slow Ken-Burns zoom, dual dark scrim (left + bottom) for legibility.
Bottom-left stack: mono meta row → Archivo-900 title → synopsis (2–3 lines) → IMDb + RT badges → WATCH (accent pill) + ADD LIST (ghost pill).
Circular glass arrow controls (prev/next) vertically centered on the sides; progress dots bottom-center; 7s auto-advance with crossfade; pause on hover/focus.

## Motion
- Hero: crossfade 700ms + backdrop scale 1.08→1.0 over the 7s dwell.
- Buttons/avatars: glow-lift on hover (150ms), press scale .97.
- Stars: fill sweep on hover; Like: heart scale pop + color burst.
- Respect `prefers-reduced-motion` (kill Ken-Burns, keep crossfade instant, no auto-advance jank).

## Iconography
Google **Material Symbols Rounded** (filled/weight tuned), sized to the mono label line.

## Layout & responsive
Max content width ~1400px with generous side gutters; hero is edge-to-edge. Poster grids: auto-fill,
minmax ~150–180px. Mobile: hero stacks, arrows shrink, nav collapses to logo + user avatar + menu.

## Accessibility
AA contrast on ink over ground; focus-visible rings in the active user color; all controls keyboard-operable;
rating widget operable via arrow keys; alt text on posters.
