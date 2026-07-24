/* PRB — store (shared via Supabase, with localStorage as offline cache)
 *
 * Per-book/per-user verdicts (rating, review, liked, tier) live in the `reviews` table.
 * Shared app-wide settings (priority `order`, user-added items…) live in the `settings` table.
 * Rows with app='shared' are the ONE account store both PWM and PRB read (single login for both).
 * When PRB.supabase = { url, key, app } is set, everything syncs across devices; otherwise localStorage only.
 * Reads are synchronous against an in-memory cache; call init() once at boot (awaited).
 */
window.PRB = window.PRB || {};

PRB.config = {
  activeUserKey: 'app.activeUser',   // shared by PWM + PRB (same origin) — one account for both
  legacyUserKey: 'prb.activeUser',
  stateKey: 'prb.state.v1',
  settingsKey: 'prb.settings.v1',
  sharedKey: 'app.shared.v1',
};

PRB.store = (function () {
  const sb = () => PRB.supabase || null;
  const SHARED_APP = 'shared';
  let state = {};
  let settings = {};
  let shared = {};
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());
  // Fired ONLY when the change came from somebody else (realtime/poll/refresh), never for our own
  // writes — the UI uses it to redraw without fighting whatever the user is doing right now.
  const remoteListeners = new Set();
  const notifyRemote = () => remoteListeners.forEach((f) => f());

  /* ---- localStorage mirror ---- */
  function loadLocal() {
    try { state = JSON.parse(localStorage.getItem(PRB.config.stateKey)) || {}; } catch { state = {}; }
    try { settings = JSON.parse(localStorage.getItem(PRB.config.settingsKey)) || {}; } catch { settings = {}; }
    try { shared = JSON.parse(localStorage.getItem(PRB.config.sharedKey)) || {}; } catch { shared = {}; }
    // migrate legacy order key
    if (!settings.order) { try { const o = JSON.parse(localStorage.getItem('prb.order.v1')); if (Array.isArray(o)) settings.order = o; } catch {} }
    // migrate the per-app active user to the shared key
    try {
      if (!localStorage.getItem(PRB.config.activeUserKey)) {
        const old = localStorage.getItem(PRB.config.legacyUserKey) || localStorage.getItem('wm.activeUser');
        if (old) localStorage.setItem(PRB.config.activeUserKey, old);
      }
    } catch {}
  }
  function saveLocal() {
    try {
      localStorage.setItem(PRB.config.stateKey, JSON.stringify(state));
      localStorage.setItem(PRB.config.settingsKey, JSON.stringify(settings));
      localStorage.setItem(PRB.config.sharedKey, JSON.stringify(shared));
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
    state = next; settings = nextSettings;
    await pullShared();
    saveLocal();
  }
  async function pullShared() {
    if (!sb()) return;
    try {
      const r = await sbFetch(`settings?app=eq.${SHARED_APP}&select=key,value`);
      if (!r.ok) return;
      const next = {};
      (await r.json()).forEach((x) => (next[x.key] = x.value));
      shared = next;
    } catch {}
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
  function pushShared(key) {
    if (!sb()) return;
    sbFetch('settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ app: SHARED_APP, key, value: shared[key] === undefined ? null : shared[key], updated_at: new Date().toISOString() }) }).catch(() => {});
  }

  /* ---- live sync: Supabase Realtime over websocket, polling as the safety net ---- */
  let live = null;
  function startLive() {
    if (live || !sb()) return;
    live = { ws: null, hb: null, poll: null, tries: 0, joined: false, ref: 0, closed: false };
    connect();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') softRefresh(); });
  }
  let refreshing = false;
  async function softRefresh() {
    if (refreshing) return;
    refreshing = true;
    try { await pull(); notify(); notifyRemote(); } catch {} finally { refreshing = false; }
  }
  function startPolling() {
    if (!live || live.poll) return;
    live.poll = setInterval(() => { if (document.visibilityState === 'visible') softRefresh(); }, 20000);
  }
  function stopPolling() { if (live && live.poll) { clearInterval(live.poll); live.poll = null; } }
  function connect() {
    const c = sb();
    let ws;
    try { ws = new WebSocket(`${c.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(c.key)}&vsn=1.0.0`); }
    catch { startPolling(); return; }
    live.ws = ws;
    const send = (topic, event, payload) => { try { ws.send(JSON.stringify({ topic, event, payload: payload || {}, ref: String(++live.ref) })); } catch {} };
    const joinTimer = setTimeout(() => { if (!live.joined) startPolling(); }, 8000);
    ws.onopen = () => {
      live.tries = 0;
      send(`realtime:${c.app}`, 'phx_join', {
        config: {
          broadcast: { self: false }, presence: { key: '' }, private: false,
          postgres_changes: [
            { event: '*', schema: 'public', table: 'reviews' },
            { event: '*', schema: 'public', table: 'settings' },
          ],
        },
      });
      live.hb = setInterval(() => send('phoenix', 'heartbeat', {}), 25000);
    };
    let debounce = null;
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok' && !live.joined && String(msg.topic).startsWith('realtime:')) {
        live.joined = true; clearTimeout(joinTimer); stopPolling();
      }
      if (msg.event === 'postgres_changes' || msg.event === 'INSERT' || msg.event === 'UPDATE') {
        clearTimeout(debounce);
        debounce = setTimeout(softRefresh, 400);
      }
      if (msg.event === 'phx_error' || (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'error')) startPolling();
    };
    ws.onerror = () => startPolling();
    ws.onclose = () => {
      if (live.hb) { clearInterval(live.hb); live.hb = null; }
      live.joined = false;
      if (live.closed) return;
      startPolling();
      live.tries++;
      setTimeout(connect, Math.min(30000, 1500 * live.tries));
    };
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
    async refresh() { if (sb()) { try { await pull(); notify(); notifyRemote(); } catch {} } },
    startLive,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onRemote(fn) { remoteListeners.add(fn); return () => remoteListeners.delete(fn); },

    getUser() { return localStorage.getItem(PRB.config.activeUserKey); },
    setUser(id) { localStorage.setItem(PRB.config.activeUserKey, id); notify(); },
    clearUser() { localStorage.removeItem(PRB.config.activeUserKey); localStorage.removeItem(PRB.config.legacyUserKey); notify(); },

    get(filmId, userId) { return entry(filmId, userId); },
    setRating(filmId, userId, rating) { write(filmId, userId, { rating }); },
    setReview(filmId, userId, review) { write(filmId, userId, { review }); },
    toggleLike(filmId, userId) { write(filmId, userId, { liked: !entry(filmId, userId).liked }); },
    setTier(filmId, userId, tier) { write(filmId, userId, { tier }); },
    getTier(filmId, userId) { return entry(filmId, userId).tier || null; },

    // shared settings (this app)
    getSetting(key) { return settings[key]; },
    setSetting(key, value) { settings[key] = value; saveLocal(); notify(); pushSetting(key); },
    getOrder() { return Array.isArray(settings.order) ? settings.order.slice() : []; },
    setOrder(ids) { settings.order = ids.slice(); saveLocal(); notify(); pushSetting('order'); },

    // cross-app blobs (app='shared') — the account store lives here so PWM and PRB share one login
    getShared(key) { return shared[key]; },
    setShared(key, value) { shared[key] = value; saveLocal(); notify(); pushShared(key); },
    getAccounts() { const a = shared.accounts; return a && typeof a === 'object' ? JSON.parse(JSON.stringify(a)) : {}; },
    saveAccounts(map) { shared.accounts = map; saveLocal(); notify(); pushShared('accounts'); },

    // reading progress (per book, per user) — synced via the 'reading' settings blob
    getReading(bookId, userId) {
      const r = (settings.reading && settings.reading[bookId] && settings.reading[bookId][userId]) || {};
      return {
        status: r.status || null,                 // 'reading' | 'read' | null
        startedAt: r.startedAt || null,           // 'YYYY-MM-DD'
        finishedAt: r.finishedAt || null,         // 'YYYY-MM-DD'
        page: typeof r.page === 'number' ? r.page : null,
        pageTotal: typeof r.pageTotal === 'number' ? r.pageTotal : null,
        chapter: r.chapter || null,
      };
    },
    setReading(bookId, userId, patch) {
      const all = settings.reading || (settings.reading = {});
      all[bookId] = all[bookId] || {};
      all[bookId][userId] = { ...this.getReading(bookId, userId), ...patch };
      settings.reading = all; saveLocal(); notify(); pushSetting('reading');
    },

    // custom & shared tier lists (beyond the per-user default) — synced via settings
    getTierlists() { return Array.isArray(settings.tierlists) ? settings.tierlists.slice() : []; },
    saveTierlists(list) { settings.tierlists = list.slice(); saveLocal(); notify(); pushSetting('tierlists'); },
    getListTier(listId, itemId) { const d = settings.tierdata || {}; return (d[listId] && d[listId][itemId]) || null; },
    setListTier(listId, itemId, tier) {
      const d = settings.tierdata || (settings.tierdata = {});
      d[listId] = d[listId] || {};
      if (tier) d[listId][itemId] = tier; else delete d[listId][itemId];
      settings.tierdata = d; saveLocal(); notify(); pushSetting('tierdata');
    },
    clearListData(listId) { const d = settings.tierdata || {}; delete d[listId]; settings.tierdata = d; saveLocal(); notify(); pushSetting('tierdata'); },

    // per-board tier ROWS (label + color). null/absent = use the app defaults.
    getTierRows(boardId) { const r = (settings.tierrows || {})[boardId]; return Array.isArray(r) ? JSON.parse(JSON.stringify(r)) : null; },
    saveTierRows(boardId, rows) {
      const all = settings.tierrows || (settings.tierrows = {});
      all[boardId] = rows; settings.tierrows = all; saveLocal(); notify(); pushSetting('tierrows');
    },
    clearTierRows(boardId) { const all = settings.tierrows || {}; delete all[boardId]; settings.tierrows = all; saveLocal(); notify(); pushSetting('tierrows'); },

    isWatched(filmId) { const f = state[filmId]; return !!(f && Object.values(f).some((e) => typeof e.rating === 'number')); },
    watchedFilmIds() { return Object.keys(state).filter((id) => this.isWatched(id)); },
    likeCount(filmId) { const f = state[filmId]; return f ? Object.values(f).filter((e) => e.liked).length : 0; },
  };
})();
