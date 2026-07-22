/* WatchMovies — store (shared via Supabase, with localStorage as offline cache)
 *
 * Per-film/per-user verdicts (rating, review, liked, tier) live in the `reviews` table.
 * Shared app-wide settings (priority `order`, user-added items…) live in the `settings` table.
 * When PRB.supabase = { url, key, app } is set, both sync across devices; otherwise localStorage only.
 * Reads are synchronous against an in-memory cache; call init() once at boot (awaited).
 */
window.PRB = window.PRB || {};

PRB.config = {
  activeUserKey: 'prb.activeUser',
  stateKey: 'prb.state.v1',
  settingsKey: 'prb.settings.v1',
};

PRB.store = (function () {
  const sb = () => PRB.supabase || null;
  let state = {};
  let settings = {};
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());

  /* ---- localStorage mirror ---- */
  function loadLocal() {
    try { state = JSON.parse(localStorage.getItem(PRB.config.stateKey)) || {}; } catch { state = {}; }
    try { settings = JSON.parse(localStorage.getItem(PRB.config.settingsKey)) || {}; } catch { settings = {}; }
    // migrate legacy order key
    if (!settings.order) { try { const o = JSON.parse(localStorage.getItem('prb.order.v1')); if (Array.isArray(o)) settings.order = o; } catch {} }
  }
  function saveLocal() {
    try {
      localStorage.setItem(PRB.config.stateKey, JSON.stringify(state));
      localStorage.setItem(PRB.config.settingsKey, JSON.stringify(settings));
    } catch {}
  }

  /* ---- Supabase REST ---- */
  async function sbFetch(path, opts = {}) {
    const c = sb();
    return fetch(`${c.url}/rest/v1/${path}`, { ...opts, headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  }
  async function pull() {
    const c = sb();
    const res = await sbFetch(`reviews?app=eq.${c.app}&select=film_id,user_id,rating,review,liked,tier,updated_at`);
    if (!res.ok) throw new Error('sb reviews ' + res.status);
    const rows = await res.json();
    const next = {};
    rows.forEach((r) => { (next[r.film_id] = next[r.film_id] || {})[r.user_id] = { rating: typeof r.rating === 'number' ? r.rating : null, review: r.review || '', liked: !!r.liked, tier: r.tier || null, updatedAt: r.updated_at }; });
    const res2 = await sbFetch(`settings?app=eq.${c.app}&select=key,value`);
    const nextSettings = {};
    if (res2.ok) { (await res2.json()).forEach((r) => (nextSettings[r.key] = r.value)); }
    state = next; settings = nextSettings; saveLocal();
  }
  function pushEntry(filmId, userId) {
    if (!sb()) return;
    const e = entry(filmId, userId);
    sbFetch('reviews', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ app: sb().app, film_id: filmId, user_id: userId, rating: e.rating, review: e.review || '', liked: !!e.liked, tier: e.tier || null, updated_at: new Date().toISOString() }) }).catch(() => {});
  }
  function pushSetting(key) {
    if (!sb()) return;
    sbFetch('settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ app: sb().app, key, value: settings[key] === undefined ? null : settings[key], updated_at: new Date().toISOString() }) }).catch(() => {});
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
      loadLocal();
      if (sb()) { try { await Promise.race([pull(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]); } catch (e) { console.warn('[PRB] Supabase offline, using local cache:', e.message); } }
      notify();
    },
    async refresh() { if (sb()) { try { await pull(); notify(); } catch {} } },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    getUser() { return localStorage.getItem(PRB.config.activeUserKey); },
    setUser(id) { localStorage.setItem(PRB.config.activeUserKey, id); notify(); },
    clearUser() { localStorage.removeItem(PRB.config.activeUserKey); notify(); },

    get(filmId, userId) { return entry(filmId, userId); },
    setRating(filmId, userId, rating) { write(filmId, userId, { rating }); },
    setReview(filmId, userId, review) { write(filmId, userId, { review }); },
    toggleLike(filmId, userId) { write(filmId, userId, { liked: !entry(filmId, userId).liked }); },
    setTier(filmId, userId, tier) { write(filmId, userId, { tier }); },
    getTier(filmId, userId) { return entry(filmId, userId).tier || null; },

    // shared settings
    getSetting(key) { return settings[key]; },
    setSetting(key, value) { settings[key] = value; saveLocal(); notify(); pushSetting(key); },
    getOrder() { return Array.isArray(settings.order) ? settings.order.slice() : []; },
    setOrder(ids) { settings.order = ids.slice(); saveLocal(); notify(); pushSetting('order'); },

    isWatched(filmId) { const f = state[filmId]; return !!(f && Object.values(f).some((e) => typeof e.rating === 'number')); },
    watchedFilmIds() { return Object.keys(state).filter((id) => this.isWatched(id)); },
    likeCount(filmId) { const f = state[filmId]; return f ? Object.values(f).filter((e) => e.liked).length : 0; },
  };
})();
