# PRODUCT.md — WatchMovies

> Private movie companion for two people. Not a public product; no growth, no signup, no funnel.
> Sources of truth: the two owners' Letterboxd watchlists + their own ratings/reviews.

## What it is
A shared, two-person "private Letterboxd" for **Bian** (`bianvepelis`) and **Luke** (`LukeLookMovies`)
to decide what to watch together, rate what they've seen (half-star precision), leave reviews, and like.

## Users (exactly two, no auth)
- On entry, a Netflix/Disney+-style profile picker asks **"¿Quién sos?"** → Bian or Luke.
- Choice is remembered locally; the header shows the active user's avatar; tapping it asks "¿Cambiar de usuario?".
- Bian's identity color = **neon pink**; Luke's = **neon red**. Circular avatars.
- Every rating / review / like is attributed to whichever profile is active.

## Core jobs
1. **Discover** — Home opens on a full-viewport cinematic carousel of films pulled from BOTH watchlists,
   auto-advancing every 7s, with left/right arrows to step back/forward, big bold title, synopsis,
   and IMDb + Rotten Tomatoes scores over an HD backdrop.
2. **Rate** — Letterboxd-style rating, **0.5 → 5.0 in half steps**.
3. **Review** — free-text review per user per film.
4. **Like** — heart toggle per user per film.
5. **Track watched** — films the two have rated appear in a "Ya vimos" list with each person's stars + review.

## Sections (header nav)
- **Home** — hero carousel (watchlist) → Trending (movies/series of the moment + scores) → Ya vimos (watched, with our ratings/reviews).
- **Watchlist** — the combined watchlists.
- **Movies** — films.
- **Series** — trending TV (TMDB), since Letterboxd is film-only. *(assumption — confirm)*

## Data pipeline (free stack)
- **Letterboxd watchlists** → the two URLs; refreshed **weekly** by a GitHub Action that regenerates the movie data file.
- **TMDB** → HD backdrops/posters (Full HD minimum) + synopsis.
- **OMDb** → IMDb rating + Rotten Tomatoes score.
- **Shared state** (ratings/reviews/likes) → **Supabase** (free tier, no end-user login).
  Prototype phase uses `localStorage` behind the same interface; flip to Supabase when keys land.
- **Hosting** → GitHub Pages; **auto-update** → GitHub Actions (weekly cron).

## Hard constraints
- 100% free tooling. No end-user login.
- **All imagery Full HD (≥1920px) or high quality** — no thumbnail-grade posters in hero/cards.
- Icons: **Google Material Symbols**.
- Language: Spanish (Rioplatense) UI.

## Prototype status (labeled assumptions)
- Seeded with REAL titles scraped from both watchlists (2026-07).
- Until TMDB/OMDb keys arrive: backdrops/posters are styled placeholders and scores are sample values — clearly swappable.
- Until Supabase creds arrive: ratings/reviews/likes persist in `localStorage` on each device.
