/* WatchMovies — client config + live API (for the "Agregar peli" search)
 *
 * These are READ-ONLY, free, rate-limited keys. On a public repo they are visible in this file —
 * that's an accepted tradeoff for this private 2-person app (nothing destructive is possible with them).
 * Rotate anytime: TMDB dashboard / omdbapi.com.  The Supabase SECRET key is NEVER here.
 */
window.WM = window.WM || {};
WM.keys = { tmdb: 'df6dd2f54a8985efe507d42cfeab6683', omdb: '8a21a5a6' };

// Shared cloud store. The publishable key is safe to expose (that's its purpose) + RLS.
// The Supabase SECRET key is NEVER placed here. app='pwm' namespaces PWM vs PRB in one table.
WM.supabase = {
  url: 'https://kcqrcyxzuskgnxnplbxb.supabase.co',
  key: 'sb_publishable_SGd6YSFMKYd_8t_uaXm-sQ_AXvawyJX',
  app: 'pwm',
};

WM.api = (function () {
  const T = WM.keys.tmdb, O = WM.keys.omdb;
  const IMG = 'https://image.tmdb.org/t/p';
  const backdrop = (p) => (p ? `${IMG}/original${p}` : null);
  const poster = (p) => (p ? `${IMG}/w780${p}` : null);

  async function tmdb(path, params = {}) {
    const u = new URL('https://api.themoviedb.org/3' + path);
    u.searchParams.set('api_key', T);
    Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
    const r = await fetch(u);
    if (!r.ok) throw new Error('tmdb ' + r.status);
    return r.json();
  }
  async function omdb(imdbId) {
    if (!imdbId) return {};
    try {
      const r = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${O}`);
      const d = await r.json();
      if (d.Response === 'False') return {};
      const imdb = d.imdbRating && d.imdbRating !== 'N/A' ? parseFloat(d.imdbRating) : null;
      const rt = (d.Ratings || []).find((x) => x.Source === 'Rotten Tomatoes');
      return { imdb, rt: rt ? parseInt(rt.Value, 10) : null };
    } catch { return {}; }
  }

  /* Search in Spanish, English AND Japanese (for the animes): TMDB's matching leans on the
   * `language` you ask with, so one query alone misses titles the user typed in another one.
   * We fire all three in parallel, merge by id and keep the Spanish title for display when it exists. */
  const SEARCH_LANGS = ['es-ES', 'en-US', 'ja-JP'];
  async function search(query) {
    const q = (query || '').trim();
    if (q.length < 2) return [];
    const packs = await Promise.all(SEARCH_LANGS.map(async (language) => {
      try { return { language, d: await tmdb('/search/multi', { query: q, language, include_adult: false }) }; }
      catch { return { language, d: { results: [] } }; }
    }));
    const merged = new Map();
    packs.forEach(({ language, d }) => {
      (d.results || [])
        .filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
        .forEach((x) => {
          const key = `${x.media_type}-${x.id}`;
          const title = x.title || x.name || '';
          const releaseDate = x.release_date || x.first_air_date || '';
          const prev = merged.get(key);
          if (!prev) {
            merged.set(key, {
              id: x.id, media: x.media_type, kind: x.media_type === 'tv' ? 'series' : 'movie',
              title, orig: x.original_title || x.original_name || '',
              year: releaseDate.slice(0, 4), releaseDate,
              upcoming: !!releaseDate && releaseDate > new Date().toISOString().slice(0, 10),
              poster: poster(x.poster_path), pop: x.popularity || 0, hits: 1, es: language === 'es-ES',
            });
          } else {
            prev.hits++;
            prev.pop = Math.max(prev.pop, x.popularity || 0);
            if (!prev.poster) prev.poster = poster(x.poster_path);
            if (!prev.es && language === 'es-ES' && title) { prev.title = title; prev.es = true; }
          }
        });
    });
    // titles found in several languages are the likelier match, then plain popularity
    return [...merged.values()].sort((a, b) => b.hits - a.hits || b.pop - a.pop).slice(0, 14);
  }

  async function addDetails(tmdbId, media) {
    const path = media === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const d = await tmdb(path, { language: 'es-ES', append_to_response: 'credits,videos,external_ids' });
    const kind = media === 'tv' ? 'series' : 'movie';
    const date = d.release_date || d.first_air_date || '';
    const director =
      kind === 'series'
        ? (d.created_by && d.created_by[0] && d.created_by[0].name) || ''
        : ((d.credits && d.credits.crew) || []).find((c) => c.job === 'Director')?.name || '';
    const vids = (d.videos && d.videos.results) || [];
    const yt = (t) => vids.find((v) => v.site === 'YouTube' && v.type === t && v.official) || vids.find((v) => v.site === 'YouTube' && v.type === t);
    const trailer = yt('Trailer') || yt('Teaser') || vids.find((v) => v.site === 'YouTube');
    const scores = await omdb(d.external_ids && d.external_ids.imdb_id);
    return {
      id: `x-${kind}-${tmdbId}`,
      title: d.title || d.name,
      year: date ? +date.slice(0, 4) : null,
      releaseDate: date || null,
      upcoming: !!date && date > new Date().toISOString().slice(0, 10),
      kind,
      director,
      runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0,
      imdb: scores.imdb ?? null,
      rt: scores.rt ?? null,
      synopsis: d.overview || '',
      genres: (d.genres || []).map((g) => g.name),
      lang: d.original_language || '',
      backdrop: backdrop(d.backdrop_path),
      poster: poster(d.poster_path),
      trailer: trailer ? trailer.key : null,
      tmdb: tmdbId,
      extra: true,
    };
  }

  // Random movie pool for the "secret" swiper — all eras/genres, shuffled.
  let genreMap = null;
  let tvGenreMap = null;
  async function ensureGenres() {
    if (genreMap) return;
    genreMap = {};
    try { const g = await tmdb('/genre/movie/list', { language: 'es-ES' }); (g.genres || []).forEach((x) => (genreMap[x.id] = x.name)); } catch {}
  }
  async function ensureTvGenres() {
    if (tvGenreMap) return;
    tvGenreMap = {};
    try { const g = await tmdb('/genre/tv/list', { language: 'es-ES' }); (g.genres || []).forEach((x) => (tvGenreMap[x.id] = x.name)); } catch {}
  }
  async function randomMovies() {
    await ensureGenres();
    const page = 1 + Math.floor(Math.random() * 450);
    const d = await tmdb('/discover/movie', { sort_by: 'popularity.desc', page, 'vote_count.gte': 60, include_adult: false, language: 'es-ES' });
    const list = (d.results || []).filter((m) => m.poster_path).map((m) => ({
      id: `x-movie-${m.id}`, tmdb: m.id, title: m.title, year: (m.release_date || '').slice(0, 4) ? +(m.release_date).slice(0, 4) : null,
      kind: 'movie', owner: 'extra', extra: true,
      genres: (m.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
      synopsis: m.overview || '', imdb: m.vote_average ? +m.vote_average.toFixed(1) : null,
      poster: poster(m.poster_path), backdrop: backdrop(m.backdrop_path),
    }));
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }

  // Discover NEW movies (outside the watchlist) that match the recommender answers.
  async function discover(a) {
    await ensureGenres();
    const nameToId = {}; Object.entries(genreMap).forEach(([id, name]) => (nameToId[name] = id));
    const nowY = new Date().getFullYear();
    const params = { sort_by: 'popularity.desc', 'vote_count.gte': 80, include_adult: false, language: 'es-ES', page: 1 + Math.floor(Math.random() * 5) };
    const gids = (a.genres || []).map((n) => nameToId[n]).filter(Boolean);
    if (gids.length) params.with_genres = gids.join(',');
    const eras = { pre80: ['1900-01-01', '1979-12-31'], '80s': ['1980-01-01', '1989-12-31'], '90s': ['1990-01-01', '1999-12-31'], '00s': ['2000-01-01', '2009-12-31'], '10s': ['2010-01-01', '2019-12-31'], recent: [`${nowY - 5}-01-01`, `${nowY}-12-31`] };
    if (a.era && eras[a.era]) { params['primary_release_date.gte'] = eras[a.era][0]; params['primary_release_date.lte'] = eras[a.era][1]; }
    const durs = { s: [null, 90], m: [90, 120], l: [120, 150], xl: [150, null] };
    if (a.dur && durs[a.dur]) { if (durs[a.dur][0]) params['with_runtime.gte'] = durs[a.dur][0]; if (durs[a.dur][1]) params['with_runtime.lte'] = durs[a.dur][1]; }
    if (a.imdbmin && a.imdbmin !== 'any') params['vote_average.gte'] = +a.imdbmin;
    if (a.style === 'anime') { params.with_genres = [params.with_genres, '16'].filter(Boolean).join(','); params.with_original_language = 'ja'; }
    else if (a.style === 'anim') { params.with_genres = [params.with_genres, '16'].filter(Boolean).join(','); }
    else if (a.style === 'live') { params.without_genres = '16'; }
    const d = await tmdb('/discover/movie', params);
    return (d.results || []).filter((m) => m.poster_path).slice(0, 15).map((m) => ({
      id: `x-movie-${m.id}`, tmdb: m.id, title: m.title,
      year: (m.release_date || '').slice(0, 4) ? +(m.release_date).slice(0, 4) : null,
      kind: 'movie', owner: 'extra', extra: true,
      genres: (m.genre_ids || []).map((id) => genreMap[id]).filter(Boolean),
      synopsis: m.overview || '', imdb: m.vote_average ? +m.vote_average.toFixed(1) : null, rt: null,
      poster: poster(m.poster_path), backdrop: backdrop(m.backdrop_path), trailer: null,
    }));
  }

  /* Catalog "Descubrir nuevos": fresh TMDB titles for the Movies/Series screens, honouring the
   * genre chip that's active there. `genre` is the Spanish label shown in the UI ('Anime' is a
   * pseudo-genre = animation + japanese). Works for both /discover/movie and /discover/tv. */
  async function discoverCatalog({ kind = 'movie', genre = null, page = 1 } = {}) {
    const tv = kind === 'series' || kind === 'tv';
    await (tv ? ensureTvGenres() : ensureGenres());
    const map = tv ? tvGenreMap : genreMap;
    const nameToId = {}; Object.entries(map).forEach(([id, name]) => (nameToId[name] = id));
    const params = {
      sort_by: 'popularity.desc', include_adult: false, language: 'es-ES', page,
      'vote_count.gte': tv ? 40 : 80,
    };
    if (genre === 'Anime') {
      params.with_genres = tv ? nameToId['Animación'] || '16' : '16';
      params.with_original_language = 'ja';
    } else if (genre && genre !== 'Todos') {
      const gid = nameToId[genre];
      if (gid) params.with_genres = gid;
    }
    const d = await tmdb(tv ? '/discover/tv' : '/discover/movie', params);
    return (d.results || []).filter((m) => m.poster_path).map((m) => {
      const date = m.release_date || m.first_air_date || '';
      return {
        id: `x-${tv ? 'series' : 'movie'}-${m.id}`, tmdb: m.id, media: tv ? 'tv' : 'movie',
        title: m.title || m.name, year: date ? +date.slice(0, 4) : null,
        kind: tv ? 'series' : 'movie', owner: 'extra', extra: true,
        genres: (m.genre_ids || []).map((id) => map[id]).filter(Boolean),
        lang: m.original_language || '',
        synopsis: m.overview || '', imdb: m.vote_average ? +m.vote_average.toFixed(1) : null, rt: null,
        poster: poster(m.poster_path), backdrop: backdrop(m.backdrop_path), trailer: null,
      };
    });
  }

  return { search, addDetails, randomMovies, discover, discoverCatalog, available: !!T };
})();
