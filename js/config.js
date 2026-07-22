/* WatchMovies — client config + live API (for the "Agregar peli" search)
 *
 * These are READ-ONLY, free, rate-limited keys. On a public repo they are visible in this file —
 * that's an accepted tradeoff for this private 2-person app (nothing destructive is possible with them).
 * Rotate anytime: TMDB dashboard / omdbapi.com.  The Supabase SECRET key is NEVER here.
 */
window.WM = window.WM || {};
WM.keys = { tmdb: 'df6dd2f54a8985efe507d42cfeab6683', omdb: '8a21a5a6' };

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

  return { search, addDetails, available: !!T };
})();
