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

  async function search(query) {
    if (!query || query.trim().length < 2) return [];
    const d = await tmdb('/search/multi', { query, language: 'es-ES', include_adult: false });
    return (d.results || [])
      .filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
      .slice(0, 12)
      .map((x) => ({
        id: x.id,
        media: x.media_type,
        kind: x.media_type === 'tv' ? 'series' : 'movie',
        title: x.title || x.name,
        year: (x.release_date || x.first_air_date || '').slice(0, 4),
        poster: poster(x.poster_path),
      }));
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
  async function ensureGenres() {
    if (genreMap) return;
    genreMap = {};
    try { const g = await tmdb('/genre/movie/list', { language: 'es-ES' }); (g.genres || []).forEach((x) => (genreMap[x.id] = x.name)); } catch {}
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

  return { search, addDetails, randomMovies, available: !!T };
})();
