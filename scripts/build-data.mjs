/* WatchMovies — data pipeline
 * Scrapes both Letterboxd watchlists → matches on TMDB (HD backdrops/posters/synopsis) →
 * enriches with OMDb (IMDb + Rotten Tomatoes) → writes ../js/data.js.
 * Also pulls the real TMDB "trending this week".
 *
 * Run:  TMDB_TOKEN=<v4 read token> OMDB_KEY=<key> node scripts/build-data.mjs
 * (This is exactly what the daily GitHub Action runs, with the private keys as repo secrets.)
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
const BUILD_VERSION = '1.4';

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

const BASE_USERS = {
  bian: { id: 'bian', name: 'Bian', handle: 'bianvepelis', user: 'bianvepelis', color: '#FF2E9A', initial: 'B' },
  luke: { id: 'luke', name: 'Luke', handle: 'LukeLookMovies', user: 'lukelookmovies', color: '#FF2D2D', initial: 'L' },
};
let USERS = { ...BASE_USERS };

/* Accounts created in the browser live in settings(app=shared,key=accounts). The publishable
 * Supabase key is read from js/config.js (or env overrides), so GitHub Actions needs no new secret.
 * Password hashes and photos never get copied into generated data.js. */
let supaCreds;
async function supabase() {
  if (supaCreds !== undefined) return supaCreds;
  try {
    const client = await readFile(join(__dirname, '..', 'js', 'config.js'), 'utf8');
    const url = process.env.SUPABASE_URL || (client.match(/url:\s*'([^']+)'/) || [])[1];
    const key = process.env.SUPABASE_KEY || (client.match(/key:\s*'([^']+)'/) || [])[1];
    supaCreds = url && key ? { url, key } : null;
  } catch { supaCreds = null; }
  return supaCreds;
}
const supaHeaders = (key) => ({ apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' });

/* Signups (and Letterboxd-handle changes) leave a request in settings(app=shared,key=lb_sync_queue).
 * The watcher workflow runs this script with --only-if-pending every few minutes, so a new account's
 * data lands in minutes instead of waiting for the daily run. Cleared once the import succeeds. */
async function readSyncQueue() {
  const c = await supabase();
  if (!c) return {};
  try {
    const r = await fetch(`${c.url}/rest/v1/settings?app=eq.shared&key=eq.lb_sync_queue&select=value`, { headers: supaHeaders(c.key) });
    if (!r.ok) return {};
    const rows = await r.json();
    const v = rows[0] && rows[0].value;
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
async function clearSyncQueue() {
  const c = await supabase();
  if (!c) return;
  try {
    await fetch(`${c.url}/rest/v1/settings`, {
      method: 'POST',
      headers: { ...supaHeaders(c.key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ app: 'shared', key: 'lb_sync_queue', value: {}, updated_at: new Date().toISOString() }),
    });
  } catch (e) { console.warn(`  Could not clear the sync queue (${e.message}).`); }
}

async function loadPipelineUsers() {
  try {
    const c = await supabase();
    if (!c) return;
    const { url, key } = c;
    const r = await fetch(`${url}/rest/v1/settings?app=eq.shared&key=eq.accounts&select=value`, {
      headers: supaHeaders(key),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}`);
    const rows = await r.json();
    const accounts = rows[0] && rows[0].value && typeof rows[0].value === 'object' ? rows[0].value : {};
    const merged = { ...BASE_USERS };
    Object.entries(accounts).forEach(([id, a]) => {
      const lb = String(a.lb || a.handle || '').trim().replace(/^@/, '');
      merged[id] = {
        ...(merged[id] || {}), id,
        name: a.name || (merged[id] && merged[id].name) || id,
        handle: lb || a.handle || id,
        user: lb || (merged[id] && merged[id].user) || '',
        color: a.color || (merged[id] && merged[id].color) || '#7C5CFF',
        initial: a.initial || String(a.name || id).charAt(0).toUpperCase(),
      };
    });
    USERS = Object.fromEntries(Object.entries(merged).filter(([, u]) => u.user));
  } catch (e) {
    console.warn(`  Accounts sync skipped (${e.message}); using built-ins.`);
    USERS = { ...BASE_USERS };
  }
}

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

const stripHtml = (s) => decodeEntities(String(s || ''))
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim();
const ratingFromHtml = (html) => {
  const cls = String(html || '').match(/\brated-(\d{1,2})\b/);
  if (cls) return Math.min(5, +cls[1] / 2);
  const aria = String(html || '').match(/(?:Rated|rating)[:\s]+(\d(?:\.\d)?)/i);
  return aria ? Math.min(5, +aria[1]) : null;
};
const slugMatches = (html) => [...String(html || '').matchAll(/data-(?:item|film)-slug="([^"]+)"/g)].map((m) => ({ slug: m[1], at: m.index }));

async function scrapePaged(user, path, parse, maxPages = 250) {
  const all = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://letterboxd.com/${user}/${path}${page === 1 ? '' : `page/${page}/`}`;
    const res = await lbFetch(url, `https://letterboxd.com/${user}/`);
    if (!res.ok) return { items: all, error: page === 1 ? (res.status === 404 ? 'not-found' : `http-${res.status || 'network'}`) : null };
    const html = await res.text();
    if (page === 1 && /(?:private profile|profile is private|no permission to view)/i.test(html)) return { items: [], error: 'private' };
    const items = parse(html);
    if (!items.length) break;
    all.push(...items);
    if (!/rel="next"|class="[^"]*next[^"]*"/i.test(html)) break;
    await sleep(260);
  }
  return { items: all, error: null };
}

async function scrapeFilms(user) {
  return scrapePaged(user, 'films/', (html) => {
    const hits = slugMatches(html);
    return hits.map((hit, i) => {
      const end = hits[i + 1] ? hits[i + 1].at : Math.min(html.length, hit.at + 1800);
      const block = html.slice(Math.max(0, hit.at - 500), end);
      return { slug: hit.slug, rating: ratingFromHtml(block) };
    });
  });
}

async function scrapeLikedFilms(user) {
  return scrapePaged(user, 'likes/films/', (html) => slugMatches(html).map((x) => x.slug));
}

async function scrapeReviews(user) {
  return scrapePaged(user, 'reviews/', (html) => {
    const starts = [...html.matchAll(/<(?:li|article)[^>]*class="[^"]*\bfilm-detail\b[^"]*"/gi)].map((m) => m.index);
    return starts.map((start, i) => {
      const block = html.slice(start, starts[i + 1] || html.length);
      const slug = (block.match(/data-(?:item|film)-slug="([^"]+)"/) || block.match(/\/film\/([^/"]+)\//) || [])[1];
      if (!slug) return null;
      const body = (block.match(/<div[^>]*class="[^"]*\bbody-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
      const date = (block.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})/i) || [])[1] || null;
      return { slug, rating: ratingFromHtml(block), review: stripHtml(body).slice(0, 1200), date };
    }).filter(Boolean);
  });
}

async function loadPreviousFilms() {
  try {
    const src = await readFile(OUT, 'utf8');
    const match = src.match(/WM\.movies\s*=\s*([\s\S]*?);\s*\n\s*WM\.trending/);
    const list = match ? JSON.parse(match[1]) : [];
    return new Map(list.map((f) => [f.id, f]));
  } catch { return new Map(); }
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
    /* El <title> del item viene como "Pelicula, 2024 - ★★★★". Solo interesa el
     * nombre, para poder nombrar la obra en la notificacion aunque la pelicula
     * no este en WM.movies (pasa si nadie la tiene en su watchlist). */
    const ti = it.match(/<title>([\s\S]*?)<\/title>/);
    const title = ti
      ? decodeEntities(ti[1]).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
          .replace(/\s*-\s*[★½]+.*$/, '').replace(/,\s*\d{4}\s*$/, '').trim()
      : '';
    out.push({ slug: link[1], title, tmdbId: +(mv ? mv[1] : tv[1]), kind: mv ? 'movie' : 'series', rating: parseFloat(rt[1]), review });
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
  const previous = await loadPreviousFilms();
  const out = {};
  const status = {};
  for (const [uid, cfg] of Object.entries(USERS)) {
    const [filmsPack, reviewsPack, likesPack, rss] = await Promise.all([
      scrapeFilms(cfg.user), scrapeReviews(cfg.user), scrapeLikedFilms(cfg.user), scrapeRSS(cfg.user),
    ]);
    const fatal = filmsPack.error || reviewsPack.error;
    if (fatal && !filmsPack.items.length && !reviewsPack.items.length && !rss.length) {
      const label = fatal === 'not-found' ? 'Usuario inexistente' : fatal === 'private' ? 'Perfil privado' : 'Error temporal';
      console.warn(`  ${uid}: ${label} (${fatal})`);
      out[uid] = {};
      status[uid] = { ok: false, code: fatal, message: label, syncedAt: new Date().toISOString(), watched: 0, reviews: 0, unmatched: 0 };
      continue;
    }
    const liked = new Set(likesPack.items);
    const merged = new Map();
    filmsPack.items.forEach((e) => merged.set(e.slug, { ...e, liked: liked.has(e.slug) }));
    reviewsPack.items.forEach((e) => merged.set(e.slug, { ...(merged.get(e.slug) || { slug: e.slug }), ...e, liked: liked.has(e.slug) }));
    rss.forEach((e) => merged.set(e.slug, { ...(merged.get(e.slug) || { slug: e.slug }), ...e, liked: liked.has(e.slug) || (merged.get(e.slug) || {}).liked }));
    liked.forEach((slug) => merged.set(slug, { ...(merged.get(slug) || { slug }), liked: true }));
    const entries = [...merged.values()];
    console.log(`  ${uid}: ${entries.length} vistas · ${entries.filter((e) => e.review).length} reseñas · ${liked.size} likes`);
    const verd = {};
    let unmatched = 0;
    let i = 0;
    for (const e of entries) {
      process.stdout.write(`    ${uid} [${++i}/${entries.length}] ${e.slug}            \r`);
      if (!bySlug.has(e.slug)) {
        try {
          let f = previous.get(e.slug);
          if (!f) {
            let match = e.tmdbId ? { id: e.tmdbId, kind: e.kind } : await matchTmdb(e.slug);
            if (match) f = await buildFromTmdb(match.id, match.kind, e.slug);
          }
          if (f) { films.push(f); bySlug.set(e.slug, f); } else unmatched++;
        } catch { unmatched++; }
        await sleep(90);
      }
      if (bySlug.has(e.slug)) {
        const v = {};
        if (typeof e.rating === 'number') v.rating = e.rating;
        if (e.review) v.review = e.review;
        if (e.liked) v.liked = true;
        if (e.date) v.date = e.date;
        verd[e.slug] = v;
      }
    }
    out[uid] = verd;
    status[uid] = {
      ok: true, code: entries.length ? 'ok' : 'empty',
      message: entries.length ? 'Sincronizado' : 'Perfil sin películas públicas',
      syncedAt: new Date().toISOString(), watched: Object.keys(verd).length,
      reviews: Object.values(verd).filter((v) => v.review).length, unmatched,
    };
    console.log('');
  }
  return { letterboxd: out, status };
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

async function buildFilm(slug, ownerIds) {
  const match = await matchTmdb(slug);
  if (!match) { console.warn(`  ✗ no TMDB match for "${slug}"`); return null; }
  const det = await details(match.id, match.kind);
  const scores = await omdb(det.imdbId);
  const trailer = await trailerKey(match.id, match.kind);
  const owners = Array.isArray(ownerIds) ? ownerIds : [ownerIds].filter(Boolean);
  const owner = owners.length === 1
    ? owners[0]
    : (owners.length === 2 && owners.includes('bian') && owners.includes('luke') ? 'both' : 'shared');
  return {
    id: slug,
    title: det.title,
    year: det.year,
    kind: det.kind,
    owner,
    owners,
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

/* ---------- featured picker: round-robin among owners, with a backdrop for the hero ---------- */
function pickFeatured(films) {
  const withBg = films.filter((f) => f.backdrop && Array.isArray(f.owners) && f.owners.length);
  const queues = Object.keys(USERS).map((uid) => withBg.filter((f) => f.owners.includes(uid)).sort((a, b) => b.popularity - a.popularity));
  const out = [], seen = new Set();
  for (let i = 0; i < Math.max(0, ...queues.map((q) => q.length)) && out.length < 12; i++) {
    for (const q of queues) {
      const f = q[i];
      if (f && !seen.has(f.id)) { seen.add(f.id); out.push(f.id); }
      if (out.length >= 12) break;
    }
  }
  return new Set(out);
}

/* ─────────────────────────────────────────────────────────────── modo solo-RSS
 * El refresco completo scrapea watchlists y pega a TMDB pelicula por pelicula:
 * tarda minutos y no sirve para correr seguido. El feed RSS de cada miembro, en
 * cambio, es UNA request, no esta bloqueado para bots y ya trae puntaje, resena
 * e id de TMDB. Con eso alcanza para detectar resenas nuevas cada pocos minutos.
 *
 * Solo reescribe el bloque `WM.letterboxd` de data.js y solo si algo cambio:
 * sin cambios no hay commit, y sin commit no hay deploy de Pages.
 */

/* data.js es un archivo generado, no un modulo: se extraen los bloques por texto
 * en vez de importarlo, asi el resto del archivo queda intacto byte a byte. */
function readBlock(source, name) {
  const start = source.indexOf(`WM.${name} = `);
  if (start < 0) return null;
  const open = source.search(new RegExp(`WM\.${name} = [\[{]`)) + `WM.${name} = `.length;
  const [oc, cc] = source[open] === '[' ? ['[', ']'] : ['{', '}'];
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === oc) depth++;
    else if (source[i] === cc && --depth === 0) {
      return { from: start, to: i + 1, data: JSON.parse(source.slice(open, i + 1)) };
    }
  }
  return null;
}

async function pushActivity(items) {
  if (!items.length) return false;
  const c = await supabase();
  if (!c) { console.warn('  Sin credenciales de Supabase: no se avisa nada.'); return false; }
  try {
    const r = await fetch(`${c.url}/rest/v1/settings?app=eq.shared&key=eq.activity&select=value`, { headers: supaHeaders(c.key) });
    const rows = r.ok ? await r.json() : [];
    const current = Array.isArray(rows[0] && rows[0].value) ? rows[0].value : [];
    /* Mismo criterio que APPKIT.activity: dedupe por id y tope de 250. */
    const byId = new Map(current.map((it) => [it.id, it]));
    items.forEach((it) => {
      const prev = byId.get(it.id);
      /* Si el aviso ya existia se conserva quien lo leyo o descarto: el refresco
       * diario regenera el bloque y sin esto revivirian notificaciones viejas. */
      byId.set(it.id, { ...(prev || {}), ...it, readBy: (prev && prev.readBy) || {}, dismissedBy: (prev && prev.dismissedBy) || {} });
    });
    const next = [...byId.values()]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, 250);
    const w = await fetch(`${c.url}/rest/v1/settings`, {
      method: 'POST',
      headers: { ...supaHeaders(c.key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ app: 'shared', key: 'activity', value: next, updated_at: new Date().toISOString() }),
    });
    if (!w.ok) throw new Error(`Supabase ${w.status}`);
    return true;
  } catch (e) {
    console.warn(`  No se pudieron guardar las notificaciones (${e.message}).`);
    return false;
  }
}

async function syncFromRss() {
  /* Con --dry-run no toca data.js ni Supabase: sirve para probar el parseo del
   * feed y la deteccion de novedades sin ensuciar datos reales. */
  const dryRun = process.argv.includes('--dry-run');
  await loadPipelineUsers();
  const source = await readFile(OUT, 'utf8');
  const lbBlock = readBlock(source, 'letterboxd');
  const filmBlock = readBlock(source, 'movies');
  if (!lbBlock || !filmBlock) { console.error('✗ No encontre WM.letterboxd o WM.movies en data.js.'); process.exitCode = 1; return; }

  const previous = lbBlock.data;
  const next = JSON.parse(JSON.stringify(previous));
  const films = filmBlock.data;
  const haveFilm = new Set(films.map((f) => f.id));
  const news = [];

  for (const [uid, cfg] of Object.entries(USERS)) {
    let feed = [];
    try { feed = await scrapeRSS(cfg.user); }
    catch (e) { console.warn(`  ! RSS de ${cfg.user}: ${e.message}`); continue; }

    const mine = next[uid] || (next[uid] = {});
    for (const entry of feed) {
      const before = (previous[uid] || {})[entry.slug];
      const rating = Number.isFinite(entry.rating) ? entry.rating : null;
      const review = entry.review || '';

      /* Una resena que YA existe no se toca. El RSS entrega el texto plano y le
       * come las comillas; la pagina de resenas, que usa el refresco completo,
       * lo trae entero. Sobrescribirla degradaria el texto y ademas dejaria a
       * los dos modos turnandose el mismo campo, con un commit por vuelta. */
      const isNew = !before;
      const ratingChanged = (before && (before.rating ?? null)) !== rating && !isNew;
      const gainedReview = !!review && !(before && before.review);
      if (!isNew && !ratingChanged && !gainedReview) continue;

      mine[entry.slug] = {
        ...(mine[entry.slug] || {}),
        ...(rating != null ? { rating } : {}),
        ...(gainedReview ? { review } : {}),
      };
      /* Si nadie tiene la pelicula en su watchlist, no existe en WM.movies y la
       * resena no se veria en ningun lado hasta el refresco completo del dia
       * siguiente. El refresco completo la crea con buildFromTmdb; aca se hace
       * lo mismo, y sale gratis porque el RSS ya trae el id de TMDB. */
      if (!haveFilm.has(entry.slug) && entry.tmdbId) {
        try {
          const f = await buildFromTmdb(entry.tmdbId, entry.kind, entry.slug);
          if (f) { films.push(f); haveFilm.add(entry.slug); console.log(`  + pelicula nueva: ${f.title}`); }
        } catch (e) { console.warn(`  ! no pude crear ${entry.slug}: ${e.message}`); }
      }

      news.push({ uid, slug: entry.slug, title: entry.title, isNew, hasReview: gainedReview || !!(before && before.review) });
    }
  }

  if (!news.length) { console.log('✓ Sin novedades en Letterboxd.'); return; }

  console.log(`→ ${news.length} novedad(es):`);
  news.forEach((n) => console.log(`  ${n.uid} · ${n.title || n.slug}${n.hasReview ? ' (con resena)' : ''}`));

  const everyone = Object.keys(USERS);
  const now = new Date().toISOString();
  const avisos = news.map((n) => ({
    /* El id incluye si trae resena, para que una resena escrita despues de
     * puntuar genere su propio aviso en vez de pisar el anterior. */
    id: `lb-review:${n.uid}:${n.slug}:${n.hasReview ? 'r' : 's'}`,
    type: 'review_publish',
    app: 'pwm',
    via: 'letterboxd',
    actor: n.uid,
    actorName: (USERS[n.uid] || {}).name || n.uid,
    itemId: n.slug,
    title: n.title || n.slug,
    action: n.isNew ? 'published' : 'updated',
    targets: everyone.filter((id) => id !== n.uid),
    createdAt: now,
  }));

  if (dryRun) {
    console.log('\n[simulacion] No se escribe nada. Se habrian mandado estos avisos:');
    avisos.forEach((a) => console.log(`  ${a.id}  "${a.title}"  -> ${a.targets.join(', ') || '(nadie)'}`));
    return;
  }

  await pushActivity(avisos);

  /* Se reescribe de atras hacia adelante para que el primer reemplazo no corra
   * los indices del segundo. */
  const [first, second] = [lbBlock, filmBlock].sort((a, b) => b.from - a.from);
  const render = (b) => (b === lbBlock ? `WM.letterboxd = ${JSON.stringify(next, null, 2)};` : `WM.movies = ${JSON.stringify(films, null, 2)};`);
  let body = source.slice(0, first.from) + render(first) + source.slice(first.to + 1);
  body = body.slice(0, second.from) + render(second) + body.slice(second.to + 1);
  await writeFile(OUT, body, 'utf8');
  console.log('✓ data.js actualizado.');
}

async function main() {
  if (process.argv.includes('--rss-only')) return syncFromRss();

  // Watcher mode: bail out in a second or two unless somebody is actually waiting for an import.
  const onlyIfPending = process.argv.includes('--only-if-pending');
  if (onlyIfPending) {
    const queue = await readSyncQueue();
    const waiting = Object.entries(queue).filter(([, v]) => v && v.lb);
    if (!waiting.length) { console.log('✓ Nada pendiente — no hay nada que sincronizar.'); return; }
    console.log(`→ Sincronización pedida por: ${waiting.map(([id, v]) => `${id} (@${v.lb})`).join(', ')}`);
  }
  await loadPipelineUsers();
  console.log('→ Scraping watchlists…');
  const ownerBySlug = new Map();
  for (const [uid, cfg] of Object.entries(USERS)) {
    const slugs = await scrapeWatchlist(cfg.user);
    console.log(`  ${cfg.name || uid}: ${slugs.length}`);
    slugs.forEach((slug) => {
      if (!ownerBySlug.has(slug)) ownerBySlug.set(slug, new Set());
      ownerBySlug.get(slug).add(uid);
    });
  }

  const films = [];
  let i = 0;
  for (const [slug, ownerSet] of ownerBySlug) {
    process.stdout.write(`  [${++i}/${ownerBySlug.size}] ${slug}\r`);
    try { const f = await buildFilm(slug, [...ownerSet]); if (f) films.push(f); } catch (e) { console.warn(`  ! ${slug}: ${e.message}`); }
    await sleep(120);
  }
  console.log(`\n  Built ${films.length} films`);

  console.log('→ Trending del momento…');
  const trending = await buildTrending();
  console.log(`  ${trending.length} trending items`);

  console.log('→ Letterboxd: pelis vistas (rating/like/reseña)…');
  const imported = await buildLetterboxd(films);
  const letterboxd = imported.letterboxd;
  console.log(`  Total films (watchlist + vistas): ${films.length}`);

  const featured = pickFeatured(films);
  films.forEach((f) => { f.featured = featured.has(f.id); delete f.popularity; });
  const publicUsers = Object.fromEntries(Object.entries(USERS).map(([id, u]) => [id, {
    id, name: u.name, handle: u.handle || u.user, color: u.color, initial: u.initial,
  }]));

  const header =
    `/* WatchMovies — AUTO-GENERATED by scripts/build-data.mjs on ${new Date().toISOString()}\n` +
    ` * Do not edit by hand: the daily GitHub Action overwrites this file.\n */\n`;
  const body =
    `window.WM = window.WM || {};\n\n` +
    `WM.users = ${JSON.stringify(publicUsers, null, 2)};\n\n` +
    `WM.movies = ${JSON.stringify(films, null, 2)};\n\n` +
    `WM.trending = ${JSON.stringify(trending, null, 2)};\n\n` +
    `WM.letterboxd = ${JSON.stringify(letterboxd, null, 2)};\n\n` +
    `WM.importStatus = ${JSON.stringify(imported.status, null, 2)};\n\n` +
    `WM.build = ${JSON.stringify({ version: BUILD_VERSION, built: new Date().toISOString() })};\n`;

  await writeFile(OUT, header + body, 'utf8');
  console.log(`✓ Wrote ${OUT}`);

  // Cache-bust: stamp local assets with the build epoch so daily updates aren't masked by caches.
  try {
    const idxPath = join(__dirname, '..', 'index.html');
    let idx = await readFile(idxPath, 'utf8');
    const v = Date.now();
    idx = idx.replace(/(src|href)="((?:js|css)\/[^"?]+?)(?:\?v=\d+)?"/g, `$1="$2?v=${v}"`);
    await writeFile(idxPath, idx, 'utf8');
    console.log('✓ Cache-busted index.html');
  } catch (e) { console.warn('index cache-bust skipped:', e.message); }

  // Everyone who was waiting is now in data.js, so the queue can go.
  await clearSyncQueue();
}

main().catch((e) => { console.error(e); process.exit(1); });
