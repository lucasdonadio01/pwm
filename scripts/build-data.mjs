/* WatchMovies — data pipeline
 * Scrapes both Letterboxd watchlists → matches on TMDB (HD backdrops/posters/synopsis) →
 * enriches with OMDb (IMDb + Rotten Tomatoes) → writes ../js/data.js.
 * Also pulls the real TMDB "trending this week".
 *
 * Run:  TMDB_TOKEN=<v4 read token> OMDB_KEY=<key> node scripts/build-data.mjs
 * (This is exactly what the weekly GitHub Action runs, with the keys as repo secrets.)
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'js', 'data.js');

const TMDB_TOKEN = process.env.TMDB_TOKEN;
const OMDB_KEY = process.env.OMDB_KEY;
if (!TMDB_TOKEN || !OMDB_KEY) { console.error('Missing TMDB_TOKEN or OMDB_KEY env vars'); process.exit(1); }

const IMG = 'https://image.tmdb.org/t/p';

// TMDB leaves some TV genres in English even with language=es-ES.
const GENRE_ES = {
  'Action & Adventure': 'Acción y Aventura',
  'Sci-Fi & Fantasy': 'Ciencia ficción y Fantasía',
  'War & Politics': 'Guerra y Política',
  Kids: 'Infantil', News: 'Noticias', Reality: 'Reality', Soap: 'Telenovela', Talk: 'Talk show',
};
const esGenre = (n) => GENRE_ES[n] || n;
const BACKDROP = (p) => (p ? `${IMG}/original${p}` : null);       // full-res (≥1920) for hero
const POSTER = (p) => (p ? `${IMG}/w780${p}` : null);             // crisp poster for cards

const USERS = {
  bian: { user: 'bianvepelis' },
  luke: { user: 'lukelookmovies' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Letterboxd is flaky about bots — full browser headers + Referer + retry/backoff on 403/429.
const LB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
async function lbFetch(url, referer = 'https://letterboxd.com/', tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { ...LB_HEADERS, Referer: referer } });
      if (r.ok) return r;
      if (r.status === 403 || r.status === 429) { await sleep(1500 * (i + 1)); continue; }
      return r;
    } catch { await sleep(1200 * (i + 1)); }
  }
  return { ok: false, status: 0, text: async () => '' };
}

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: 'application/json' } });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return res.json();
}

async function omdb(imdbId) {
  if (!imdbId) return {};
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`);
    const d = await res.json();
    if (d.Response === 'False') return {};
    const imdb = d.imdbRating && d.imdbRating !== 'N/A' ? parseFloat(d.imdbRating) : null;
    const rtRaw = (d.Ratings || []).find((r) => r.Source === 'Rotten Tomatoes');
    const rt = rtRaw ? parseInt(rtRaw.Value, 10) : null;
    return { imdb, rt };
  } catch { return {}; }
}

async function trailerKey(id, kind) {
  try {
    const path = kind === 'series' ? `/tv/${id}/videos` : `/movie/${id}/videos`;
    const v = await tmdb(path); // default en-US → best trailer coverage
    const r = v.results || [];
    const yt = (t) => r.find((x) => x.site === 'YouTube' && x.type === t && x.official) || r.find((x) => x.site === 'YouTube' && x.type === t);
    const pick = yt('Trailer') || yt('Teaser') || r.find((x) => x.site === 'YouTube');
    return pick ? pick.key : null;
  } catch { return null; }
}

/* ---------- Letterboxd scraping ---------- */
async function scrapeWatchlist(user) {
  const items = [];
  for (let page = 1; page <= 12; page++) {
    const res = await lbFetch(`https://letterboxd.com/${user}/watchlist/page/${page}/`, `https://letterboxd.com/${user}/`);
    if (!res.ok) break;
    const html = await res.text();
    const slugs = [...html.matchAll(/data-(?:item|film)-slug="([^"]+)"/g)].map((m) => m[1]);
    const uniq = [...new Set(slugs)];
    if (!uniq.length) break;
    uniq.forEach((slug) => items.push(slug));
    if (uniq.length < 28) break; // last page
    await sleep(300);
  }
  return [...new Set(items)];
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/g, ' ');
}

// Recent watched films with rating + review straight from the member's RSS feed.
// Reliable (feeds aren't bot-blocked) and it carries the TMDB id, so no page-matching needed.
async function scrapeRSS(user) {
  const res = await lbFetch(`https://letterboxd.com/${user}/rss/`, `https://letterboxd.com/${user}/`);
  if (!res.ok) return [];
  const xml = await res.text();
  const items = xml.split('<item>').slice(1);
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const rt = it.match(/<letterboxd:memberRating>([^<]+)</);
    const mv = it.match(/<tmdb:movieId>([^<]+)</);
    const tv = it.match(/<tmdb:tvId>([^<]+)</);
    const link = it.match(/letterboxd\.com\/[^/]+\/film\/([^/]+)\//);
    if (!rt || !link || (!mv && !tv) || seen.has(link[1])) continue;
    seen.add(link[1]);
    let review = '';
    const desc = it.match(/<description>([\s\S]*?)<\/description>/);
    if (desc) {
      review = decodeEntities(desc[1])
        .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
        .replace(/<img[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/Watched on \w+ \w+ \d{1,2},? \d{4}\.?/gi, ' ') // strip the "Watched on …" log boilerplate
        .replace(/\s+/g, ' ').trim();
      review = review.length < 15 ? '' : review.slice(0, 600);
    }
    out.push({ slug: link[1], tmdbId: +(mv ? mv[1] : tv[1]), kind: mv ? 'movie' : 'series', rating: parseFloat(rt[1]), review });
  }
  return out;
}

async function buildFromTmdb(tmdbId, kind, slug) {
  const det = await details(tmdbId, kind);
  return {
    id: slug, title: det.title, year: det.year, kind: det.kind, owner: 'watched',
    director: det.director, runtime: det.runtime, imdb: null, rt: null,
    synopsis: det.synopsis, genres: det.genres, lang: det.lang,
    backdrop: det.backdrop, poster: det.poster, trailer: null, tmdb: tmdbId, popularity: 0,
  };
}

async function buildLetterboxd(films) {
  const bySlug = new Map(films.map((f) => [f.id, f]));
  const out = {};
  for (const [uid, cfg] of Object.entries(USERS)) {
    const entries = await scrapeRSS(cfg.user);
    console.log(`  ${uid}: ${entries.length} vistas con nota (RSS) · ${entries.filter((e) => e.review).length} con reseña`);
    const verd = {};
    let i = 0;
    for (const e of entries) {
      process.stdout.write(`    ${uid} [${++i}/${entries.length}] ${e.slug}            \r`);
      if (!bySlug.has(e.slug)) {
        try { const f = await buildFromTmdb(e.tmdbId, e.kind, e.slug); films.push(f); bySlug.set(e.slug, f); } catch {}
        await sleep(90);
      }
      if (bySlug.has(e.slug)) verd[e.slug] = e.review ? { rating: e.rating, review: e.review } : { rating: e.rating };
    }
    out[uid] = verd;
    console.log('');
  }
  return out;
}

// slug "princess-mononoke" -> { query, year }  ·  "dune-2021" -> { query:"dune", year:2021 }
function parseSlug(slug) {
  const m = slug.match(/^(.*)-(\d{4})$/);
  if (m && +m[2] >= 1900 && +m[2] <= 2099) return { query: m[1].replace(/-/g, ' '), year: +m[2] };
  return { query: slug.replace(/-/g, ' '), year: null };
}

async function matchTmdb(slug) {
  // Preferred: read the exact TMDB id/type off the Letterboxd film page (100% accurate).
  try {
    const res = await lbFetch(`https://letterboxd.com/film/${slug}/`);
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
      if (m) return { id: +m[2], kind: m[1] === 'tv' ? 'series' : 'movie' };
    }
  } catch {}
  // Fallback: fuzzy search by slug (least reliable).
  const { query, year } = parseSlug(slug);
  const mv = await tmdb('/search/movie', { query, year, include_adult: false });
  if (mv.results && mv.results.length) return { id: mv.results[0].id, kind: 'movie' };
  const tv = await tmdb('/search/tv', { query, first_air_date_year: year });
  if (tv.results && tv.results.length) return { id: tv.results[0].id, kind: 'series' };
  return null;
}

async function details(id, kind) {
  const path = kind === 'series' ? `/tv/${id}` : `/movie/${id}`;
  const d = await tmdb(path, { language: 'es-ES', append_to_response: 'credits,external_ids' });
  const dEn = d.overview ? null : await tmdb(path, { append_to_response: '', language: 'en-US' }).catch(() => null);
  const director =
    kind === 'series'
      ? (d.created_by && d.created_by[0] && d.created_by[0].name) || ''
      : ((d.credits && d.credits.crew) || []).find((c) => c.job === 'Director')?.name || '';
  const date = d.release_date || d.first_air_date || '';
  return {
    title: d.title || d.name,
    year: date ? +date.slice(0, 4) : null,
    kind,
    director,
    runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0,
    synopsis: d.overview || (dEn && dEn.overview) || '',
    genres: (d.genres || []).map((g) => esGenre(g.name)),
    lang: d.original_language || '',
    backdrop: BACKDROP(d.backdrop_path),
    poster: POSTER(d.poster_path),
    tmdb: id,
    imdbId: d.external_ids && d.external_ids.imdb_id,
    popularity: d.popularity || 0,
  };
}

async function buildFilm(slug, owner) {
  const match = await matchTmdb(slug);
  if (!match) { console.warn(`  ✗ no TMDB match for "${slug}"`); return null; }
  const det = await details(match.id, match.kind);
  const scores = await omdb(det.imdbId);
  const trailer = await trailerKey(match.id, match.kind);
  return {
    id: slug,
    title: det.title,
    year: det.year,
    kind: det.kind,
    owner,
    director: det.director,
    runtime: det.runtime,
    imdb: scores.imdb ?? null,
    rt: scores.rt ?? null,
    synopsis: det.synopsis,
    genres: det.genres,
    lang: det.lang,
    backdrop: det.backdrop,
    poster: det.poster,
    trailer,
    tmdb: det.tmdb,
    popularity: det.popularity,
  };
}

async function buildTrending() {
  const gmap = {};
  for (const k of ['movie', 'tv']) {
    try { const g = await tmdb(`/genre/${k}/list`, { language: 'es-ES' }); (g.genres || []).forEach((x) => (gmap[x.id] = esGenre(x.name))); } catch {}
  }
  const t = await tmdb('/trending/all/week', { language: 'es-ES' });
  const out = [];
  let rank = 0;
  for (const item of (t.results || []).slice(0, 12)) {
    if (item.media_type === 'person') continue;
    const kind = item.media_type === 'tv' ? 'series' : 'movie';
    const date = item.release_date || item.first_air_date || '';
    let imdb = null, rt = null;
    try {
      const ext = await tmdb(`/${item.media_type}/${item.id}/external_ids`);
      const s = await omdb(ext.imdb_id);
      imdb = s.imdb ?? null; rt = s.rt ?? null;
    } catch {}
    const trailer = await trailerKey(item.id, kind);
    out.push({
      id: `t-${item.media_type}-${item.id}`,
      title: item.title || item.name,
      year: date ? +date.slice(0, 4) : null,
      kind,
      rank: ++rank,
      imdb: imdb ?? (item.vote_average ? +item.vote_average.toFixed(1) : null),
      rt,
      synopsis: item.overview || '',
      genres: (item.genre_ids || []).map((id) => gmap[id]).filter(Boolean),
      backdrop: BACKDROP(item.backdrop_path),
      poster: POSTER(item.poster_path),
      trailer,
    });
  }
  return out;
}

/* ---------- featured picker: alternate owners, need a backdrop for the hero ---------- */
function pickFeatured(films) {
  const withBg = films.filter((f) => f.backdrop && ['bian', 'luke', 'both'].includes(f.owner));
  const b = withBg.filter((f) => f.owner !== 'luke');
  const l = withBg.filter((f) => f.owner !== 'bian');
  b.sort((x, y) => y.popularity - x.popularity);
  l.sort((x, y) => y.popularity - x.popularity);
  const out = [], seen = new Set();
  for (let i = 0; i < Math.max(b.length, l.length) && out.length < 12; i++) {
    for (const f of [b[i], l[i]]) if (f && !seen.has(f.id)) { seen.add(f.id); out.push(f.id); }
  }
  return new Set(out);
}

async function main() {
  console.log('→ Scraping watchlists…');
  const bianSlugs = await scrapeWatchlist(USERS.bian.user);
  const lukeSlugs = await scrapeWatchlist(USERS.luke.user);
  console.log(`  Bian: ${bianSlugs.length} · Luke: ${lukeSlugs.length}`);

  const ownerBySlug = new Map();
  bianSlugs.forEach((s) => ownerBySlug.set(s, 'bian'));
  lukeSlugs.forEach((s) => ownerBySlug.set(s, ownerBySlug.has(s) ? 'both' : 'luke'));

  const films = [];
  let i = 0;
  for (const [slug, owner] of ownerBySlug) {
    process.stdout.write(`  [${++i}/${ownerBySlug.size}] ${slug}\r`);
    try { const f = await buildFilm(slug, owner); if (f) films.push(f); } catch (e) { console.warn(`  ! ${slug}: ${e.message}`); }
    await sleep(120);
  }
  console.log(`\n  Built ${films.length} films`);

  console.log('→ Trending del momento…');
  const trending = await buildTrending();
  console.log(`  ${trending.length} trending items`);

  console.log('→ Letterboxd: pelis vistas (rating/like/reseña)…');
  const letterboxd = await buildLetterboxd(films);
  console.log(`  Total films (watchlist + vistas): ${films.length}`);

  const featured = pickFeatured(films);
  films.forEach((f) => { f.featured = featured.has(f.id); delete f.popularity; });

  const header =
    `/* WatchMovies — AUTO-GENERATED by scripts/build-data.mjs on ${new Date().toISOString()}\n` +
    ` * Do not edit by hand: the weekly GitHub Action overwrites this file.\n */\n`;
  const body =
    `window.WM = window.WM || {};\n\n` +
    `WM.users = {\n` +
    `  bian: { id: 'bian', name: 'Bian', handle: 'bianvepelis',    color: '#FF2E9A', initial: 'B' },\n` +
    `  luke: { id: 'luke', name: 'Luke', handle: 'LukeLookMovies', color: '#FF2D2D', initial: 'L' },\n` +
    `};\n\n` +
    `WM.movies = ${JSON.stringify(films, null, 2)};\n\n` +
    `WM.trending = ${JSON.stringify(trending, null, 2)};\n\n` +
    `WM.letterboxd = ${JSON.stringify(letterboxd, null, 2)};\n\n` +
    `WM.build = ${JSON.stringify({ version: '1.0', built: new Date().toISOString() })};\n`;

  await writeFile(OUT, header + body, 'utf8');
  console.log(`✓ Wrote ${OUT}`);

  // Cache-bust: stamp local assets with the build epoch so weekly updates aren't masked by caches.
  try {
    const idxPath = join(__dirname, '..', 'index.html');
    let idx = await readFile(idxPath, 'utf8');
    const v = Date.now();
    idx = idx.replace(/(src|href)="((?:js|css)\/[^"?]+?)(?:\?v=\d+)?"/g, `$1="$2?v=${v}"`);
    await writeFile(idxPath, idx, 'utf8');
    console.log('✓ Cache-busted index.html');
  } catch (e) { console.warn('index cache-bust skipped:', e.message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
