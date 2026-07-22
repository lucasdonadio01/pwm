/* WatchMovies — store
 * Shared state: ratings, reviews, likes — per film, per user.
 * Prototype persistence = localStorage. The API below is intentionally the same shape we'll
 * back with Supabase later (a `reviews` table keyed by film_id + user_id). To switch:
 *   set WM.config.supabase = { url, anonKey } and replace load()/save() with async calls.
 *
 * State shape:
 *   { [filmId]: { [userId]: { rating: number|null, review: string, liked: boolean, updatedAt: ISO } } }
 */
window.WM = window.WM || {};

WM.config = {
  activeUserKey: 'wm.activeUser',
  stateKey: 'wm.state.v1',
  orderKey: 'wm.order.v1', // shared watchlist priority order (array of film ids)
  supabase: null, // { url, anonKey } — when set, store swaps to shared cloud
};

WM.store = (function () {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      return JSON.parse(localStorage.getItem(WM.config.stateKey)) || {};
    } catch {
      return {};
    }
  }
  function save() {
    localStorage.setItem(WM.config.stateKey, JSON.stringify(state));
    listeners.forEach((fn) => fn());
  }

  function entry(filmId, userId) {
    return (state[filmId] && state[filmId][userId]) || { rating: null, review: '', liked: false, updatedAt: null };
  }
  function write(filmId, userId, patch) {
    state[filmId] = state[filmId] || {};
    const prev = entry(filmId, userId);
    state[filmId][userId] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
    save();
  }

  return {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // active user
    getUser() { return localStorage.getItem(WM.config.activeUserKey); },
    setUser(id) { localStorage.setItem(WM.config.activeUserKey, id); listeners.forEach((f) => f()); },
    clearUser() { localStorage.removeItem(WM.config.activeUserKey); listeners.forEach((f) => f()); },

    // per film+user
    get(filmId, userId) { return entry(filmId, userId); },
    setRating(filmId, userId, rating) { write(filmId, userId, { rating }); },
    setReview(filmId, userId, review) { write(filmId, userId, { review }); },
    toggleLike(filmId, userId) { write(filmId, userId, { liked: !entry(filmId, userId).liked }); },
    setTier(filmId, userId, tier) { write(filmId, userId, { tier }); },
    getTier(filmId, userId) { return entry(filmId, userId).tier || null; },

    // shared watchlist priority order
    getOrder() {
      try { return JSON.parse(localStorage.getItem(WM.config.orderKey)) || []; } catch { return []; }
    },
    setOrder(ids) { localStorage.setItem(WM.config.orderKey, JSON.stringify(ids)); listeners.forEach((f) => f()); },

    // aggregates
    // A film counts as "watched" once either user has given it a rating.
    isWatched(filmId) {
      const f = state[filmId];
      return !!(f && Object.values(f).some((e) => typeof e.rating === 'number'));
    },
    watchedFilmIds() {
      return Object.keys(state).filter((id) => this.isWatched(id));
    },
    likeCount(filmId) {
      const f = state[filmId];
      return f ? Object.values(f).filter((e) => e.liked).length : 0;
    },
  };
})();
