/* WatchMovies — store (shared via Supabase, with localStorage as offline cache)
 *
 * State: ratings, reviews, likes, tier — per film, per user. Plus a shared priority `order`.
 * When WM.supabase = { url, key, app } is set, the store loads from / writes to Supabase so the
 * two users sync across devices. If Supabase is unreachable/unconfigured, it falls back to
 * localStorage transparently. Reads are synchronous against an in-memory cache; call init() once
 * at boot (awaited) to fill it.
 *
 * State shape: { [filmId]: { [userId]: { rating, review, liked, tier, updatedAt } } }
 */
window.WM = window.WM || {};

WM.config = {
  activeUserKey: 'wm.activeUser',
  stateKey: 'wm.state.v1',
  orderKey: 'wm.order.v1',
};

WM.store = (function () {
  const sb = () => WM.supabase || null;
  let state = {};
  let order = [];
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());

  /* ---- localStorage mirror (offline cache) ---- */
  function loadLocal() {
    try { state = JSON.parse(localStorage.getItem(WM.config.stateKey)) || {}; } catch { state = {}; }
    try { order = JSON.parse(localStorage.getItem(WM.config.orderKey)) || []; } catch { order = []; }
  }
  function saveLocal() {
    try {
      localStorage.setItem(WM.config.stateKey, JSON.stringify(state));
      localStorage.setItem(WM.config.orderKey, JSON.stringify(order));
    } catch {}
  }

  /* ---- Supabase REST ---- */
  async function sbFetch(path, opts = {}) {
    const c = sb();
    return fetch(`${c.url}/rest/v1/${path}`, {
      ...opts,
      headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }
  async function pull() {
    const c = sb();
    const res = await sbFetch(`reviews?app=eq.${c.app}&select=film_id,user_id,rating,review,liked,tier,updated_at`);
    if (!res.ok) throw new Error('sb reviews ' + res.status);
    const rows = await res.json();
    const next = {};
    rows.forEach((r) => {
      (next[r.film_id] = next[r.film_id] || {})[r.user_id] = {
        rating: typeof r.rating === 'number' ? r.rating : null,
        review: r.review || '', liked: !!r.liked, tier: r.tier || null, updatedAt: r.updated_at,
      };
    });
    const res2 = await sbFetch(`settings?app=eq.${c.app}&key=eq.order&select=value`);
    let ord = order;
    if (res2.ok) { const s = await res2.json(); if (s[0] && Array.isArray(s[0].value)) ord = s[0].value; }
    state = next; order = ord;
    saveLocal();
  }
  function pushEntry(filmId, userId) {
    if (!sb()) return;
    const e = entry(filmId, userId);
    sbFetch('reviews', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ app: sb().app, film_id: filmId, user_id: userId, rating: e.rating, review: e.review || '', liked: !!e.liked, tier: e.tier || null, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }
  function pushOrder() {
    if (!sb()) return;
    sbFetch('settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ app: sb().app, key: 'order', value: order, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  /* ---- core ---- */
  function entry(filmId, userId) { return (state[filmId] && state[filmId][userId]) || { rating: null, review: '', liked: false, tier: null, updatedAt: null }; }
  function write(filmId, userId, patch) {
    state[filmId] = state[filmId] || {};
    state[filmId][userId] = { ...entry(filmId, userId), ...patch, updatedAt: new Date().toISOString() };
    saveLocal(); notify(); pushEntry(filmId, userId);
  }

  return {
    async init() {
      loadLocal(); // instant offline cache first
      if (sb()) {
        try {
          await Promise.race([pull(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
        } catch (e) { console.warn('[WM] Supabase offline, using local cache:', e.message); }
      }
      notify();
    },
    async refresh() { if (sb()) { try { await pull(); notify(); } catch {} } },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    getUser() { return localStorage.getItem(WM.config.activeUserKey); },
    setUser(id) { localStorage.setItem(WM.config.activeUserKey, id); notify(); },
    clearUser() { localStorage.removeItem(WM.config.activeUserKey); notify(); },

    get(filmId, userId) { return entry(filmId, userId); },
    setRating(filmId, userId, rating) { write(filmId, userId, { rating }); },
    setReview(filmId, userId, review) { write(filmId, userId, { review }); },
    toggleLike(filmId, userId) { write(filmId, userId, { liked: !entry(filmId, userId).liked }); },
    setTier(filmId, userId, tier) { write(filmId, userId, { tier }); },
    getTier(filmId, userId) { return entry(filmId, userId).tier || null; },

    getOrder() { return order.slice(); },
    setOrder(ids) { order = ids.slice(); saveLocal(); notify(); pushOrder(); },

    isWatched(filmId) { const f = state[filmId]; return !!(f && Object.values(f).some((e) => typeof e.rating === 'number')); },
    watchedFilmIds() { return Object.keys(state).filter((id) => this.isWatched(id)); },
    likeCount(filmId) { const f = state[filmId]; return f ? Object.values(f).filter((e) => e.liked).length : 0; },
  };
})();
