/* WatchMovies — store (shared via Supabase, with localStorage as offline cache)
 *
 * Per-film/per-user verdicts (rating, review, liked, tier) live in the `reviews` table.
 * Shared app-wide settings (priority `order`, user-added items…) live in the `settings` table.
 * Rows with app='shared' are the ONE account store both PWM and PRB read (single login for both).
 * When WM.supabase = { url, key, app } is set, everything syncs across devices; otherwise localStorage only.
 * Reads are synchronous against an in-memory cache; call init() once at boot (awaited).
 */
window.WM = window.WM || {};

WM.config = {
  activeUserKey: 'app.activeUser',   // shared by PWM + PRB (same origin) — one account for both
  legacyUserKey: 'wm.activeUser',
  stateKey: 'wm.state.v1',
  settingsKey: 'wm.settings.v1',
  sharedKey: 'app.shared.v1',
};

WM.store = (function () {
  const sb = () => WM.supabase || null;
  const SHARED_APP = 'shared';
  let state = {};
  let settings = {};
  let shared = {};                    // accounts + anything both apps must agree on
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => f());
  // Fired ONLY when the change came from somebody else (realtime/poll/refresh), never for our own
  // writes — the UI uses it to redraw without fighting whatever the user is doing right now.
  const remoteListeners = new Set();
  const notifyRemote = () => remoteListeners.forEach((f) => f());

  /* ---- localStorage mirror ---- */
  function loadLocal() {
    try { state = JSON.parse(localStorage.getItem(WM.config.stateKey)) || {}; } catch { state = {}; }
    try { settings = JSON.parse(localStorage.getItem(WM.config.settingsKey)) || {}; } catch { settings = {}; }
    try { shared = JSON.parse(localStorage.getItem(WM.config.sharedKey)) || {}; } catch { shared = {}; }
    // migrate legacy order key
    if (!settings.order) { try { const o = JSON.parse(localStorage.getItem('wm.order.v1')); if (Array.isArray(o)) settings.order = o; } catch {} }
    // migrate the per-app active user to the shared key
    try {
      if (!localStorage.getItem(WM.config.activeUserKey)) {
        const old = localStorage.getItem(WM.config.legacyUserKey) || localStorage.getItem('prb.activeUser');
        if (old) localStorage.setItem(WM.config.activeUserKey, old);
      }
    } catch {}
  }
  function saveLocal() {
    try {
      localStorage.setItem(WM.config.stateKey, JSON.stringify(state));
      localStorage.setItem(WM.config.settingsKey, JSON.stringify(settings));
      localStorage.setItem(WM.config.sharedKey, JSON.stringify(shared));
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

  /* ---- live sync: Supabase Realtime over websocket, polling as the safety net ----
   * Realtime needs the tables published (`alter publication supabase_realtime add table settings, reviews`).
   * If the socket never joins (or drops), we fall back to a light poll while the tab is visible. */
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
        debounce = setTimeout(softRefresh, 400);   // coalesce bursts (a save writes several rows)
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
      setTimeout(connect, Math.min(30000, 1500 * live.tries));   // backoff, keep trying for realtime
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
      if (sb()) { try { await Promise.race([pull(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]); } catch (e) { console.warn('[WM] Supabase offline, using local cache:', e.message); } }
      notify();
    },
    async refresh() { if (sb()) { try { await pull(); notify(); notifyRemote(); } catch {} } },
    startLive,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onRemote(fn) { remoteListeners.add(fn); return () => remoteListeners.delete(fn); },

    getUser() { return localStorage.getItem(WM.config.activeUserKey); },
    setUser(id) { localStorage.setItem(WM.config.activeUserKey, id); notify(); },
    clearUser() { localStorage.removeItem(WM.config.activeUserKey); localStorage.removeItem(WM.config.legacyUserKey); notify(); },

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

    // extra review metadata (per film, per user): what year you saw it + where — synced via 'watchmeta' blob
    getWatchMeta(filmId, userId) {
      const m = (settings.watchmeta && settings.watchmeta[filmId] && settings.watchmeta[filmId][userId]) || {};
      return { date: m.date || null, year: m.year || null, where: m.where || null };   // date: 'YYYY-MM-DD'; where: 'imax'|'cine'|'casa'|'celu'
    },
    setWatchMeta(filmId, userId, patch) {
      const all = settings.watchmeta || (settings.watchmeta = {});
      all[filmId] = all[filmId] || {};
      all[filmId][userId] = { ...this.getWatchMeta(filmId, userId), ...patch };
      settings.watchmeta = all; saveLocal(); notify(); pushSetting('watchmeta');
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

    // shared calendars: metadata + planned events ({calId: {'YYYY-MM-DD': [{id,filmId,time,mode,place,by,accepted,dismissed,acceptSeen}]}})
    getCalendars() { return Array.isArray(settings.calendars) ? settings.calendars.slice() : []; },
    saveCalendars(list) { settings.calendars = list.slice(); saveLocal(); notify(); pushSetting('calendars'); },
    getCalEvents(calId) { const all = settings.calevents || {}; return all[calId] ? JSON.parse(JSON.stringify(all[calId])) : {}; },
    saveCalEvents(calId, map) { const all = settings.calevents || (settings.calevents = {}); all[calId] = map; settings.calevents = all; saveLocal(); notify(); pushSetting('calevents'); },
    clearCalEvents(calId) { const all = settings.calevents || {}; delete all[calId]; settings.calevents = all; saveLocal(); notify(); pushSetting('calevents'); },
    allCalEvents() { return JSON.parse(JSON.stringify(settings.calevents || {})); },

    isWatched(filmId) { const f = state[filmId]; return !!(f && Object.values(f).some((e) => typeof e.rating === 'number')); },
    watchedFilmIds() { return Object.keys(state).filter((id) => this.isWatched(id)); },
    likeCount(filmId) { const f = state[filmId]; return f ? Object.values(f).filter((e) => e.liked).length : 0; },
  };
})();
