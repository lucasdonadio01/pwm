/* WatchMovies — app controller (vanilla, no build step) */
(function () {
  'use strict';
  const trending = WM.trending;
  const store = WM.store;
  const K = window.APPKIT;

  // Users = the built-ins from data.js merged with the accounts anyone created (shared with PRB).
  // The object identity never changes, so every closure that captured `users` keeps working.
  const users = {};
  function refreshUsers() {
    const merged = K.accounts.all(store, WM.users);
    Object.keys(users).forEach((k) => { if (!merged[k]) delete users[k]; });
    Object.assign(users, merged);
  }
  refreshUsers();

  // Watchlist films + any films the users added by hand (persisted locally, Supabase-ready).
  const movies = WM.movies.slice();
  // Films added by hand or via the swiper — shared through Supabase settings.
  function mergeExtras() { (store.getSetting('extra_films') || []).forEach((f) => { if (!movies.some((m) => m.id === f.id)) movies.push(f); }); }
  function addExtraFilm(f) {
    if (movies.some((m) => m.id === f.id)) return false;
    f.owner = f.owner || 'extra';
    movies.push(f);
    const ex = store.getSetting('extra_films') || []; ex.push(f); store.setSetting('extra_films', ex);
    return true;
  }
  // New pipeline builds keep every owner in `owners`; old data only has owner/both.
  function ownersOf(f) {
    if (Array.isArray(f.owners)) return f.owners.filter((id) => users[id]);
    if (f.owner === 'both') return ['bian', 'luke'].filter((id) => users[id]);
    return users[f.owner] ? [f.owner] : [];
  }
  // Watchlist = films that live on at least one Letterboxd/user watchlist.
  const isWatchlist = (f) => ownersOf(f).length > 0;
  const watchlistFilms = () => movies.filter(isWatchlist);

  // Merge in-app verdicts (store) with the Letterboxd baseline (rating/like/review from WM.letterboxd).
  const lbData = () => WM.letterboxd || {};
  function lbVerdict(fid, uid) { const u = lbData()[uid]; return (u && u[fid]) || null; }
  function watchMetaOf(fid, uid) {
    const local = store.getWatchMeta(fid, uid);
    const lb = lbVerdict(fid, uid);
    return { ...local, date: local.date || (lb && lb.date) || null };
  }
  function verdictOf(fid, uid) {
    const e = store.get(fid, uid);
    const lb = lbVerdict(fid, uid);
    return {
      rating: typeof e.rating === 'number' ? e.rating : lb && typeof lb.rating === 'number' ? lb.rating : null,
      review: e.review || (lb && lb.review) || '',
      liked: e.liked || !!(lb && lb.liked),
    };
  }
  const root = document.documentElement;

  const $ = (s, r = document) => r.querySelector(s);
  const icon = (n) => `<span class="material-symbols-rounded">${n}</span>`;
  const byId = (id) => movies.find((m) => m.id === id) || trending.find((t) => t.id === id);

  // Photo avatars: the account's own photo wins; otherwise the file at assets/<id>.jpg.
  // If both are missing (or the file 404s) the initial letter shows.
  const PHOTOS = { bian: 'assets/bian.jpg', luke: 'assets/luke.jpg' };
  const photoOf = (uid) => (users[uid] && users[uid].photo) || PHOTOS[uid] || null;
  function avatarHTML(u, cls = 'avatar') {
    const p = u.photo || photoOf(u.id);
    const img = p ? `<img class="avatar__img" src="${p}" alt="" onerror="this.remove()">` : '';
    return `<span class="${cls}" style="--c:${u.color}">${u.initial}${img}</span>`;
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
    return Math.abs(h);
  }
  // Cinematic placeholder art derived from the film id (swapped for real HD backdrops later).
  function art(film) {
    if (film.backdrop) return `#0d0303 url(${film.backdrop}) center/cover`;
    const h1 = hash(film.id) % 360;
    const h2 = (h1 + 40 + (hash(film.title) % 90)) % 360;
    const h3 = (h1 + 200) % 360;
    return (
      `radial-gradient(120% 130% at 16% 10%, hsl(${h1} 82% 27% / .95), transparent 55%),` +
      `radial-gradient(130% 130% at 90% 92%, hsl(${h2} 85% 26% / .95), transparent 55%),` +
      `radial-gradient(90% 90% at 62% 44%, hsl(${h3} 70% 20% / .55), transparent 60%),` +
      `linear-gradient(135deg, hsl(${h1} 55% 8%), hsl(${h2} 60% 6%))`
    );
  }
  function posterArt(film) {
    if (film.poster) return `#0d0303 url(${film.poster}) center/cover`;
    return art(film);
  }
  const fmtRuntime = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}min`.replace(' 0min', '') : null);
  const kindLabel = (k) => (k === 'series' ? 'Serie' : 'Película');

  /* ---------- active user ---------- */
  const isGuest = () => store.getUser() === 'guest';
  const currentUser = () => (isGuest() ? K.accounts.guest() : users[store.getUser()] || null);
  /** Guests can look at everything but write nothing. Returns true when the action must stop. */
  function guestBlock(action = 'guardar cambios') {
    if (!isGuest()) return false;
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-account-close></div><div class="confirm__card account-required">` +
      `<span class="account-required__icon">${icon('lock_person')}</span>` +
      `<div class="confirm__title">Necesitás una cuenta</div>` +
      `<p class="confirm__text">Para ${escapeHtml(action)} y sincronizarlo con la otra persona, creá tu perfil o iniciá sesión.</p>` +
      `<ul class="account-required__benefits"><li>${icon('sync')} Tus cambios quedan guardados</li><li>${icon('group')} Podés compartir tiers y calendarios</li></ul>` +
      `<div class="confirm__actions confirm__actions--stack"><button class="btn btn--accent" id="account-create">${icon('person_add')} Crear usuario</button>` +
      `<button class="btn btn--soft" id="account-login">${icon('login')} Iniciar sesión</button>` +
      `<button class="linklike account-required__cancel" data-account-close>Cancelar</button></div></div>`;
    el.querySelectorAll('[data-account-close]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#account-create').addEventListener('click', () => openSignup());
    el.querySelector('#account-login').addEventListener('click', () => { el.hidden = true; store.setUser(null); showGate(); });
    el.hidden = false;
    return true;
  }
  function applyAccent() {
    const u = currentUser();
    root.style.setProperty('--accent', u ? u.color : 'var(--hot)');
  }

  /* ---------- stars ---------- */
  function starsMarkup(value, size = 'sm') {
    const pct = (Math.max(0, Math.min(5, value || 0)) / 5) * 100;
    const five = icon('star').repeat(5);
    return (
      `<span class="stars stars--${size}">` +
      `<span class="stars__row stars__base">${five}</span>` +
      `<span class="stars__row stars__fill" style="width:${pct}%">${five}</span>` +
      `</span>`
    );
  }

  /* ============================================================= GATE */
  const gate = $('#gate');
  function enterAs(id) { store.setUser(id); refreshUsers(); applyAccent(); gate.hidden = true; startApp(); }
  function showGate() {
    $('#site-header').hidden = true;
    $('#app').hidden = true;
    const wrap = $('#gate-profiles');
    wrap.innerHTML = '';
    Object.values(users).forEach((u) => {
      const btn = document.createElement('button');
      btn.className = 'profile';
      btn.style.setProperty('--c', u.color);
      btn.innerHTML =
        avatarHTML(u, 'profile__avatar') +
        `<span class="profile__name">${u.name}</span>` +
        `<span class="profile__handle">@${u.handle}</span>`;
      btn.addEventListener('click', () => askPin(u, () => enterAs(u.id)));
      wrap.appendChild(btn);
    });
    const guest = document.createElement('button');
    guest.className = 'profile profile--alt';
    guest.style.setProperty('--c', '#8A8A92');
    guest.innerHTML = `<span class="profile__avatar profile__avatar--ic" style="--c:#8A8A92">${icon('visibility')}</span>` +
      `<span class="profile__name">Invitado</span><span class="profile__handle">solo mirar</span>`;
    guest.addEventListener('click', () => enterAs('guest'));
    wrap.appendChild(guest);

    const create = document.createElement('button');
    create.className = 'profile profile--alt profile--new';
    create.style.setProperty('--c', 'var(--lime)');
    create.innerHTML = `<span class="profile__avatar profile__avatar--ic" style="--c:var(--lime)">${icon('person_add')}</span>` +
      `<span class="profile__name">Crear usuario</span><span class="profile__handle">nuevo perfil</span>`;
    create.addEventListener('click', () => openSignup());
    wrap.appendChild(create);

    gate.hidden = false;
  }

  /* ---------- password gate (numeric keypad, via APPKIT) ---------- */
  function askPin(u, onOk) {
    K.pinPad({
      avatar: avatarHTML(u, 'profile__avatar'), name: u.name, color: u.color,
      label: K.accounts.hasPin(store, u.id) ? 'Ingresá tu contraseña' : 'Contraseña (por defecto 1234)',
      async onDone(pin, ctl) {
        if (await K.accounts.checkPin(store, u.id, pin)) { ctl.close(); onOk(); return; }
        ctl.fail('Contraseña incorrecta');
      },
    });
  }

  /* ---------- create user ---------- */
  const NEW_COLORS = ['#FF2E9A', '#FF2D2D', '#BBEF1F', '#22D3EE', '#7C5CFF', '#FF8A3D', '#3DDC97', '#F5C518'];
  function openSignup(onDone) {
    let photo = null;
    let color = NEW_COLORS[Math.floor(Math.random() * NEW_COLORS.length)];
    const el = $('#confirm');
    const draw = () => {
      el.innerHTML =
        `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
        `<div class="confirm__title">Crear usuario</div>` +
        `<div class="su-photo"><button class="su-photo__btn" id="su-pic" style="--c:${color}">` +
        (photo ? `<img src="${photo}" alt="">` : icon('add_a_photo')) + `</button>` +
        `<div class="su-photo__txt"><b>Foto de perfil</b><small>Elegí una de la galería (hasta 10MB) y recortala. Se guarda chiquita.</small>` +
        (photo ? `<button class="linklike" id="su-picoff">Sacar la foto</button>` : '') + `</div></div>` +
        `<label class="tl-field"><span>Nombre</span><input id="su-name" type="text" maxlength="24" placeholder="Cómo te llamás" autocomplete="off"></label>` +
        `<label class="tl-field"><span>Usuario de Letterboxd <small>(opcional)</small></span><input id="su-lb" type="text" maxlength="40" placeholder="tuusuario" autocomplete="off"></label>` +
        `<p class="confirm__text confirm__text--tight">Con eso importamos tus reseñas, likes, estrellas, watchlist y vistas en la próxima corrida del robot (máx. 24h).</p>` +
        `<div class="su-colors">${NEW_COLORS.map((c) => `<button class="su-color${c === color ? ' is-on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('')}</div>` +
        `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button>` +
        `<button class="btn btn--accent" id="su-ok">${icon('arrow_forward')} Elegir contraseña</button></div></div>`;
      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
      el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { color = b.dataset.c; draw(); }));
      el.querySelector('#su-pic').addEventListener('click', () => K.pickPhoto((data) => { photo = data; draw(); }));
      const off = el.querySelector('#su-picoff'); if (off) off.addEventListener('click', () => { photo = null; draw(); });
      el.querySelector('#su-ok').addEventListener('click', () => {
        const name = el.querySelector('#su-name').value.trim();
        const lb = el.querySelector('#su-lb').value.trim().replace(/^@/, '');
        if (!name) { el.querySelector('#su-name').focus(); K.toast('Poné un nombre.', 'bad'); return; }
        el.hidden = true;
        choosePin(name, color, photo, async (pin) => {
          const acc = await K.accounts.create(store, { name, color, lb, photo, pin });
          refreshUsers();
          K.toast(`¡Listo, ${K.esc(acc.name)}! Tu usuario ya está.`);
          if (onDone) onDone(acc); else enterAs(acc.id);
        }, () => { el.hidden = false; draw(); });
      });
      setTimeout(() => { const n = el.querySelector('#su-name'); if (n) n.focus(); }, 40);
    };
    draw();
    el.hidden = false;
  }
  /** Two-step "escribí la contraseña / repetila" on the same keypad. */
  function choosePin(name, color, photo, onOk, onCancel) {
    let first = null;
    const av = `<span class="profile__avatar" style="--c:${color}">${(name || '?').charAt(0).toUpperCase()}${photo ? `<img class="avatar__img" src="${photo}" alt="">` : ''}</span>`;
    K.pinPad({
      avatar: av, name, color, label: 'Elegí una contraseña de 4 números',
      onCancel,
      async onDone(pin, ctl) {
        if (first == null) { first = pin; ctl.next('Repetila para confirmar'); return; }
        if (pin !== first) { first = null; ctl.next('No coinciden — elegí una de nuevo'); return; }
        ctl.close();
        onOk(pin);
      },
    });
  }

  /* ============================================================= HEADER */
  // Calendario ya vive en el ícono del header (al lado del ⚡), así que no ocupa lugar en el nav.
  const NAV = [
    { id: 'home', label: 'Home' },
    { id: 'watchlist', label: 'Watchlist' },
    { id: 'tier', label: 'Tier' },
    { id: 'movies', label: 'Movies' },
    { id: 'series', label: 'Series' },
  ];
  let route = 'home';

  function renderHeader() {
    const u = currentUser();
    const header = $('#site-header');
    const pend = pendingInvites().length;
    header.innerHTML =
      `<button class="hamburger" id="hamburger" aria-label="Abrir menú">${icon('menu')}</button>` +
      `<a class="logo" href="#home" aria-label="PWM — Project Watch Movies, inicio"><b>PWM</b><span class="dot">.</span></a>` +
      `<nav class="nav" id="nav">${NAV.map((n) => `<a href="#${n.id}" data-route="${n.id}" class="${n.id === route ? 'is-active' : ''}">${n.label}</a>`).join('')}<a class="nav__x" href="prb/index.html">${icon('menu_book')} Libritos</a></nav>` +
      `<div class="header__right">` +
      `<button class="icon-btn hdr-bolt" id="hdr-bolt" title="Modo relámpago" aria-label="Modo relámpago">${icon('bolt')}</button>` +
      `<button class="icon-btn hdr-cal" id="hdr-cal" title="Calendario" aria-label="Calendario${pend ? ` · ${pend} invitación(es) nueva(s)` : ''}">${icon('calendar_month')}` +
      (pend ? `<span class="hdr-badge">+${pend}</span>` : '') + `</button>` +
      `<button class="user-chip" id="user-chip" title="Tu cuenta" aria-haspopup="true">` +
      `<span class="user-chip__name">${u ? u.name : ''}</span>` +
      (u ? avatarHTML(u) : `<span class="avatar" style="--c:var(--hot)">?</span>`) +
      `</button></div>`;

    header.querySelectorAll('[data-route]').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); setRoute(a.dataset.route); $('#nav', header).classList.remove('nav--open'); })
    );
    $('.logo', header).addEventListener('click', (e) => { e.preventDefault(); setRoute('home'); $('#nav', header).classList.remove('nav--open'); });
    $('#hamburger', header).addEventListener('click', () => $('#nav', header).classList.toggle('nav--open'));
    $('#hdr-bolt', header).addEventListener('click', openSwiper);
    $('#hdr-cal', header).addEventListener('click', () => {
      setRoute('calendario');
      if (pendingInvites().length) setTimeout(openInviteOverlay, 80);
    });
    $('#user-chip', header).addEventListener('click', openUserMenu);
    header.hidden = false;
  }

  /* ---------- account menu (avatar) ---------- */
  function openUserMenu() {
    const u = currentUser();
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-cancel></div>` +
      `<div class="usermenu"><div class="usermenu__head">${avatarHTML(u, 'avatar usermenu__av')}<div><b>${K.esc(u.name)}</b>` +
      `<small>${u.guest ? 'modo invitado' : '@' + K.esc(u.handle || u.id)}</small></div></div>` +
      (u.guest
        ? `<button class="usermenu__item" data-act="signup">${icon('person_add')} Crear usuario</button>`
        : `<button class="usermenu__item" data-act="perfil">${icon('person')} Perfil</button>` +
          `<button class="usermenu__item" data-act="config">${icon('settings')} Configuraciones</button>`) +
      `<button class="usermenu__item usermenu__item--danger" data-act="out">${icon('logout')} Cerrar sesión</button></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      el.hidden = true;
      if (a === 'perfil') setRoute('perfil');
      else if (a === 'config') setRoute('config');
      else if (a === 'signup') openSignup();
      else if (a === 'out') { stopHero(); store.clearUser(); showGate(); }
    }));
  }

  function updateNavActive() {
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.route === route));
  }

  function onScroll() {
    const solid = route !== 'home' || window.scrollY > 60;
    $('#site-header').classList.toggle('header--solid', solid);
  }

  /* ============================================================= ROUTING */
  function setRoute(r) {
    route = r;
    updateNavActive();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    renderRoute();
    onScroll();
  }

  function renderRoute() {
    stopHero();
    const app = $('#app');
    app.hidden = false;
    if (route === 'home') return renderHome(app);
    if (route === 'watchlist') return renderWatchlist(app);
    if (route === 'tier') return renderTier(app);
    if (route === 'calendario') return renderCalendario(app);
    if (route === 'perfil') return renderPerfil(app);
    if (route === 'config') return renderConfig(app);
    const cfg = {
      movies: { title: 'Movies', sub: 'Solo películas', list: watchlistFilms().filter((m) => m.kind === 'movie') },
      series: { title: 'Series', sub: 'Series de la watchlist + trending del momento', list: seriesList() },
    }[route];
    renderCatalog(app, cfg, route);
  }

  function seriesList() {
    const all = [...movies.filter((m) => m.kind === 'series'), ...trending.filter((t) => t.kind === 'series')];
    const seen = new Set();
    return all.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
  }

  /* ============================================================= HOME */
  function renderHome(app) {
    app.innerHTML = '';
    app.appendChild(buildHero());
    app.appendChild(buildTrending());
    app.appendChild(buildRecommender());
    app.appendChild(buildSecretCTA());
    app.appendChild(buildWatched());
    app.appendChild(buildFooter());
    startHero();
  }

  /* ---------- recommender (5 preguntas → 15 pelis) ---------- */
  const QUIZ = [
    { id: 'genres', q: 'Género', multi: true, opts: [
      { v: 'Acción', label: 'Acción' }, { v: 'Aventura', label: 'Aventura' }, { v: 'Ciencia ficción', label: 'Ciencia ficción' },
      { v: 'Fantasía', label: 'Fantasía' }, { v: 'Terror', label: 'Terror' }, { v: 'Suspense', label: 'Suspenso' },
      { v: 'Drama', label: 'Drama' }, { v: 'Romance', label: 'Romance' }, { v: 'Comedia', label: 'Comedia' },
      { v: 'Animación', label: 'Animación' }, { v: 'Crimen', label: 'Crimen' }, { v: 'Misterio', label: 'Misterio' },
      { v: 'Bélica', label: 'Bélica' }, { v: 'Música', label: 'Musical' }, { v: 'Historia', label: 'Histórica' }] },
    { id: 'era', q: 'Época', opts: [
      { v: 'pre80', label: 'Antes de 1980' }, { v: '80s', label: 'Años 80' }, { v: '90s', label: 'Años 90' },
      { v: '00s', label: 'Años 2000' }, { v: '10s', label: 'Años 2010' }, { v: 'recent', label: 'Últimos 5 años' }, { v: 'any', label: 'Da igual' }] },
    { id: 'dur', q: 'Duración', opts: [
      { v: 's', label: 'Cortita (≤90min)' }, { v: 'm', label: 'Media (90–120)' }, { v: 'l', label: 'Larga (120–150)' }, { v: 'xl', label: 'Épica (+150)' }, { v: 'any', label: 'Da igual' }] },
    { id: 'style', q: 'Estilo', opts: [
      { v: 'live', label: 'Con actores' }, { v: 'anime', label: 'Anime' }, { v: 'anim', label: 'Animación (otra)' }, { v: 'any', label: 'Da igual' }] },
    { id: 'imdbmin', q: 'Puntaje IMDb mínimo', opts: [
      { v: '6', label: '6+' }, { v: '7', label: '7+' }, { v: '8', label: '8+ (aclamadas)' }, { v: 'any', label: 'Cualquiera' }] },
  ];
  const answers = { genres: [], era: 'any', dur: 'any', style: 'any', imdbmin: 'any' };
  let recSource = 'watchlist'; // 'watchlist' | 'discover' (TMDB, fuera de la watchlist)

  function scoreFilm(f, a) {
    const g = f.genres || []; let s = 0;
    if (a.genres && a.genres.length) { const ov = g.filter((x) => a.genres.includes(x)).length; s += ov ? ov * 4 : -3; }
    if (a.era && a.era !== 'any') {
      const y = f.year || 0;
      const ok = { pre80: y > 0 && y < 1980, '80s': y >= 1980 && y < 1990, '90s': y >= 1990 && y < 2000, '00s': y >= 2000 && y < 2010, '10s': y >= 2010 && y < 2020, recent: y >= 2021 }[a.era];
      s += ok ? 3 : -2;
    }
    if (a.dur && a.dur !== 'any') {
      const rt = f.runtime || 0;
      const ok = { s: rt && rt <= 90, m: rt > 90 && rt <= 120, l: rt > 120 && rt <= 150, xl: rt > 150 }[a.dur];
      s += ok ? 2 : rt ? -1 : 0;
    }
    if (a.style === 'live') s += g.includes('Animación') ? -4 : 2;
    else if (a.style === 'anime') s += g.includes('Animación') && f.lang === 'ja' ? 5 : -4;
    else if (a.style === 'anim') s += g.includes('Animación') && f.lang !== 'ja' ? 5 : -3;
    if (a.imdbmin && a.imdbmin !== 'any') { const min = +a.imdbmin; s += f.imdb && f.imdb >= min ? 2 : -3; }
    return s + (f.imdb || 0) * 0.1;
  }
  function recommend(a) {
    const uid = currentUser().id;
    const seen = (f) => verdictOf(f.id, uid).rating != null;
    const base = watchlistFilms().filter((f) => !seen(f)); // don't recommend what you already watched
    const src = base.length >= 8 ? base : watchlistFilms();
    const scored = src.map((f) => ({ f, s: scoreFilm(f, a) }));
    const anyFilter = (a.genres && a.genres.length) || a.era !== 'any' || a.dur !== 'any' || a.style !== 'any' || a.imdbmin !== 'any';
    // with filters on, keep only films that actually fit; otherwise everything is fair game
    let pool = anyFilter ? scored.filter((o) => o.s > 0) : scored.slice();
    if (pool.length < 15) pool = scored.slice().sort((x, y) => y.s - x.s).slice(0, Math.max(15, pool.length));
    // rank by score + random jitter so repeated taps surface fresh (still relevant) picks
    pool.forEach((o) => (o.r = o.s + Math.random() * 4));
    return pool.sort((x, y) => y.r - x.r).slice(0, 15).map((o) => o.f);
  }

  function buildRecommender() {
    const s = document.createElement('section');
    s.className = 'section recommender';
    s.innerHTML =
      `<button class="rec-toggle" id="rec-toggle" aria-expanded="false">` +
      `<div><h3 class="section__title"><span class="accentbar">/</span> ¿No saben qué ver?</h3>` +
      `<p class="section__sub">Respondé y te tiro 15 — de la watchlist o pelis nuevas</p></div>` +
      `<span class="material-symbols-rounded rec-chev">expand_more</span></button>` +
      `<div class="rec-panel" id="rec-panel" hidden><div class="quiz">` +
      QUIZ.map((q) =>
        `<div class="quiz__q"><div class="quiz__label">${q.q}${q.multi ? ' <span class="quiz__multi">— elegí los que quieras</span>' : ''}</div>` +
        `<div class="quiz__opts" data-q="${q.id}" data-multi="${q.multi ? 1 : 0}">` +
        q.opts.map((o) => `<button class="quiz__opt" data-v="${escapeHtml(o.v)}">${o.label}</button>`).join('') +
        `</div></div>`).join('') +
      `<div class="rec-source" id="rec-source"><span class="rec-source__lbl">¿De dónde?</span>` +
      `<button class="rsrc${recSource === 'watchlist' ? ' is-on' : ''}" data-src="watchlist">${icon('bookmark')} De la watchlist</button>` +
      `<button class="rsrc${recSource === 'discover' ? ' is-on' : ''}" data-src="discover">${icon('travel_explore')} Descubrir nuevas</button></div>` +
      `<div class="quiz__actions"><button class="btn btn--accent" id="quiz-go">${icon('auto_awesome')} Recomendame 15</button>` +
      `<button class="btn btn--soft" id="quiz-reset">${icon('restart_alt')} Limpiar</button></div>` +
      `</div><div class="quiz__results" id="quiz-results"></div></div>`;

    const toggle = s.querySelector('#rec-toggle'), panel = s.querySelector('#rec-panel');
    toggle.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; toggle.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); });
    s.querySelectorAll('.quiz__opts').forEach((group) =>
      group.addEventListener('click', (e) => {
        const b = e.target.closest('.quiz__opt'); if (!b) return;
        const qid = group.dataset.q;
        if (group.dataset.multi === '1') {
          const arr = answers[qid], i = arr.indexOf(b.dataset.v);
          if (i >= 0) { arr.splice(i, 1); b.classList.remove('is-on'); } else { arr.push(b.dataset.v); b.classList.add('is-on'); }
        } else {
          answers[qid] = b.dataset.v;
          group.querySelectorAll('.quiz__opt').forEach((x) => x.classList.toggle('is-on', x === b));
        }
      }));
    const srcBar = s.querySelector('#rec-source');
    if (srcBar) srcBar.addEventListener('click', (e) => { const b = e.target.closest('[data-src]'); if (!b) return; recSource = b.dataset.src; srcBar.querySelectorAll('.rsrc').forEach((x) => x.classList.toggle('is-on', x.dataset.src === recSource)); });
    s.querySelector('#quiz-go').addEventListener('click', async () => {
      const wrap = s.querySelector('#quiz-results');
      if (recSource === 'discover') {
        if (!(WM.api && WM.api.available)) { wrap.innerHTML = `<p class="addfilm__hint">El descubrimiento necesita la API de TMDB (no está disponible ahora).</p>`; return; }
        wrap.innerHTML = `<div class="quiz__reshead">${icon('travel_explore')} Buscando pelis nuevas…</div>`;
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        try {
          const list = await WM.api.discover(answers);
          if (!list.length) { wrap.innerHTML = `<p class="addfilm__hint">No encontré pelis nuevas con esos filtros. Probá aflojar alguno.</p>`; return; }
          wrap.innerHTML = `<div class="quiz__reshead">${icon('travel_explore')} Pelis nuevas para ustedes · ${list.length}</div><div class="grid" id="quiz-grid"></div>`;
          const grid = wrap.querySelector('#quiz-grid');
          list.forEach((f) => grid.appendChild(posterCard(f)));
        } catch { wrap.innerHTML = `<p class="addfilm__hint">Error buscando en TMDB. Probá de nuevo.</p>`; }
        return;
      }
      wrap.innerHTML = `<div class="quiz__reshead">${icon('auto_awesome')} Para ustedes · 15 de la watchlist</div><div class="grid" id="quiz-grid"></div>`;
      const grid = wrap.querySelector('#quiz-grid');
      recommend(answers).forEach((f) => grid.appendChild(posterCard(f)));
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    s.querySelector('#quiz-reset').addEventListener('click', () => {
      answers.genres = []; answers.era = 'any'; answers.dur = 'any'; answers.style = 'any'; answers.imdbmin = 'any';
      s.querySelectorAll('.quiz__opt').forEach((x) => x.classList.remove('is-on'));
      s.querySelector('#quiz-results').innerHTML = '';
    });
    return s;
  }

  /* ---------- hero ---------- */
  let heroFilms = [], heroIndex = 0, heroTimer = null;

  function buildHero() {
    heroFilms = movies.filter((m) => m.featured);
    heroIndex = 0;
    const hero = document.createElement('section');
    hero.className = 'hero';
    hero.innerHTML =
      `<div class="hero__stage">${heroFilms.map((f, i) => heroSlide(f, i)).join('')}</div>` +
      `<button class="hero__arrow hero__arrow--prev" aria-label="Anterior">${icon('chevron_left')}</button>` +
      `<button class="hero__arrow hero__arrow--next" aria-label="Siguiente">${icon('chevron_right')}</button>` +
      `<div class="hero__dots">${heroFilms.map((_, i) => `<button class="hero__dot ${i === 0 ? 'is-active' : ''}" aria-label="Ir a ${i + 1}"></button>`).join('')}</div>`;

    hero.querySelector('.hero__arrow--prev').addEventListener('click', () => slideHero(-1, true));
    hero.querySelector('.hero__arrow--next').addEventListener('click', () => slideHero(1, true));
    hero.querySelectorAll('.hero__dot').forEach((d, i) => d.addEventListener('click', () => goHeroTo(i, true)));
    hero.querySelectorAll('[data-hero-rate]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openSheet(heroFilms[+b.dataset.heroRate]); }));
    hero.querySelectorAll('[data-hero-trailer]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openTrailer(heroFilms[+b.dataset.heroTrailer]); }));

    hero.addEventListener('mouseenter', () => hero.classList.add('is-paused'));
    hero.addEventListener('mouseleave', () => hero.classList.remove('is-paused'));
    return hero;
  }

  function heroSlide(f, i) {
    const meta = [kindLabel(f.kind), f.year, fmtRuntime(f.runtime), f.director]
      .filter(Boolean)
      .map((x, idx) => (idx === 0 ? `<span class="eyebrow" style="color:var(--lime)">${x}</span>` : `<span>${x}</span>`))
      .join('<span class="dot-sep">·</span>');
    const ownerUs = ownersOf(f).map((id) => users[id]).filter(Boolean);
    const ownerTag = ownerUs.length
      ? `<span class="dot-sep">·</span><span style="color:${ownerUs[0].color}">En ${ownerUs.length > 1 ? 'las listas' : 'la lista'} de ${ownerUs.map((u) => u.name).join(' y ')}</span>`
      : '';
    return (
      `<div class="hero__slide ${i === 0 ? 'is-active' : ''}" data-index="${i}">` +
      `<div class="hero__bg" style="background:${art(f)}"></div>` +
      `<div class="hero__scrim"></div>` +
      `<div class="hero__content">` +
      `<div class="hero__meta">${meta}${ownerTag}</div>` +
      `<h2 class="hero__title">${f.title}</h2>` +
      `<p class="hero__synopsis">${f.synopsis || ''}</p>` +
      `<div class="hero__scores">${scoreBadges(f)}</div>` +
      `<div class="hero__actions">` +
      `<button class="btn btn--accent" data-hero-rate="${i}">${icon('star')} Puntuar y reseñar</button>` +
      `<button class="btn btn--ghost" data-hero-trailer="${i}" ${f.trailer ? '' : 'disabled title="Trailer no disponible"'}>${icon('play_circle')} Ver trailer</button>` +
      `</div></div></div>`
    );
  }

  function slideHero(dir, manual) { goHeroTo(heroIndex + dir, manual, dir); }
  function goHeroTo(n, manual, dirHint) {
    const slides = [...document.querySelectorAll('.hero__slide')];
    if (!slides.length) return;
    const total = heroFilms.length;
    const newIndex = ((n % total) + total) % total;
    if (newIndex === heroIndex) { if (manual) restartHeroTimer(); return; }
    const dir = dirHint != null ? dirHint : newIndex > heroIndex ? 1 : -1;
    const outEl = slides[heroIndex];
    const inEl = slides[newIndex];
    // park the incoming slide off-screen on the entering side (no transition)…
    inEl.style.transition = 'none';
    inEl.style.transform = `translateX(${dir > 0 ? 100 : -100}%)`;
    inEl.style.zIndex = '3';
    outEl.style.zIndex = '2';
    void inEl.offsetWidth; // force reflow so the next change animates
    inEl.style.transition = '';
    // …then push both: old exits one way, new enters to center
    requestAnimationFrame(() => {
      outEl.style.transform = `translateX(${dir > 0 ? -100 : 100}%)`;
      inEl.style.transform = 'translateX(0)';
    });
    slides.forEach((s, i) => s.classList.toggle('is-active', i === newIndex));
    document.querySelectorAll('.hero__dot').forEach((d, i) => d.classList.toggle('is-active', i === newIndex));
    heroIndex = newIndex;
    if (manual) restartHeroTimer();
  }
  function startHero() { restartHeroTimer(); }
  function restartHeroTimer() { stopHero(); heroTimer = setInterval(() => slideHero(1, false), 7000); }
  function stopHero() { if (heroTimer) clearInterval(heroTimer); heroTimer = null; }

  function scoreBadges(f) {
    let out = '';
    if (f.imdb != null) out += `<span class="score score--imdb">${icon('star')}<b>${f.imdb.toFixed(1)}</b><span class="score__tag">IMDb</span></span>`;
    if (f.rt != null) out += `<span class="score score--rt">${icon(f.rt >= 60 ? 'sentiment_very_satisfied' : 'sentiment_dissatisfied')}<b>${f.rt}%</b><span class="score__tag">RT</span></span>`;
    return out;
  }

  /* ---------- trending ---------- */
  function buildTrending() {
    const s = document.createElement('section');
    s.className = 'section';
    s.innerHTML =
      `<div class="section__head"><div>` +
      `<h3 class="section__title"><span class="accentbar">/</span> Trending del momento</h3>` +
      `<p class="section__sub">Pelis y series que están pegando ahora · muestra hasta conectar TMDB</p>` +
      `</div></div><div class="row" id="trend-row"></div>`;
    const row = s.querySelector('#trend-row');
    trending.forEach((t) => row.appendChild(posterCard(t, { rank: t.rank })));
    return s;
  }

  /* ---------- watched ---------- */
  function buildWatched() {
    const s = document.createElement('section');
    s.className = 'section';
    const watched = movies.filter((f) => Object.values(users).some((u) => {
      const v = verdictOf(f.id, u.id); return v.rating != null || v.review || v.liked;
    }));
    s.innerHTML =
      `<div class="section__head"><div>` +
      `<h3 class="section__title"><span class="accentbar">/</span> Ya vimos</h3>` +
      `<p class="section__sub">Lo que vimos y puntuamos — de la app y de Letterboxd</p>` +
      `</div></div>`;
    if (!watched.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.innerHTML = `${icon('reviews')}<p>Todavía no puntuaron nada.<br>Abrí una peli y tirale estrellas — va a aparecer acá.</p>`;
      s.appendChild(e);
    } else {
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))';
      watched
        .sort((a, b) => latestTs(b.id) - latestTs(a.id))
        .forEach((f) => grid.appendChild(watchedCard(f)));
      s.appendChild(grid);
    }
    return s;
  }
  function latestTs(id) {
    return Object.values(users).reduce((mx, u) => {
      const t = store.get(id, u.id).updatedAt;
      return t ? Math.max(mx, Date.parse(t)) : mx;
    }, 0);
  }

  function watchedCard(f) {
    const card = document.createElement('article');
    card.className = 'watched';
    const verdicts = Object.values(users)
      .map((u) => {
        const e = verdictOf(f.id, u.id);
        const rated = typeof e.rating === 'number';
        const has = rated || e.review || e.liked;
        if (!has) return '';
        const stars = rated
          ? `${starsMarkup(e.rating, 'sm')}<span class="stars-value">${e.rating.toFixed(1)}</span>`
          : `<span class="verdict__none">sin puntaje</span>`;
        const heart = e.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '';
        const review = e.review ? `<p class="verdict__review">“${escapeHtml(e.review)}”</p>` : '';
        return (
          `<div class="verdict">` +
          avatarHTML(u, 'avatar verdict__avatar') +
          `<div class="verdict__main"><div class="verdict__row"><span class="verdict__name">${u.name}</span>${stars}${heart}</div>${review}${watchMetaLine(f, u.id)}</div>` +
          `</div>`
        );
      })
      .join('');
    card.innerHTML =
      `<div class="watched__poster"><div class="poster__img" style="background:${posterArt(f)}"></div></div>` +
      `<div class="watched__body">` +
      `<div class="watched__title">${f.title}</div>` +
      `<div class="watched__year">${[f.year, f.director].filter(Boolean).join(' · ')}</div>` +
      `<div class="verdicts">${verdicts || '<span class="verdict__none">Puntuada, sin reseña</span>'}</div>` +
      `</div>`;
    card.addEventListener('click', () => openSheet(f));
    card.style.cursor = 'pointer';
    return card;
  }

  /* ---------- grid views ---------- */
  function renderGrid(app, cfg) {
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    s.innerHTML =
      `<div class="section__head"><div>` +
      `<h3 class="section__title">${cfg.title}</h3>` +
      `<p class="section__sub">${cfg.sub} · ${cfg.list.length} títulos</p>` +
      `</div></div><div class="grid" id="grid"></div>`;
    const grid = s.querySelector('#grid');
    cfg.list.forEach((f) => grid.appendChild(posterCard(f)));
    app.appendChild(s);
    app.appendChild(buildFooter());
  }

  /* ---------- catalog (Movies / Series) with genre filters + discover ---------- */
  const catState = { movies: 'Todos', series: 'Todos' };
  const catSource = { movies: 'watchlist', series: 'watchlist' };   // 'watchlist' | 'discover'
  const catPage = { movies: 1, series: 1 };
  function renderCatalog(app, cfg, key) {
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    const freq = {};
    cfg.list.forEach((f) => (f.genres || []).forEach((g) => (freq[g] = (freq[g] || 0) + 1)));
    const genres = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 10);
    const hasAnime = cfg.list.some((f) => (f.genres || []).includes('Animación') && f.lang === 'ja');
    const chips = ['Todos', ...(hasAnime ? ['Anime'] : []), ...genres];
    if (!chips.includes(catState[key])) catState[key] = 'Todos';
    const discovering = () => catSource[key] === 'discover';
    s.innerHTML =
      `<div class="section__head section__head--search"><div><h3 class="section__title">${cfg.title}</h3>` +
      `<p class="section__sub" id="cat-sub">${cfg.sub} · ${cfg.list.length} títulos</p></div>` +
      `<div class="section__tools"><div class="srctoggle" id="cat-src" role="group" aria-label="De dónde">` +
      `<button class="srcbtn${!discovering() ? ' is-on' : ''}" data-src="watchlist">${icon('bookmark')} Watchlist</button>` +
      `<button class="srcbtn${discovering() ? ' is-on' : ''}" data-src="discover">${icon('travel_explore')} Descubrir nuevos</button>` +
      `</div></div></div>` +
      `<div class="genrebar" id="genrebar">${chips.map((g) => `<button class="genre${catState[key] === g ? ' is-on' : ''}" data-g="${escapeHtml(g)}">${g}</button>`).join('')}</div>` +
      `<div class="grid" id="grid"></div><div class="cat-more" id="cat-more" hidden></div>`;
    app.appendChild(s);
    app.appendChild(buildFooter());
    const grid = s.querySelector('#grid');
    const sub = s.querySelector('#cat-sub');
    const more = s.querySelector('#cat-more');

    const fillLocal = () => {
      more.hidden = true;
      grid.innerHTML = '';
      const g = catState[key];
      let list = cfg.list;
      if (g === 'Anime') list = cfg.list.filter((f) => (f.genres || []).includes('Animación') && f.lang === 'ja');
      else if (g !== 'Todos') list = cfg.list.filter((f) => (f.genres || []).includes(g));
      sub.textContent = `${cfg.sub} · ${list.length} títulos`;
      if (!list.length) { grid.innerHTML = `<div class="empty">${icon('theaters')}<p>Nada en “${g}”.</p></div>`; return; }
      list.forEach((f) => grid.appendChild(posterCard(f)));
    };

    let loading = false;
    const fillDiscover = async (append) => {
      if (loading) return;
      if (!(WM.api && WM.api.available)) { grid.innerHTML = `<div class="empty">${icon('cloud_off')}<p>Descubrir necesita la API de TMDB.</p></div>`; return; }
      loading = true;
      if (!append) { catPage[key] = 1; grid.innerHTML = `<div class="empty">${icon('travel_explore')}<p>Buscando ${cfg.title.toLowerCase()} nuevas…</p></div>`; }
      more.hidden = true;
      try {
        const list = await WM.api.discoverCatalog({ kind: key === 'series' ? 'series' : 'movie', genre: catState[key], page: catPage[key] });
        // don't re-show what's already on the watchlist / already imported
        const fresh = list.filter((f) => !movies.some((m) => m.id === f.id || (m.tmdb && m.tmdb === f.tmdb && m.kind === f.kind)));
        if (!append) grid.innerHTML = '';
        if (!fresh.length && !append) { grid.innerHTML = `<div class="empty">${icon('travel_explore')}<p>No encontré nada nuevo en “${catState[key]}”.</p></div>`; }
        fresh.forEach((f) => grid.appendChild(posterCard(f)));
        sub.textContent = `Títulos nuevos de TMDB${catState[key] !== 'Todos' ? ` · ${catState[key]}` : ''} · página ${catPage[key]}`;
        more.hidden = false;
        more.innerHTML = `<button class="btn btn--soft" id="cat-more-btn">${icon('expand_more')} Traer más</button>`;
        more.querySelector('#cat-more-btn').addEventListener('click', () => { catPage[key]++; fillDiscover(true); });
      } catch {
        if (!append) grid.innerHTML = `<div class="empty">${icon('error')}<p>Error hablando con TMDB. Probá de nuevo.</p></div>`;
      }
      loading = false;
    };

    const fill = () => (discovering() ? fillDiscover(false) : fillLocal());
    const swapSource = () => {
      grid.classList.add('catalog-grid--out');
      setTimeout(() => {
        fill();
        grid.classList.remove('catalog-grid--out');
        grid.classList.add('catalog-grid--in');
        setTimeout(() => grid.classList.remove('catalog-grid--in'), 420);
      }, 150);
    };
    s.querySelector('#cat-src').addEventListener('click', (e) => {
      const b = e.target.closest('[data-src]'); if (!b) return;
      if (b.dataset.src === catSource[key]) return;
      catSource[key] = b.dataset.src;
      s.querySelectorAll('.srcbtn').forEach((x) => x.classList.toggle('is-on', x.dataset.src === catSource[key]));
      swapSource();
    });
    s.querySelector('#genrebar').addEventListener('click', (e) => {
      const b = e.target.closest('.genre'); if (!b) return;
      catState[key] = b.dataset.g;
      s.querySelectorAll('.genre').forEach((x) => x.classList.toggle('is-on', x === b));
      fill();
    });
    fill();
  }

  /* ============================================================= WATCHLIST (priority order) */
  function orderedWatchlist() {
    const pos = new Map(store.getOrder().map((id, i) => [id, i]));
    return watchlistFilms().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : Infinity) - (pos.has(b.id) ? pos.get(b.id) : Infinity));
  }

  let wlQuery = '';
  let watchlistView = 'list';   // 'list' | 'grid'
  let wlOwner = 'all';          // 'all' | <user id> — 'both' films always show
  /** Who can own a watchlist entry: the users that actually appear as owners, in user order. */
  function watchlistOwners() {
    const present = new Set(watchlistFilms().flatMap(ownersOf));
    return Object.values(users).filter((u) => present.has(u.id));
  }
  function ownerFilterHTML() {
    const owners = watchlistOwners();
    if (owners.length < 2) return '';
    return `<div class="genrebar ownerbar" id="wl-owner">` +
      `<button class="genre${wlOwner === 'all' ? ' is-on' : ''}" data-own="all">Todas</button>` +
      owners.map((u) => `<button class="genre${wlOwner === u.id ? ' is-on' : ''}" data-own="${u.id}" style="--c:${u.color}">${escapeHtml(u.name)}</button>`).join('') +
      `</div>`;
  }
  function renderWatchlist(app) {
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    s.innerHTML =
      `<div class="section__head section__head--search"><div>` +
      `<h3 class="section__title">Watchlist</h3>` +
      `<p class="section__sub">Ordenada por prioridad · ${watchlistFilms().length} títulos</p></div>` +
      `<div class="section__tools">` +
      `<div class="viewtoggle" id="view-toggle" role="group" aria-label="Cómo verlo">` +
      `<button class="vtbtn${watchlistView === 'list' ? ' is-on' : ''}" data-view="list" title="Lista">${icon('view_list')}</button>` +
      `<button class="vtbtn${watchlistView === 'grid' ? ' is-on' : ''}" data-view="grid" title="Grilla">${icon('grid_view')}</button></div>` +
      `<label class="search"><span class="material-symbols-rounded">search</span>` +
      `<input id="wl-search" type="search" placeholder="Buscar en la watchlist…" value="${escapeHtml(wlQuery)}"></label></div></div>` +
      ownerFilterHTML() +
      `<p class="plist__hint" id="pl-hint"></p>` +
      `<div class="plist" id="plist"></div>`;
    app.appendChild(s);
    app.appendChild(buildFooter());
    const input = s.querySelector('#wl-search');
    input.addEventListener('input', () => { wlQuery = input.value; fillPlist(); });
    s.querySelector('#view-toggle').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (!b) return; watchlistView = b.dataset.view; s.querySelectorAll('.vtbtn').forEach((x) => x.classList.toggle('is-on', x.dataset.view === watchlistView)); fillPlist(); });
    const ob = s.querySelector('#wl-owner');
    if (ob) ob.addEventListener('click', (e) => { const b = e.target.closest('[data-own]'); if (!b) return; wlOwner = b.dataset.own; ob.querySelectorAll('.genre').forEach((x) => x.classList.toggle('is-on', x.dataset.own === wlOwner)); fillPlist(); });
    enableReorder(s.querySelector('#plist'));
    fillPlist();
  }

  const wlFiltered = () => wlQuery.trim() !== '' || wlOwner !== 'all';
  function fillPlist() {
    const plist = document.getElementById('plist'); if (!plist) return;
    plist.innerHTML = '';
    const hint = document.getElementById('pl-hint');
    const full = orderedWatchlist();
    const rankOf = new Map(full.map((f, i) => [f.id, i + 1]));
    const q = wlQuery.trim().toLowerCase();
    let list = q ? full.filter((f) => f.title.toLowerCase().includes(q)) : full;
    if (wlOwner !== 'all') list = list.filter((f) => ownersOf(f).includes(wlOwner));
    plist.classList.toggle('plist--grid', watchlistView === 'grid');
    if (hint) hint.innerHTML = watchlistView === 'grid'
      ? `${icon('grid_view')} En orden de prioridad. Para reordenar, cambiá a vista lista.`
      : wlFiltered()
        ? `${icon('filter_alt')} Filtrada — sacá el filtro para poder reordenar.`
        : `${icon('drag_indicator')} Arrastrá para ordenar, o tocá el número y escribí la posición. El orden es compartido.`;
    if (!list.length) {
      const who = wlOwner !== 'all' ? ` de ${escapeHtml(ownerName(wlOwner))}` : '';
      plist.innerHTML = `<div class="empty">${icon('search_off')}<p>Nada${q ? ` con “${escapeHtml(wlQuery)}”` : ''}${who}.</p></div>`;
      return;
    }
    if (watchlistView === 'grid') { list.forEach((f) => plist.appendChild(plGridCell(f, rankOf.get(f.id)))); return; }
    list.forEach((f) => plist.appendChild(plRow(f, rankOf.get(f.id), full.length)));
  }
  function plGridCell(f, rank) {
    const cell = document.createElement('button'); cell.className = 'plcell'; cell.dataset.id = f.id; cell.title = `${rank}. ${f.title}`;
    cell.innerHTML = `<span class="plcell__rank">${rank}</span><div class="plcell__img" style="background:${posterArt(f)}"></div>` +
      ownerBadge(f, 'plcell__owner') + `<span class="plcell__t">${escapeHtml(f.title)}</span>`;
    cell.addEventListener('click', () => openSheet(f));
    return cell;
  }

  function setPriority(filmId, newPos, total) {
    if (guestBlock()) { fillPlist(); return; }
    const cur = orderedWatchlist().map((f) => f.id);
    const from = cur.indexOf(filmId); if (from < 0) return;
    cur.splice(from, 1);
    const to = Math.max(0, Math.min(cur.length, (parseInt(newPos, 10) || 1) - 1));
    cur.splice(to, 0, filmId);
    store.setOrder(cur);
    fillPlist();
  }

  function ownerBadge(f, cls) {
    const own = ownersOf(f).map((id) => users[id]).filter(Boolean);
    if (own.length > 1) {
      const a = own[0].color, b = (own[1] || own[0]).color;
      return `<span class="${cls}" style="background:linear-gradient(135deg,${a},${b})" title="Listas de ${own.map((u) => escapeHtml(u.name)).join(' y ')}">✦</span>`;
    }
    const u = own[0];
    return u ? `<span class="${cls}" style="background:${u.color}" title="Lista de ${escapeHtml(u.name)}">${u.initial}</span>` : '';
  }

  function plRow(f, rank, total) {
    const row = document.createElement('div');
    row.className = 'plitem';
    row.draggable = true;
    row.dataset.id = f.id;
    row.innerHTML =
      `<input class="plitem__rankin" type="number" min="1" max="${total}" value="${rank}" title="Escribí la posición" aria-label="Posición de prioridad">` +
      `<div class="plitem__poster"><div class="chip__img" style="background:${posterArt(f)}"></div></div>` +
      `<div class="plitem__body"><div class="plitem__title">${f.title}</div>` +
      `<div class="plitem__meta"><span>${f.year || ''}</span>` +
      (f.imdb != null ? `<span class="imdb">★ ${f.imdb.toFixed(1)}</span>` : '') +
      (f.rt != null ? `<span class="rt">🍅 ${f.rt}%</span>` : '') + `</div></div>` +
      ownerBadge(f, 'plitem__owner') +
      `<div class="plitem__handle">${icon('drag_indicator')}</div>`;
    const input = row.querySelector('.plitem__rankin');
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => setPriority(f.id, input.value, total));
    row.addEventListener('click', (e) => { if (e.target === input) return; if (!row.dataset.dragged) openSheet(f); });
    return row;
  }

  function enableReorder(container) {
    let dragEl = null;
    container.addEventListener('dragstart', (e) => {
      if (wlFiltered() || isGuest()) { e.preventDefault(); return; } // no reorder while filtering (or as guest)
      const item = e.target.closest('.plitem'); if (!item) return;
      dragEl = item; item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', item.dataset.id); } catch {}
    });
    container.addEventListener('dragover', (e) => {
      if (!dragEl) return;
      e.preventDefault();
      const after = getDragAfterElement(container, e.clientY);
      if (after == null) container.appendChild(dragEl);
      else container.insertBefore(dragEl, after);
    });
    container.addEventListener('dragend', () => {
      if (!dragEl) return;
      dragEl.classList.remove('dragging');
      dragEl.dataset.dragged = '1';
      const el = dragEl; setTimeout(() => delete el.dataset.dragged, 60);
      dragEl = null;
      const rows = [...container.querySelectorAll('.plitem')];
      store.setOrder(rows.map((n) => n.dataset.id));
      rows.forEach((n, i) => { const inp = n.querySelector('.plitem__rankin'); if (inp) inp.value = i + 1; });
    });
  }
  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.plitem:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
    }, { offset: -Infinity, element: null }).element;
  }

  /* ============================================================= TIER LIST
   * Rows are per-board config now (rename / add / remove / recolor), stored in settings.tierrows.
   * A board with nothing saved falls back to these defaults, coloured by the lime→red ramp. */
  const TIER_DEFAULTS = [
    { id: 'prime', label: 'PRIME', sub: 'lo mejor' },
    { id: 'buena', label: 'Muy buena', sub: '' },
    { id: 'nifu', label: 'Buena', sub: '' },
    { id: 'meh', label: 'Ni fu ni fa', sub: 'del montón' },
    { id: 'basura', label: 'Basura', sub: 'ni ahí' },
  ];
  const TIER_RAMP = ['#BBEF1F', '#8BE04A', '#F5C518', '#FF8A3D', '#FF2D2D'];
  /** Resolved rows (colors filled in) for a board. */
  const rowsOf = (B) => K.tierRows(store, B.id, TIER_DEFAULTS, TIER_RAMP);
  /** Raw rows as saved (color:null = automatic) — what the editor needs. */
  const rawRowsOf = (B) => store.getTierRows(B.id) || TIER_DEFAULTS.map((d) => ({ id: d.id, label: d.label, sub: d.sub || '', color: null }));
  let tierFilter = 'all';
  const TIER_FILTERS = [{ id: 'all', label: 'Todas' }, { id: 'r3', label: '3★ o más' }, { id: 'r4', label: '4★ o más' }, { id: 'likes', label: 'Solo ❤' }];
  function passesTierFilter(f, B) {
    if (tierFilter === 'all') return true;
    const ids = B.kind === 'shared' ? Object.values(users).map((u) => u.id) : [B.owner];
    return ids.some((uid) => {
      const vv = verdictOf(f.id, uid);
      if (tierFilter === 'r3') return vv.rating != null && vv.rating >= 3;
      if (tierFilter === 'r4') return vv.rating != null && vv.rating >= 4;
      if (tierFilter === 'likes') return vv.liked;
      return true;
    });
  }

  /* ---------- tier boards (default per-user + custom/shared lists) ---------- */
  let tierBoardId = null;
  const ownerName = (uid) => (users[uid] || {}).name || '';
  function currentBoards() {
    const me = currentUser();
    const others = Object.values(users).filter((x) => x.id !== me.id);
    const list = [];
    // a guest has no board of their own — they get everyone else's, read-only
    if (!me.guest) list.push({ id: 'def:' + me.id, type: 'default', kind: 'personal', owner: me.id, members: [me.id], name: 'Mi tier', editable: true });
    others.forEach((o) => list.push({ id: 'def:' + o.id, type: 'default', kind: 'personal', owner: o.id, members: [o.id], name: 'Tier de ' + o.name, editable: false }));
    store.getTierlists().forEach((l) => {
      const members = l.kind === 'shared' ? (Array.isArray(l.members) && l.members.length ? l.members : Object.values(users).map((u) => u.id)) : [l.owner];
      list.push({ id: l.id, type: 'custom', kind: l.kind, owner: l.owner || null, members, name: l.name, editable: !me.guest && members.includes(me.id) });
    });
    return list;
  }
  function userThumb(uid) { const p = PHOTOS[uid]; return p ? `#0d0303 url(${p}) center/cover` : ((users[uid] || {}).color || 'var(--surface-2)'); }
  function openTierOthers(app, others) {
    openPickSheet('Tier lists de otros', () => others.map((b) => ({
      thumb: userThumb(b.owner),
      label: `${b.name}${b.kind === 'shared' ? ' · compartida' : ''} — ${ownerName(b.owner)}`,
      check: b.id === tierBoardId,
      onClick: () => { tierBoardId = b.id; closePickSheet(); renderTier(app); },
    })));
  }
  function boardGet(B, id) { return B.type === 'default' ? store.getTier(id, B.owner) : store.getListTier(B.id, id); }
  function boardSet(B, id, tier) { if (B.type === 'default') store.setTier(id, B.owner, tier); else store.setListTier(B.id, id, tier); }
  function boardEligible(B) {
    const placed = (f) => boardGet(B, f.id);
    if (B.kind === 'shared') { const mem = B.members || Object.values(users).map((u) => u.id); return movies.filter((f) => mem.some((uid) => verdictOf(f.id, uid).rating != null) || f.extra || placed(f)); }
    return movies.filter((f) => verdictOf(f.id, B.owner).rating != null || (B.type === 'default' && store.getTier(f.id, B.owner)) || f.extra || placed(f));
  }

  function renderTier(app) {
    const me = currentUser();
    const boards = currentBoards();
    let B = boards.find((b) => b.id === tierBoardId) || boards[0];
    tierBoardId = B.id;
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    const mine = boards.filter((b) => b.editable);
    const others = boards.filter((b) => !b.editable);
    const sub = B.type === 'default'
      ? (B.editable ? `El ranking de <b style="color:${me.color}">vos (${me.name})</b>` : `Mirando el tier de <b style="color:${(users[B.owner] || {}).color}">${ownerName(B.owner)}</b> · solo lectura`)
      : (B.kind === 'shared' ? `Tier <b>compartida</b> — la editan ${B.members.map(ownerName).join(' y ')}${B.editable ? '' : ' · vos solo mirás'}` : `Tier <b>personal</b> de ${ownerName(B.owner)}${B.editable ? '' : ' · solo lectura'}`);
    const rows = rowsOf(B);
    s.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">Tier list</h3><p class="section__sub">${sub}</p></div></div>` +
      `<div class="tier-switch" id="tier-switch">` +
      mine.map((b) => `<button class="tswitch${b.id === B.id ? ' is-on' : ''}" data-board="${b.id}">${b.kind === 'shared' ? icon('group') : ''}${escapeHtml(b.name)}</button>`).join('') +
      `<button class="tswitch tswitch--add" id="tier-new">${icon('add')} Nueva</button>` +
      (others.length ? `<button class="tswitch tswitch--others${!B.editable ? ' is-on' : ''}" id="tier-others">${icon('visibility')} ${!B.editable ? escapeHtml(B.name) : 'Ver tier de otros'}</button>` : '') +
      `</div>` +
      `<div class="tier-toolbar">` +
      (B.editable ? `<button class="btn btn--soft btn--xs" id="tl-rows">${icon('table_rows')} Editar filas</button>` : '') +
      (B.type === 'custom' && B.editable ? `<button class="btn btn--soft btn--xs" id="tl-rename">${icon('edit')} Renombrar</button><button class="btn btn--soft btn--xs" id="tl-del">${icon('delete')} Borrar lista</button>` : '') +
      `<button class="btn btn--soft btn--xs tl-share" id="tl-share">${icon('ios_share')} Compartir</button>` +
      `</div>` +
      (B.editable ? `<p class="tier-hint">${icon('touch_app')} ${isTouch() ? 'Tocá un tier para elegir qué peli poner ahí; tocá una peli ya puesta para moverla.' : 'Arrastrá pósters al tier que merezcan (o tocá una peli para moverla).'}</p>` : '') +
      `<div class="tier-board" id="tier-board">` +
      rows.map((t, i) =>
        (i ? `<button class="tier-insert" data-tier-insert="${i}" aria-label="Agregar una fila entre ${escapeHtml(rows[i - 1].label)} y ${escapeHtml(t.label)}">${icon('add')}</button>` : '') +
        `<div class="tier"><button class="tier__label${B.editable ? ' tier__label--editable' : ''}" data-tier-row="${escapeHtml(t.id)}" style="--c:${t.color}"${B.editable ? ` title="Editar nombre y color de ${escapeHtml(t.label)}"` : ' disabled'}><b>${escapeHtml(t.label)}</b>${t.sub ? `<small>${escapeHtml(t.sub)}</small>` : ''}</button><div class="tier__drop" data-tier="${escapeHtml(t.id)}"></div></div>`
      ).join('') +
      `</div>` +
      `<div class="genrebar tier-filter" id="tier-filter">${TIER_FILTERS.map((f) => `<button class="genre${tierFilter === f.id ? ' is-on' : ''}" data-tf="${f.id}">${f.label}</button>`).join('')}</div>` +
      `<div class="tier-pool"><div class="tier-pool__head">Sin ubicar <span class="tier-pool__note">— ${B.kind === 'shared' ? 'las que vio cualquiera de los dos' : (B.editable ? 'las que ya viste (Letterboxd o app) o agregaste' : `las que ${ownerName(B.owner)} vio`)}</span></div><div class="tier-pool__drop" id="tier-pool" data-tier=""></div></div>` +
      (B.editable ? `<div class="tier-add"><button class="btn btn--soft" id="tier-add-btn">${icon('add_circle')} Agregar peli</button></div>` : '');
    app.appendChild(s);
    app.appendChild(buildFooter());
    s.querySelector('#tier-switch').addEventListener('click', (e) => { const btn = e.target.closest('[data-board]'); if (!btn) return; tierBoardId = btn.dataset.board; renderTier(app); });
    s.querySelector('#tier-new').addEventListener('click', () => { if (!guestBlock()) openTierlistModal(app, null); });
    const othersBtn = s.querySelector('#tier-others'); if (othersBtn) othersBtn.addEventListener('click', () => openTierOthers(app, others));
    const rn = s.querySelector('#tl-rename'); if (rn) rn.addEventListener('click', () => openTierlistModal(app, B));
    const dl = s.querySelector('#tl-del'); if (dl) dl.addEventListener('click', () => deleteTierlist(app, B));
    const rw = s.querySelector('#tl-rows'); if (rw) rw.addEventListener('click', () => openRowsEditor(app, B));
    if (B.editable) {
      s.querySelectorAll('[data-tier-row]').forEach((label) => label.addEventListener('click', () => beginInlineTierEdit(app, B, label)));
      s.querySelectorAll('[data-tier-insert]').forEach((btn) => btn.addEventListener('click', () => insertTierRow(app, B, +btn.dataset.tierInsert)));
    }
    s.querySelector('#tl-share').addEventListener('click', () => shareTier(B));
    s.querySelector('#tier-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-tf]'); if (!b) return; tierFilter = b.dataset.tf; s.querySelectorAll('#tier-filter .genre').forEach((x) => x.classList.toggle('is-on', x.dataset.tf === tierFilter)); fillTier(B); });
    if (B.editable) s.querySelector('#tier-add-btn').addEventListener('click', () => openAddFilm(() => { closeAddFilm(); fillTier(B); }));
    if (B.editable && isTouch()) {
      s.querySelectorAll('.tier__drop').forEach((drop) => drop.addEventListener('click', (e) => { if (e.target.closest('.chip')) return; openTierPicker(drop.dataset.tier, B); }));
      s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip) openChipMenu(chip.dataset.id, B); });
    } else {
      s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip && !chip.classList.contains('dragging')) { const f = byId(chip.dataset.id); if (f) openSheet(f); } });
    }
    fillTier(B);
    if (B.editable && !isTouch()) enableTierDnD(B);
  }
  function beginInlineTierEdit(app, B, label) {
    if (label.classList.contains('is-editing') || guestBlock('editar esta fila')) return;
    const rows = rawRowsOf(B);
    const i = rows.findIndex((r) => r.id === label.dataset.tierRow);
    if (i < 0) return;
    const row = rows[i];
    const resolved = rowsOf(B).find((r) => r.id === row.id);
    let color = row.color || (resolved && resolved.color) || TIER_RAMP[Math.min(i, TIER_RAMP.length - 1)];
    let colorTouched = !!row.color;
    label.classList.add('is-editing');
    label.innerHTML =
      `<input class="tier-inline__name" type="text" maxlength="28" value="${escapeHtml(row.label)}" aria-label="Nombre de la fila">` +
      `<span class="tier-inline__tools"><label class="tier-inline__color" title="Color"><input type="color" value="${color}" aria-label="Color de la fila"><span style="--row-color:${color}"></span></label>` +
      `<span class="tier-inline__done" role="button" tabindex="0" aria-label="Guardar">${icon('check')}</span></span>`;
    const name = label.querySelector('.tier-inline__name');
    const picker = label.querySelector('input[type="color"]');
    const done = label.querySelector('.tier-inline__done');
    const save = () => {
      const next = name.value.trim();
      if (!next) { name.focus(); return; }
      rows[i] = { ...row, label: next, color: colorTouched ? color : row.color || null };
      store.saveTierRows(B.id, rows);
      renderTier(app);
    };
    picker.addEventListener('input', () => {
      color = picker.value; colorTouched = true; label.style.setProperty('--c', color);
      label.querySelector('.tier-inline__color span').style.setProperty('--row-color', color);
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); renderTier(app); }
    });
    done.addEventListener('click', (e) => { e.stopPropagation(); save(); });
    done.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(); } });
    setTimeout(() => { name.focus(); name.select(); }, 20);
  }
  function insertTierRow(app, B, index) {
    if (guestBlock('agregar una fila')) return;
    const rows = rawRowsOf(B);
    const id = 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    rows.splice(index, 0, { id, label: 'Nueva fila', sub: '', color: null });
    store.saveTierRows(B.id, rows);
    renderTier(app);
    setTimeout(() => {
      const label = document.querySelector(`[data-tier-row="${id}"]`);
      if (label) beginInlineTierEdit(app, B, label);
    }, 30);
  }
  /* ---------- tier rows: rename / add / remove / recolor ---------- */
  function openRowsEditor(app, B) {
    if (guestBlock()) return;
    K.openRowEditor({
      host: $('#confirm'), boardName: B.name, ramp: TIER_RAMP,
      rows: rawRowsOf(B).map((r) => ({ ...r, rawColor: r.color || null })),
      onReset: () => { store.clearTierRows(B.id); renderTier(app); },
      onSave: (rows, gone) => {
        store.saveTierRows(B.id, rows);
        // whatever lived in a row that no longer exists goes back to "Sin ubicar"
        if (gone.length) boardEligible(B).forEach((f) => { if (gone.includes(boardGet(B, f.id))) boardSet(B, f.id, null); });
        renderTier(app);
      },
    });
  }

  /* ---------- share the board as an image ---------- */
  function shareTier(B) {
    const rows = rowsOf(B);
    const title = B.name;
    const subtitle = B.type === 'default'
      ? 'Ranking personal'
      : (B.kind === 'shared' ? `Compartida · ${B.members.map(ownerName).join(' y ')}` : `Personal · ${ownerName(B.owner)}`);
    K.openShareBoard($('#confirm'), () => {
      const byRow = {};
      rows.forEach((r) => (byRow[r.id] = []));
      boardEligible(B).forEach((f) => { const t = boardGet(B, f.id); if (t && byRow[t]) byRow[t].push({ title: f.title, img: f.poster || null }); });
      return {
        brand: 'PWM', title, subtitle,
        bg: '#0d0303', ink: '#eff8ff', accent: '#bbef1f',
        rows: rows.map((r) => ({ label: r.label, color: r.color, items: byRow[r.id] })),
        fileName: 'pwm-' + title,
      };
    });
  }

  /* ---------- tier list create / rename / delete ---------- */
  function openTierlistModal(app, B) {
    const editing = !!B; const me = currentUser();
    const others = Object.values(users).filter((x) => x.id !== me.id);
    let kind = editing ? B.kind : 'personal';
    const members = new Set(editing && Array.isArray(B.members) ? B.members.filter((id) => id !== me.id) : others.map((o) => o.id));
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
      `<div class="confirm__title">${editing ? 'Editar tier list' : 'Nueva tier list'}</div>` +
      `<label class="tl-field"><span>Nombre</span><input id="tl-name" type="text" maxlength="40" placeholder="Ej: Comedias, Favoritas…" value="${editing ? escapeHtml(B.name) : ''}"></label>` +
      (editing ? '' : `<div class="tl-kind"><button class="tl-kopt is-on" data-kind="personal">${icon('person')} Personal<small>solo la armás vos</small></button><button class="tl-kopt" data-kind="shared">${icon('group')} Compartida<small>la editan los miembros que elijas</small></button></div>`) +
      `<div class="tl-members" id="tl-members"${(editing && kind === 'shared') ? '' : ' hidden'}><div class="tl-members__lbl">¿Con quién la compartís? (la editan vos + ellos; el resto solo la ve)</div>${others.map((o) => `<button class="tl-member${members.has(o.id) ? ' is-on' : ''}" data-member="${o.id}">${avatarHTML(o, 'avatar tl-member__av')} ${o.name}</button>`).join('')}</div>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="tl-ok">${icon('check')} ${editing ? 'Guardar' : 'Crear'}</button></div></div>`;
    el.hidden = false;
    const nameInput = el.querySelector('#tl-name'); setTimeout(() => nameInput.focus(), 40);
    const membersBox = el.querySelector('#tl-members');
    el.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; el.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('is-on', x === b)); if (membersBox) membersBox.hidden = kind !== 'shared'; }));
    el.querySelectorAll('[data-member]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.member; if (members.has(id)) members.delete(id); else members.add(id); b.classList.toggle('is-on', members.has(id)); }));
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    const commit = () => {
      const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
      if (editing) { store.saveTierlists(store.getTierlists().map((l) => (l.id === B.id ? { ...l, name, members: l.kind === 'shared' ? [me.id, ...members] : l.members } : l))); }
      else { const id = 'tl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); const rec = { id, name, kind, owner: me.id }; if (kind === 'shared') rec.members = [me.id, ...members]; store.saveTierlists([...store.getTierlists(), rec]); tierBoardId = id; }
      el.hidden = true; renderTier(app);
    };
    el.querySelector('#tl-ok').addEventListener('click', commit);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
  }
  function deleteTierlist(app, B) {
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">¿Borrar “${escapeHtml(B.name)}”?</div><p class="confirm__text">Se pierde el armado de esta tier list. Los puntajes de las pelis no se tocan.</p><div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="tl-delok">${icon('delete')} Borrar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#tl-delok').addEventListener('click', () => { store.saveTierlists(store.getTierlists().filter((l) => l.id !== B.id)); store.clearListData(B.id); tierBoardId = null; el.hidden = true; renderTier(app); });
  }

  /* ============================================================= CALENDAR (shared) */
  let calBoardId = null;
  let calCursor = null;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const isoDate = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function currentCalendars() {
    const me = currentUser();
    const list = [{ id: 'cal-main', type: 'default', name: 'Nuestro calendario', owner: me.id, members: Object.values(users).map((u) => u.id), editable: !me.guest }];
    store.getCalendars().forEach((c) => { const members = Array.isArray(c.members) && c.members.length ? c.members : [c.owner]; list.push({ id: c.id, type: 'custom', name: c.name, owner: c.owner, members, editable: !me.guest && members.includes(me.id) }); });
    return list;
  }

  /* ---------- how you're watching it ---------- */
  const CAL_MODES = [
    { v: 'imax', label: 'IMAX', icon: 'theaters' },
    { v: 'cine', label: 'Cine', icon: 'local_movies' },
    { v: 'casa', label: 'Casa', icon: 'home' },
    { v: 'discord', label: 'Discord', icon: 'headset_mic', note: 'la vemos juntos online' },
  ];
  const modeOf = (v) => CAL_MODES.find((m) => m.v === v) || null;
  const modeLabel = (ev) => { const m = modeOf(ev.mode); return m ? m.label : (ev.place || ''); };

  /* ---------- invitations ----------
   * Every event records who created it (`by`). For everyone else on that calendar it is an
   * invitation until they accept or dismiss it — that's the +N on the header calendar icon. */
  function eachEvent(fn) {
    const cals = currentCalendars();
    const all = store.allCalEvents();
    cals.forEach((C) => {
      const map = all[C.id] || {};
      Object.keys(map).forEach((iso) => (map[iso] || []).forEach((ev) => fn(C, iso, ev)));
    });
  }
  function pendingInvites() {
    const u = currentUser();
    if (!u || u.guest) return [];
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    eachEvent((C, iso, ev) => {
      if (!ev.by || ev.by === u.id) return;
      if (!C.members.includes(u.id)) return;
      if (iso < today) return;                                    // ya pasó, no molestamos
      if ((ev.accepted || {})[u.id] || (ev.dismissed || {})[u.id]) return;
      out.push({ C, iso, ev });
    });
    return out.sort((a, b) => (a.iso + (a.ev.time || '')).localeCompare(b.iso + (b.ev.time || '')));
  }
  /** "X aceptó la invitación" — for the person who created the event. */
  function acceptNotices() {
    const u = currentUser();
    if (!u || u.guest) return [];
    const out = [];
    eachEvent((C, iso, ev) => {
      if (ev.by !== u.id) return;
      Object.keys(ev.accepted || {}).forEach((uid) => {
        if (uid === u.id) return;
        if ((ev.acceptSeen || {})[uid]) return;
        out.push({ C, iso, ev, uid });
      });
    });
    return out;
  }
  /** Patch one event in place and persist the calendar it belongs to. */
  function patchEvent(calId, iso, evId, fn) {
    const map = store.getCalEvents(calId);
    const ev = (map[iso] || []).find((x) => x.id === evId);
    if (!ev) return;
    fn(ev);
    store.saveCalEvents(calId, map);
  }
  function calEventsMap(calId) { return store.getCalEvents(calId); }
  function watchedByDate(members) {
    const map = {};
    movies.forEach((f) => members.forEach((uid) => { const wm = watchMetaOf(f.id, uid); if (wm.date) (map[wm.date] = map[wm.date] || []).push({ film: f, uid }); }));
    return map;
  }
  const filmThumb = (f) => (f && f.poster ? `#0d0303 url(${f.poster}) center/cover` : posterArt(f || { id: 'x', title: '?' }));
  function renderCalendario(app) {
    const cals = currentCalendars();
    let C = cals.find((c) => c.id === calBoardId) || cals[0];
    calBoardId = C.id;
    if (!calCursor) { const now = new Date(); calCursor = { y: now.getFullYear(), m: now.getMonth() }; }
    app.innerHTML = '';
    const s = document.createElement('section'); s.className = 'section'; s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    const mine = cals.filter((c) => c.editable);
    const others = cals.filter((c) => !c.editable);
    s.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">Calendario</h3><p class="section__sub">${C.members.map(ownerName).join(' y ')} · poné pelis en fechas y mirá lo que vieron</p></div></div>` +
      `<div class="tier-switch" id="cal-switch">` +
      mine.map((c) => `<button class="tswitch${c.id === C.id ? ' is-on' : ''}" data-cal="${c.id}">${icon('calendar_month')}${escapeHtml(c.name)}</button>`).join('') +
      `<button class="tswitch tswitch--add" id="cal-new">${icon('add')} Nuevo</button>` +
      (others.length ? `<button class="tswitch tswitch--others${!C.editable ? ' is-on' : ''}" id="cal-others">${icon('visibility')} ${!C.editable ? escapeHtml(C.name) : 'Ver de otros'}</button>` : '') +
      `</div>` +
      (C.type === 'custom' && C.editable ? `<div class="tier-toolbar"><button class="btn btn--soft btn--xs" id="cal-edit">${icon('edit')} Editar</button><button class="btn btn--soft btn--xs" id="cal-del">${icon('delete')} Borrar</button></div>` : '') +
      `<div class="calbar"><button class="icon-btn" id="cal-prev" aria-label="Mes anterior">${icon('chevron_left')}</button>` +
      `<div class="calbar__title">${MONTHS[calCursor.m]} ${calCursor.y}</div>` +
      `<button class="icon-btn" id="cal-next" aria-label="Mes siguiente">${icon('chevron_right')}</button>` +
      `<button class="btn btn--soft btn--xs cal-today" id="cal-today">Hoy</button></div>` +
      `<div class="calgrid" id="calgrid"></div>` +
      `<div class="cal-legend">${icon('theaters')} función planeada · ${icon('event_available')} ya la vieron (según la fecha de la reseña)</div>`;
    app.appendChild(s); app.appendChild(buildFooter());
    s.querySelector('#cal-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-cal]'); if (!b) return; calBoardId = b.dataset.cal; renderCalendario(app); });
    s.querySelector('#cal-new').addEventListener('click', () => { if (!guestBlock()) openCalendarModal(app, null); });
    const co = s.querySelector('#cal-others'); if (co) co.addEventListener('click', () => openCalOthers(app, others));
    const ce = s.querySelector('#cal-edit'); if (ce) ce.addEventListener('click', () => openCalendarModal(app, C));
    const cd = s.querySelector('#cal-del'); if (cd) cd.addEventListener('click', () => deleteCalendar(app, C));
    s.querySelector('#cal-prev').addEventListener('click', () => { calCursor.m--; if (calCursor.m < 0) { calCursor.m = 11; calCursor.y--; } renderCalGrid(C); });
    s.querySelector('#cal-next').addEventListener('click', () => { calCursor.m++; if (calCursor.m > 11) { calCursor.m = 0; calCursor.y++; } renderCalGrid(C); });
    s.querySelector('#cal-today').addEventListener('click', () => { const n = new Date(); calCursor = { y: n.getFullYear(), m: n.getMonth() }; renderCalGrid(C); });
    renderCalGrid(C);
    renderAcceptNotices();
    // don't pop the invitation on top of a form the user just opened
    if (pendingInvites().length) setTimeout(() => { if ($('#confirm').hidden !== false) openInviteOverlay(); }, 260);
  }

  function calendarNotificationHost() {
    let host = document.getElementById('calendar-notifications');
    if (!host) {
      host = document.createElement('aside');
      host.id = 'calendar-notifications';
      host.className = 'calendar-notifications';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }
  function showCalendarToast(title, detail, tone = '') {
    const host = calendarNotificationHost();
    const note = document.createElement('div');
    note.className = `calnotify calnotify--toast${tone ? ` calnotify--${tone}` : ''}`;
    note.innerHTML = `<span class="calnotify__icon">${icon(tone === 'success' ? 'mark_email_read' : 'notifications')}</span><div class="calnotify__copy"><b>${escapeHtml(title)}</b>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div><button class="icon-btn calnotify__close" aria-label="Cerrar">${icon('close')}</button>`;
    host.appendChild(note);
    const close = () => { note.classList.add('is-leaving'); setTimeout(() => note.remove(), 180); };
    note.querySelector('.calnotify__close').addEventListener('click', close);
    setTimeout(close, 4800);
  }

  /** "Fulano aceptó la invitación a la premier" — compact notices below the header. */
  function renderAcceptNotices() {
    const host = calendarNotificationHost();
    let wrap = document.getElementById('cal-accept-notices');
    const list = acceptNotices();
    if (!list.length) { if (wrap) wrap.remove(); return; }
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'cal-accept-notices'; wrap.className = 'calnotify-group'; host.appendChild(wrap); }
    wrap.innerHTML = list.map((n, i) => {
      const f = byId(n.ev.filmId) || { title: '?' };
      const who = users[n.uid] || { name: n.uid, color: 'var(--accent)' };
      return `<div class="calnotify calnotify--accepted" data-note="${i}" style="--c:${who.color}">` +
        `<span class="calnotify__icon">${icon('celebration')}</span>` +
        `<div class="calnotify__copy"><b>${escapeHtml(who.name)} aceptó la invitación</b><small>${escapeHtml(f.title)} · ${fmtDay(n.iso)}${n.ev.time ? ' · ' + n.ev.time : ''}</small></div>` +
        `<button class="icon-btn calnotify__close" data-dismiss="${i}" aria-label="Descartar">${icon('close')}</button></div>`;
    }).join('');
    wrap.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => {
      const n = list[+b.dataset.dismiss];
      patchEvent(n.C.id, n.iso, n.ev.id, (e) => { e.acceptSeen = e.acceptSeen || {}; e.acceptSeen[n.uid] = true; });
      renderAcceptNotices();
    }));
  }

  /** The invitation itself: poster, when, how, and Aceptar / Descartar. */
  function openInviteOverlay() {
    const list = pendingInvites();
    if (!list.length) return;
    let i = 0;
    const host = calendarNotificationHost();
    let el = document.getElementById('invite');
    if (!el) { el = document.createElement('div'); el.id = 'invite'; el.className = 'calnotify calnotify--invite'; host.prepend(el); }
    const done = () => {
      el.remove();
      renderHeader();
      if (route === 'calendario') { const C = currentCalendars().find((c) => c.id === calBoardId) || currentCalendars()[0]; renderCalGrid(C); renderAcceptNotices(); }
    };
    const draw = () => {
      const n = list[i];
      if (!n) return done();
      const f = byId(n.ev.filmId) || { title: '?', id: n.ev.filmId };
      const from = users[n.ev.by] || { name: 'alguien', color: 'var(--accent)' };
      const m = modeOf(n.ev.mode);
      el.style.setProperty('--c', from.color);
      el.innerHTML =
        `<div class="invite__head"><span class="calnotify__icon">${icon('confirmation_number')}</span><div class="calnotify__copy"><b>Invitación de ${escapeHtml(from.name)}</b><small>Te invitó a ver una función</small></div>` +
        `<button class="icon-btn calnotify__close" data-inv-close aria-label="Cerrar">${icon('close')}</button></div>` +
        `<div class="invite__film"><span class="invite__poster" style="background:${posterArt(f)}"></span>` +
        `<div class="invite__meta"><b>${escapeHtml(f.title)}</b>` +
        `<small>${icon('event')} ${fmtDay(n.iso)}${n.ev.time ? ` · ${n.ev.time}` : ''}</small>` +
        `<small>${icon(m ? m.icon : 'place')} ${escapeHtml(m ? m.label : (n.ev.place || 'A definir'))}</small>` +
        `</div></div>` +
        `<div class="invite__actions">` +
        `<button class="btn btn--soft" data-inv-no>${icon('close')} Ahora no</button>` +
        `<button class="btn btn--accent" data-inv-yes>${icon('check_circle')} ¡Voy!</button></div>` +
        `<button class="linklike invite__calendar" data-inv-calendar>${icon('calendar_month')} Abrir calendario</button>` +
        (list.length > 1 ? `<p class="invite__count">${i + 1} de ${list.length}</p>` : '') +
        ``;
      el.querySelector('[data-inv-close]').addEventListener('click', () => el.remove());
      el.querySelector('[data-inv-calendar]').addEventListener('click', () => setRoute('calendario'));
      el.querySelector('[data-inv-yes]').addEventListener('click', () => {
        const u = currentUser();
        patchEvent(n.C.id, n.iso, n.ev.id, (e) => { e.accepted = e.accepted || {}; e.accepted[u.id] = new Date().toISOString(); });
        showCalendarToast('¡Anotado!', `Le avisamos a ${users[n.ev.by] ? users[n.ev.by].name : 'quien te invitó'}.`, 'success');
        i++; draw();
      });
      el.querySelector('[data-inv-no]').addEventListener('click', () => {
        const u = currentUser();
        patchEvent(n.C.id, n.iso, n.ev.id, (e) => { e.dismissed = e.dismissed || {}; e.dismissed[u.id] = true; });
        i++; draw();
      });
    };
    draw();
    el.hidden = false;
  }

  function renderCalGrid(C) {
    const grid = document.getElementById('calgrid'); if (!grid) return;
    const titleEl = document.querySelector('.calbar__title'); if (titleEl) titleEl.textContent = `${MONTHS[calCursor.m]} ${calCursor.y}`;
    const events = calEventsMap(C.id);
    const watched = watchedByDate(C.members);
    const todayIso = new Date().toISOString().slice(0, 10);
    const startDow = (new Date(calCursor.y, calCursor.m, 1).getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(calCursor.y, calCursor.m + 1, 0).getDate();
    let html = WEEKDAYS.map((w) => `<div class="calhead">${w}</div>`).join('');
    for (let i = 0; i < startDow; i++) html += `<div class="calcell calcell--empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = isoDate(calCursor.y, calCursor.m, d);
      const evs = events[iso] || [];
      const wat = watched[iso] || [];
      // the planned screening takes over the whole cell as a wide backdrop
      const lead = evs[0] ? (byId(evs[0].filmId) || null) : null;
      const bg = lead && (lead.backdrop || lead.poster) ? `#0d0303 url(${lead.backdrop || lead.poster}) center/cover` : '';
      const watMarks = wat.slice(0, 3).map((w) => avatarHTML(users[w.uid] || { id: w.uid, color: '#666', initial: '?' }, 'avatar calwatch__av')).join('');
      const extra = (evs.length - 1) + Math.max(0, wat.length - 3);
      html += `<button class="calcell${iso === todayIso ? ' is-today' : ''}${evs.length ? ' has-ev' : ''}${bg ? ' has-art' : ''}" data-day="${iso}"` +
        (bg ? ` style="background:${bg}"` : '') + `>` +
        (bg ? `<span class="calcell__scrim"></span>` : '') +
        `<span class="calcell__d">${d}</span>` +
        (lead ? `<span class="calcell__ev"><b>${escapeHtml(lead.title)}</b>${evs[0].time ? `<small>${escapeHtml(evs[0].time)}${modeLabel(evs[0]) ? ' · ' + escapeHtml(modeLabel(evs[0])) : ''}</small>` : (modeLabel(evs[0]) ? `<small>${escapeHtml(modeLabel(evs[0]))}</small>` : '')}</span>` : '') +
        ((watMarks || extra > 0) ? `<span class="calcell__watch">${watMarks}${extra > 0 ? `<span class="calmore">+${extra}</span>` : ''}</span>` : '') +
        `</button>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-day]').forEach((cell) => cell.addEventListener('click', () => openCalDay(C, cell.dataset.day)));
  }
  function openCalDay(C, iso) {
    const evsNow = calEventsMap(C.id)[iso] || [];
    const watNow = watchedByDate(C.members)[iso] || [];
    if (!evsNow.length && !watNow.length && C.editable) {
      openCalEventModal(C, iso, null, () => renderCalGrid(C), () => {});
      return;
    }
    let el = document.getElementById('calday'); if (!el) { el = document.createElement('div'); el.id = 'calday'; el.className = 'picksheet'; document.body.appendChild(el); }
    const render = () => {
      const evs = calEventsMap(C.id)[iso] || [];
      const wat = watchedByDate(C.members)[iso] || [];
      const dateLabel = new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      el.innerHTML =
        `<div class="picksheet__scrim" data-cdclose></div><div class="picksheet__panel">` +
        `<div class="picksheet__head"><h3>${dateLabel}</h3><button class="icon-btn" data-cdclose>${icon('close')}</button></div>` +
        `<div class="picksheet__list">` +
        (evs.length ? `<div class="calday__sec">${icon('theaters')} Funciones planeadas</div>` + evs.map((e) => {
          const f = byId(e.filmId) || { id: e.filmId, title: '?' };
          const m = modeOf(e.mode);
          const going = Object.keys(e.accepted || {});
          return `<div class="calev"><span class="calev__poster" style="background:${filmThumb(f)}"></span>` +
            `<div class="calev__body"><div class="calev__title">${escapeHtml(f.title)}</div>` +
            `<div class="calev__meta">${[e.time ? icon('schedule') + ' ' + escapeHtml(e.time) : '', m ? icon(m.icon) + ' ' + m.label : '', e.place ? icon('place') + ' ' + escapeHtml(e.place) : ''].filter(Boolean).join(' · ') || 'sin horario ni lugar'}</div>` +
            (going.length ? `<div class="calev__going">${icon('how_to_reg')} van ${going.map((uid) => escapeHtml((users[uid] || {}).name || uid)).join(', ')}</div>` : '') +
            `</div>${C.editable ? `<button class="icon-btn calev__edit" data-edit="${e.id}" aria-label="Editar">${icon('edit')}</button>` : ''}</div>`;
        }).join('') : '') +
        (wat.length ? `<div class="calday__sec">${icon('event_available')} Vieron ese día</div>` + wat.map((w) => `<div class="calev"><span class="calev__poster" style="background:${filmThumb(w.film)}"></span><div class="calev__body"><div class="calev__title">${escapeHtml(w.film.title)}</div><div class="calev__meta">${avatarHTML(users[w.uid] || { id: w.uid, color: '#666', initial: '?' }, 'avatar calev__av')} ${escapeHtml((users[w.uid] || {}).name || w.uid)}</div></div></div>`).join('') : '') +
        (!evs.length && !wat.length ? `<p class="addfilm__hint">Nada este día${C.editable ? '. Agregá una función 👇' : '.'}</p>` : '') +
        `</div>` +
        (C.editable ? `<button class="btn btn--accent calday__add" data-cdadd>${icon('add_circle')} Agregar función</button>` : '') +
        `</div>`;
      el.querySelectorAll('[data-cdclose]').forEach((b) => b.addEventListener('click', closeCalDay));
      // the day sheet steps aside so the form is the only overlay on screen (no stacking)
      const reopen = () => openCalDay(C, iso);
      const add = el.querySelector('[data-cdadd]');
      if (add) add.addEventListener('click', () => { closeCalDay(); openCalEventModal(C, iso, null, reopen, reopen); });
      el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
        const ev = (calEventsMap(C.id)[iso] || []).find((x) => x.id === b.dataset.edit);
        if (!ev) return;
        closeCalDay();
        openCalEventModal(C, iso, ev, reopen, reopen);
      }));
    };
    render(); el.hidden = false; document.body.style.overflow = 'hidden';
  }
  function closeCalDay() { const el = document.getElementById('calday'); if (el) { el.hidden = true; el.innerHTML = ''; } document.body.style.overflow = ''; if (route === 'calendario') { const C = currentCalendars().find((c) => c.id === calBoardId) || currentCalendars()[0]; renderCalGrid(C); } }

  /**
   * Add/edit a screening. `iso` may be null — then the form asks for the day too, which is what
   * the "Agendar" button on a film sheet uses. opts.filmId preselects a film.
   */
  function openCalEventModal(C, iso, ev, onDone, onCancel, opts = {}) {
    if (guestBlock()) { if (onCancel) onCancel(); return; }
    const editing = !!ev;
    const el = $('#confirm');
    const askDay = !iso;
    let day = iso || new Date().toISOString().slice(0, 10);
    let filmId = (ev && ev.filmId) || opts.filmId || null;
    let mode = (ev && ev.mode) || null;
    let query = '';
    let picking = !filmId;
    let searchTimer = null;
    let searchToken = 0;

    const localResults = (q) => movies.slice()
      .filter((m) => !q || m.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title)).slice(0, 40)
      .map((m) => ({ ...m, source: 'local' }));
    const resultMeta = (m) => {
      const bits = [m.year, kindLabel(m.kind)];
      if (m.releaseDate) bits.push(m.upcoming ? `Próximamente · ${fmtDay(m.releaseDate)}` : fmtDay(m.releaseDate));
      return bits.filter(Boolean).join(' · ');
    };
    const paintResults = (items, message = '') => {
      const host = el.querySelector('#cev-results'); if (!host) return;
      if (!items.length) { host.innerHTML = `<p class="addfilm__hint">${message || `Nada con “${escapeHtml(query)}”. Probá otro título.`}</p>`; return; }
      host.innerHTML = items.map((m) =>
        `<button class="cevres" ${m.source === 'tmdb' ? `data-tmdb="${m.id}" data-media="${m.media}"` : `data-film="${escapeHtml(m.id)}"`}>` +
        `<span class="cevres__poster" style="background:${posterArt(m)}"></span>` +
        `<span class="cevres__body"><b>${escapeHtml(m.title)}</b><small>${escapeHtml(resultMeta(m))}</small></span>` +
        (m.upcoming ? `<span class="cevres__upcoming">Próximamente</span>` : '') + `</button>`
      ).join('');
      host.querySelectorAll('[data-film]').forEach((b) => b.addEventListener('click', () => { filmId = b.dataset.film; picking = false; draw(); }));
      host.querySelectorAll('[data-tmdb]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true; b.classList.add('is-loading');
        try {
          const film = await WM.api.addDetails(+b.dataset.tmdb, b.dataset.media);
          addExtraFilm(film); filmId = film.id; picking = false; draw();
        } catch {
          b.disabled = false; b.classList.remove('is-loading');
          showCalendarToast('No pude cargar ese título', 'Revisá la conexión y probá de nuevo.');
        }
      }));
    };
    const updateSearch = async () => {
      const token = ++searchToken;
      const q = query.trim();
      const local = localResults(q.toLowerCase());
      paintResults(local, q.length < 2 ? 'Escribí al menos 2 letras para buscar también próximos estrenos.' : '');
      if (q.length < 2 || !(WM.api && WM.api.available)) return;
      try {
        const remote = await WM.api.search(q);
        if (token !== searchToken || !el.querySelector('#cev-results')) return;
        const localTmdb = new Set(local.map((m) => m.tmdb).filter(Boolean).map(String));
        const fresh = remote.filter((m) => !localTmdb.has(String(m.id))).map((m) => ({ ...m, source: 'tmdb' }));
        paintResults([...local.slice(0, 16), ...fresh].slice(0, 40));
      } catch {
        if (token === searchToken && !local.length) paintResults([], 'No pude buscar en TMDB. Probá de nuevo.');
      }
    };

    const draw = () => {
      const f = filmId ? byId(filmId) : null;
      const q = query.trim().toLowerCase();
      const results = picking ? localResults(q) : [];
      el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card confirm__card--wide">` +
        `<div class="confirm__title">${editing ? 'Editar función' : 'Agregar función'}</div>` +
        (askDay ? `<label class="tl-field"><span>Día</span><input type="date" id="cev-day" value="${day}"></label>` : '') +
        `<div class="cevpick">` +
        (f && !picking
          ? `<div class="cevpick__chosen"><span class="cevpick__poster" style="background:${posterArt(f)}"></span>` +
            `<div class="cevpick__body"><b>${escapeHtml(f.title)}</b><small>${[f.year, kindLabel(f.kind)].filter(Boolean).join(' · ')}</small></div>` +
            `<button class="btn btn--soft btn--xs" id="cev-change">${icon('swap_horiz')} Cambiar</button></div>`
          : `<label class="search search--lg"><span class="material-symbols-rounded">search</span>` +
            `<input id="cev-q" type="search" placeholder="Buscar película o serie…" value="${escapeHtml(query)}" autocomplete="off"></label>` +
            `<div class="cevpick__list" id="cev-results">` +
            (results.length ? results.map((m) => `<button class="cevres" data-film="${escapeHtml(m.id)}">` +
              `<span class="cevres__poster" style="background:${posterArt(m)}"></span>` +
              `<span class="cevres__body"><b>${escapeHtml(m.title)}</b><small>${escapeHtml(resultMeta(m))}</small></span></button>`).join('')
              : `<p class="addfilm__hint">Nada con “${escapeHtml(query)}”. Probá otro título.</p>`) +
            `</div>`) +
        `</div>` +
        `<div class="cev-row"><label class="fieldlet">Horario<input type="time" id="cev-time" value="${ev && ev.time ? escapeHtml(ev.time) : ''}"></label></div>` +
        `<div class="cev-modes"><span class="watchmeta__lbl">¿Cómo la vemos?</span>` +
        CAL_MODES.map((m) => `<button class="wchip${mode === m.v ? ' is-on' : ''}" data-mode="${m.v}" title="${m.note || m.label}">${icon(m.icon)} ${m.label}</button>`).join('') + `</div>` +
        `<label class="tl-field"><span>Nota <small>(opcional — sala, link, dirección…)</small></span><input type="text" id="cev-place" maxlength="60" placeholder="Ej: Showcase Norte, sala 4" value="${ev && ev.place ? escapeHtml(ev.place) : ''}"></label>` +
        `<div class="confirm__actions">` + (editing ? `<button class="btn btn--soft" id="cev-del">${icon('delete')} Borrar</button>` : '') +
        `<button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="cev-ok">${icon('check')} ${editing ? 'Guardar' : 'Agregar'}</button></div></div>`;

      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { el.hidden = true; if (onCancel) onCancel(); }));
      const qi = el.querySelector('#cev-q');
      if (qi) {
        qi.addEventListener('input', () => {
          query = qi.value;
          clearTimeout(searchTimer);
          searchTimer = setTimeout(updateSearch, 220);
        });
        setTimeout(() => qi.focus(), 40);
      }
      el.querySelectorAll('[data-film]').forEach((b) => b.addEventListener('click', () => { filmId = b.dataset.film; picking = false; draw(); }));
      const ch = el.querySelector('#cev-change'); if (ch) ch.addEventListener('click', () => { picking = true; query = ''; draw(); });
      el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        mode = mode === b.dataset.mode ? null : b.dataset.mode;
        el.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('is-on', x.dataset.mode === mode));
      }));
      el.querySelector('#cev-ok').addEventListener('click', () => {
        if (!filmId) { K.toast('Elegí una película primero.', 'bad'); picking = true; draw(); return; }
        if (askDay) { const di = el.querySelector('#cev-day'); day = (di && di.value) || day; }
        const time = el.querySelector('#cev-time').value || null;
        const place = el.querySelector('#cev-place').value.trim() || null;
        const me = currentUser();
        const map = store.getCalEvents(C.id); map[day] = map[day] || [];
        if (editing) {
          const e2 = map[day].find((x) => x.id === ev.id);
          if (e2) { e2.filmId = filmId; e2.time = time; e2.place = place; e2.mode = mode; }
        } else {
          map[day].push({
            id: 'ce-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            filmId, time, place, mode, by: me.id, createdAt: new Date().toISOString(),
            accepted: {}, dismissed: {}, acceptSeen: {},
          });
        }
        store.saveCalEvents(C.id, map);
        el.hidden = true;
        const invited = C.members.filter((m) => m !== me.id).length;
        if (!editing && invited) showCalendarToast('Invitación enviada', `${invited} ${invited === 1 ? 'persona recibió' : 'personas recibieron'} la función.`, 'success');
        if (onDone) onDone(day);
      });
      const del = el.querySelector('#cev-del');
      if (del) del.addEventListener('click', () => {
        const map = store.getCalEvents(C.id);
        map[iso] = (map[iso] || []).filter((x) => x.id !== ev.id);
        if (!map[iso].length) delete map[iso];
        store.saveCalEvents(C.id, map); el.hidden = true; if (onDone) onDone(iso);
      });
    };
    draw();
    el.hidden = false;
  }
  function openCalendarModal(app, C) {
    const editing = !!C; const me = currentUser();
    const others = Object.values(users).filter((x) => x.id !== me.id);
    const members = new Set(editing && Array.isArray(C.members) ? C.members.filter((id) => id !== me.id) : others.map((o) => o.id));
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
      `<div class="confirm__title">${editing ? 'Editar calendario' : 'Nuevo calendario'}</div>` +
      `<label class="tl-field"><span>Nombre</span><input id="cal-name" type="text" maxlength="40" placeholder="Ej: Ciclo de terror…" value="${editing ? escapeHtml(C.name) : ''}"></label>` +
      `<div class="tl-members"><div class="tl-members__lbl">¿Con quién lo compartís? (lo editan vos + ellos; el resto solo lo ve)</div>${others.map((o) => `<button class="tl-member${members.has(o.id) ? ' is-on' : ''}" data-member="${o.id}">${avatarHTML(o, 'avatar tl-member__av')} ${o.name}</button>`).join('')}</div>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="cal-ok">${icon('check')} ${editing ? 'Guardar' : 'Crear'}</button></div></div>`;
    el.hidden = false;
    const nameInput = el.querySelector('#cal-name'); setTimeout(() => nameInput.focus(), 40);
    el.querySelectorAll('[data-member]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.member; if (members.has(id)) members.delete(id); else members.add(id); b.classList.toggle('is-on', members.has(id)); }));
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#cal-ok').addEventListener('click', () => {
      const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
      if (editing) { store.saveCalendars(store.getCalendars().map((c) => (c.id === C.id ? { ...c, name, members: [me.id, ...members] } : c))); }
      else { const id = 'cal-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); store.saveCalendars([...store.getCalendars(), { id, name, owner: me.id, members: [me.id, ...members] }]); calBoardId = id; }
      el.hidden = true; renderCalendario(app);
    });
  }
  function deleteCalendar(app, C) {
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">¿Borrar “${escapeHtml(C.name)}”?</div><p class="confirm__text">Se borran las funciones planeadas de este calendario. Las reseñas no se tocan.</p><div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="cal-delok">${icon('delete')} Borrar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#cal-delok').addEventListener('click', () => { store.saveCalendars(store.getCalendars().filter((c) => c.id !== C.id)); store.clearCalEvents(C.id); calBoardId = null; el.hidden = true; renderCalendario(app); });
  }
  function openCalOthers(app, others) {
    openPickSheet('Calendarios de otros', () => others.map((c) => ({ thumb: userThumb(c.owner), label: `${c.name} — ${ownerName(c.owner)}`, check: c.id === calBoardId, onClick: () => { calBoardId = c.id; closePickSheet(); renderCalendario(app); } })));
  }

  function tierChip(f, draggable) {
    const c = document.createElement('div');
    c.className = 'chip' + (draggable ? '' : ' chip--ro');
    c.draggable = !!draggable;
    c.dataset.id = f.id;
    c.title = f.title;
    c.innerHTML = `<div class="chip__img" style="background:${posterArt(f)}"></div><div class="chip__t">${f.title}</div>`;
    return c;
  }
  function fillTier(B) {
    const draggable = B.editable;
    const drops = {};
    document.querySelectorAll('.tier__drop').forEach((d) => (drops[d.dataset.tier] = d));
    document.querySelectorAll('.tier__drop, #tier-pool').forEach((d) => (d.innerHTML = ''));
    boardEligible(B).filter((f) => passesTierFilter(f, B)).forEach((f) => {
      const t = boardGet(B, f.id);
      // a film parked in a row that was deleted falls back to the pool instead of vanishing
      const target = (t && drops[t]) || document.querySelector('#tier-pool');
      if (target) target.appendChild(tierChip(f, draggable));
    });
    const pool = document.querySelector('#tier-pool');
    if (pool && !pool.children.length) pool.innerHTML = `<p class="tier-pool__empty">${draggable ? 'Todavía no hay pelis para ubicar. Puntuá una peli (queda como “vista”) o tocá <b>Agregar peli</b>.' : 'Sin pelis para mostrar.'}</p>`;
  }
  function enableTierDnD(B) {
    let dragId = null;
    const section = document.querySelector('#tier-board').closest('.section');
    section.addEventListener('dragstart', (e) => {
      const chip = e.target.closest('.chip'); if (!chip) return;
      dragId = chip.dataset.id; chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch {}
    });
    section.addEventListener('dragend', (e) => {
      const chip = e.target.closest('.chip'); if (chip) chip.classList.remove('dragging');
      dragId = null;
      document.querySelectorAll('.drag-over').forEach((d) => d.classList.remove('drag-over'));
    });
    [...document.querySelectorAll('.tier__drop'), document.querySelector('#tier-pool')].forEach((drop) => {
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault(); drop.classList.remove('drag-over');
        const id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
        if (!id || guestBlock()) return;
        boardSet(B, id, drop.dataset.tier || null);
        fillTier(B);
      });
    });
  }

  /* ---------- poster card ---------- */
  function posterCard(f, opts = {}) {
    const card = document.createElement('button');
    card.className = 'card';
    const ownerTag = ownerBadge(f, 'poster__owner');
    const rank = opts.rank ? `<span class="poster__rank">#${opts.rank}</span>` : '';
    const kindBadge = f.kind === 'series' ? `<span class="poster__kind">Serie</span>` : '';
    card.innerHTML =
      `<div class="poster">` +
      `<div class="poster__img" style="background:${posterArt(f)}"></div>` +
      `<div class="poster__label"><span class="t">${f.title}</span><span class="y">${f.year || ''}</span></div>` +
      `${rank}${kindBadge}${ownerTag}</div>` +
      `<div class="card__foot"><div class="card__scores">` +
      (f.imdb != null ? `<span class="imdb">★ ${f.imdb.toFixed(1)}</span>` : '') +
      (f.rt != null ? `<span class="rt">🍅 ${f.rt}%</span>` : '') +
      `</div></div>`;
    card.addEventListener('click', () => openSheet(f));
    return card;
  }

  /* ============================================================= SECRET SWIPER (rate random movies, TikTok-style) */
  function buildSecretCTA() {
    const s = document.createElement('section');
    s.className = 'section secret-wrap';
    s.innerHTML =
      `<button class="secret-cta" id="secret-cta" aria-label="Modo relámpago">` +
      `<span class="secret-cta__ic">${icon('bolt')}</span>` +
      `<span class="secret-cta__txt"><b>Modo relámpago</b><small>¿Viste una peli suelta? Te la tiramos al azar y la puntuás al toque, sin buscarla.</small></span>` +
      `<span class="secret-cta__go">${icon('arrow_forward')}</span></button>`;
    s.querySelector('#secret-cta').addEventListener('click', openSwiper);
    return s;
  }

  let swMovies = [], swIndex = 0, swLoading = false;
  // Skip films the active user already rated (viste) or placed in a tier (rankeaste).
  function swAlreadyKnown(m) { const u = currentUser(); return verdictOf(m.id, u.id).rating != null || !!store.getTier(m.id, u.id); }
  async function loadMoreSw() {
    if (swLoading || !(WM.api && WM.api.available)) return;
    swLoading = true;
    try {
      for (let tries = 0; tries < 3; tries++) {
        const before = swMovies.length;
        (await WM.api.randomMovies()).forEach((m) => { if (!swMovies.some((x) => x.id === m.id) && !swAlreadyKnown(m)) swMovies.push(m); });
        if (swMovies.length > before) break; // got at least one fresh title
      }
    } catch {}
    swLoading = false;
  }
  async function openSwiper() {
    let el = document.getElementById('swiper');
    if (!el) { el = document.createElement('div'); el.id = 'swiper'; el.className = 'swiper'; document.body.appendChild(el); }
    el.hidden = false; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onSwiperKey);
    if (!swMovies.length) {
      el.innerHTML = `<button class="swiper__close" data-swclose>${icon('close')}</button><div class="swiper__loading">${icon('bolt')} Cargando pelis…</div>`;
      el.querySelector('[data-swclose]').addEventListener('click', closeSwiper);
      await loadMoreSw();
    }
    swIndex = Math.min(swIndex, Math.max(0, swMovies.length - 1));
    renderSwiper();
  }
  function renderSwiper() {
    const el = document.getElementById('swiper'); if (!el) return;
    const m = swMovies[swIndex];
    if (!m) { el.innerHTML = `<button class="swiper__close" data-swclose>${icon('close')}</button><div class="swiper__loading">No pude cargar pelis. Probá de nuevo.</div>`; el.querySelector('[data-swclose]').addEventListener('click', closeSwiper); return; }
    const u = currentUser(); const v = verdictOf(m.id, u.id);
    const meta = [(m.genres && m.genres[0]) || 'Película', m.year].filter(Boolean).map((x, i) => (i === 0 ? `<span class="eyebrow" style="color:var(--lime)">${x}</span>` : `<span>${x}</span>`)).join('<span class="dot-sep">·</span>');
    el.innerHTML =
      `<button class="swiper__close" data-swclose aria-label="Salir">${icon('close')}</button>` +
      `<div class="swiper__main">` +
      `<div class="swiper__card"><div class="swiper__poster" style="background:${posterArt(m)}"></div>` +
      `<div class="swiper__meta">${meta}<div class="swiper__t">${escapeHtml(m.title)}</div></div></div>` +
      `<div class="swiper__actions"><div class="swiper__stars" id="sw-stars"></div>` +
      `<label class="sw-date" title="¿Cuándo la viste? (opcional)"><span class="sw-date__head">${icon('event')} Fecha en que la viste</span>` +
      `<input type="date" id="sw-date" value="${watchMetaOf(m.id, u.id).date || ''}" aria-label="Fecha en que la viste (opcional)"></label>` +
      `<div class="swiper__btns">` +
      `<button class="swbtn swbtn--nav" data-swprev ${swIndex <= 0 ? 'disabled' : ''} aria-label="Anterior">${icon('arrow_back')}</button>` +
      `<button class="swbtn swbtn--clock ${inWatchlist(m.id) ? 'is-on' : ''}" data-swclock aria-label="Agregar a la watchlist" title="Agregar a la watchlist">${icon('schedule')}</button>` +
      `<button class="swbtn swbtn--heart ${v.liked ? 'is-liked' : ''}" data-swlike aria-label="Me gusta">${icon('favorite')}</button>` +
      `<button class="swbtn swbtn--calendar" data-swcal aria-label="Agendar función" title="Agendar función">${icon('calendar_add_on')}</button>` +
      `<button class="swbtn swbtn--nav" data-swnext aria-label="Siguiente">${icon('arrow_forward')}</button>` +
      `</div></div></div>` +
      `<div class="swiper__hint">Puntuala · ⏰ watchlist · ❤ like · ← → seguí · ✕ salir</div>`;
    el.querySelectorAll('[data-swclose]').forEach((b) => b.addEventListener('click', closeSwiper));
    el.querySelectorAll('[data-swprev]').forEach((b) => b.addEventListener('click', () => swGo(-1)));
    el.querySelectorAll('[data-swnext]').forEach((b) => b.addEventListener('click', () => swGo(1)));
    el.querySelectorAll('[data-swlike]').forEach((b) => b.addEventListener('click', () => swLike(m)));
    el.querySelectorAll('[data-swclock]').forEach((b) => b.addEventListener('click', () => swClock(m, b)));
    el.querySelectorAll('[data-swcal]').forEach((b) => b.addEventListener('click', () => {
      if (guestBlock('agendar una función')) return;
      if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m });
      closeSwiper();
      const cals = currentCalendars();
      const C = cals.find((c) => c.id === calBoardId && c.editable) || cals.find((c) => c.editable) || cals[0];
      calBoardId = C.id;
      setRoute('calendario');
      openCalEventModal(C, null, null, () => renderCalendario($('#app')), null, { filmId: m.id });
    }));
    mountSwiperStars($('#sw-stars', el), m, u, v.rating);
    const dt = el.querySelector('#sw-date');
    if (dt) dt.addEventListener('change', () => {
      if (guestBlock()) { dt.value = ''; return; }
      if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m });
      store.setWatchMeta(m.id, u.id, { date: dt.value || null });
      if (dt.value) K.toast(`${icon('event_available')} Anotado: la viste el ${fmtDay(dt.value)}.`);
    });
    const card = el.querySelector('.swiper__card'); let x0 = null;
    card.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) swGo(dx < 0 ? 1 : -1); x0 = null; });
  }
  async function swGo(dir) {
    const next = swIndex + dir; if (next < 0) return;
    if (next >= swMovies.length) { await loadMoreSw(); if (next >= swMovies.length) return; }
    swIndex = next;
    if (swMovies.length - swIndex < 4) loadMoreSw();
    renderSwiper();
  }
  function swLike(m) {
    if (guestBlock()) return;
    const u = currentUser();
    if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m });
    store.toggleLike(m.id, u.id);
    const liked = store.get(m.id, u.id).liked;
    document.querySelectorAll('#swiper [data-swlike]').forEach((b) => b.classList.toggle('is-liked', liked));
  }
  const inWatchlist = (id) => { const f = movies.find((x) => x.id === id); return !!(f && f.extra && isWatchlist(f)); };
  function swClock(m) {
    if (guestBlock()) return;
    const u = currentUser();
    const ex = store.getSetting('extra_films') || [];
    const existing = movies.find((x) => x.id === m.id);
    let on;
    if (existing && existing.extra && isWatchlist(existing)) {
      existing.owner = 'extra'; // remove from watchlist (keep as extra so a rating still shows in "Ya vimos")
      existing.owners = [];
      const i = ex.findIndex((x) => x.id === m.id); if (i >= 0) { ex[i].owner = 'extra'; ex[i].owners = []; }
      on = false;
    } else if (existing) {
      existing.owner = u.id;
      existing.owners = [u.id];
      const i = ex.findIndex((x) => x.id === m.id); if (i >= 0) { ex[i].owner = u.id; ex[i].owners = [u.id]; } else ex.push({ ...existing });
      on = true;
    } else {
      const film = { ...m, owner: u.id, owners: [u.id], extra: true };
      movies.push(film); ex.push(film); on = true;
    }
    store.setSetting('extra_films', ex);
    document.querySelectorAll('#swiper [data-swclock]').forEach((b) => b.classList.toggle('is-on', on));
  }
  function mountSwiperStars(container, m, u, initial) {
    let value = typeof initial === 'number' ? initial : 0;
    container.innerHTML = starsMarkup(value, 'lg') + `<span class="stars-value" id="sw-num">${value ? value.toFixed(1) : '—'}</span>`;
    const widget = container.querySelector('.stars'), fill = container.querySelector('.stars__fill'), num = container.querySelector('#sw-num');
    widget.classList.add('stars--interactive'); widget.tabIndex = 0; widget.setAttribute('role', 'slider');
    const setV = (val) => { fill.style.width = (val / 5) * 100 + '%'; num.textContent = val ? val.toFixed(1) : '—'; };
    const fromX = (x) => { const r = widget.getBoundingClientRect(); return Math.max(0.5, Math.ceil(Math.min(1, Math.max(0, (x - r.left) / r.width)) * 10) / 2); };
    widget.addEventListener('pointermove', (e) => setV(fromX(e.clientX)));
    widget.addEventListener('pointerleave', () => setV(value));
    widget.addEventListener('pointerdown', (e) => { value = fromX(e.clientX); commit(); });
    widget.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { value = Math.min(5, value + 0.5); commit(); e.preventDefault(); e.stopPropagation(); } if (e.key === 'ArrowDown') { value = Math.max(0, value - 0.5); commit(); e.preventDefault(); e.stopPropagation(); } });
    function commit() { if (guestBlock()) { value = typeof initial === 'number' ? initial : 0; setV(value); return; } setV(value); if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m }); store.setRating(m.id, u.id, value || null); }
  }
  function onSwiperKey(e) { if (e.key === 'Escape') closeSwiper(); else if (e.key === 'ArrowLeft') swGo(-1); else if (e.key === 'ArrowRight') swGo(1); }
  function closeSwiper() {
    const el = document.getElementById('swiper'); if (el) { el.hidden = true; el.innerHTML = ''; }
    document.body.style.overflow = ''; document.removeEventListener('keydown', onSwiperKey);
    if (route === 'home') renderHome($('#app'));
  }

  /* ---------- watch metadata: year seen + where (IMAX/cine/casa/celu) ---------- */
  const WHERE = [
    { v: 'imax', label: 'IMAX', icon: 'theaters' },
    { v: 'cine', label: 'Cine', icon: 'local_movies' },
    { v: 'casa', label: 'Casa', icon: 'home' },
    { v: 'celu', label: 'Celu', icon: 'smartphone' },
  ];
  function fmtDay(iso) { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function watchMetaHTML(f, u) {
    const m = watchMetaOf(f.id, u.id);
    return `<div class="watchmeta">` +
      `<label class="fieldlet fieldlet--wm">Fecha en que la vi<input type="date" data-wm="date" value="${m.date || ''}"></label>` +
      `<div class="watchmeta__where"><span class="watchmeta__lbl">¿Dónde?</span>${WHERE.map((w) => `<button class="wchip${m.where === w.v ? ' is-on' : ''}" data-where="${w.v}">${icon(w.icon)} ${w.label}</button>`).join('')}</div>` +
      `</div>`;
  }
  function wireWatchMeta(scope, f, u) {
    const d = scope.querySelector('[data-wm="date"]');
    if (d) d.addEventListener('change', () => { if (guestBlock()) { d.value = ''; return; } store.setWatchMeta(f.id, u.id, { date: d.value || null }); });
    scope.querySelectorAll('[data-where]').forEach((b) => b.addEventListener('click', () => {
      if (guestBlock()) return;
      const cur = store.getWatchMeta(f.id, u.id).where; const val = cur === b.dataset.where ? null : b.dataset.where;
      store.setWatchMeta(f.id, u.id, { where: val });
      scope.querySelectorAll('[data-where]').forEach((x) => x.classList.toggle('is-on', x.dataset.where === val));
    }));
  }
  function watchMetaLine(f, uid) {
    const m = watchMetaOf(f.id, uid);
    const w = (WHERE.find((x) => x.v === m.where) || {}).label;
    const parts = [];
    if (m.date) parts.push(`vista el ${fmtDay(m.date)}`);
    else if (m.year) parts.push(`vista en ${m.year}`);
    if (w) parts.push(w);
    return parts.length ? `<p class="verdict__dates">${icon('event')} ${parts.join(' · ')}</p>` : '';
  }

  /* ============================================================= SHEET */
  const sheet = $('#sheet');
  let sheetFilm = null;

  function openSheet(f) {
    sheetFilm = f;
    const u = currentUser();
    const me = verdictOf(f.id, u.id);
    // everyone else who said something about this one (not just "the other one" — accounts can grow)
    const others = Object.values(users).filter((x) => x.id !== u.id).map((x) => ({ u: x, e: verdictOf(f.id, x.id) }))
      .filter(({ e }) => typeof e.rating === 'number' || e.review || e.liked);

    sheet.innerHTML =
      `<div class="sheet__scrim" data-close></div>` +
      `<div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${f.title}">` +
      `<div class="sheet__hero"><div class="hero__bg" style="background:${art(f)}"></div>` +
      `<button class="sheet__close" data-close aria-label="Cerrar">${icon('close')}</button></div>` +
      `<div class="sheet__content">` +
      `<div class="sheet__meta"><span class="eyebrow" style="color:var(--lime)">${kindLabel(f.kind)}</span>` +
      [f.year, fmtRuntime(f.runtime), f.director].filter(Boolean).map((x) => `<span class="dot-sep">·</span><span class="eyebrow">${x}</span>`).join('') +
      `</div>` +
      `<h2 class="sheet__title">${f.title}</h2>` +
      `<div class="sheet__scores">${scoreBadges(f)}</div>` +
      `<div class="sheet__cta">` +
      (f.trailer ? `<button class="btn btn--ghost sheet__trailer" id="sheet-trailer">${icon('play_circle')} Ver trailer</button>` : '') +
      `<button class="btn btn--ghost" id="sheet-plan">${icon('event')} Agendar</button>` +
      `</div>` +
      `<p class="sheet__synopsis">${f.synopsis || ''}</p>` +

      `<div class="rate-box">` +
      `<div class="rate-box__head">${avatarHTML(u)}<span class="rate-box__you">Tu puntaje, ${u.name}</span></div>` +
      `<div class="rate-box__row"><div class="rate-box__stars" id="rate-stars"></div>` +
      `<button class="rate-clear" id="rate-clear" ${typeof me.rating === 'number' ? '' : 'hidden'}>borrar</button></div>` +
      watchMetaHTML(f, u) +
      `<div class="review-field"><label for="review">Tu reseña</label>` +
      `<textarea id="review" placeholder="¿Qué te pareció?">${me.review ? escapeHtml(me.review) : ''}</textarea>` +
      `<div class="review-actions"><button class="btn btn--accent" id="save-review">${icon('save')} Guardar reseña</button>` +
      `<button class="btn btn--soft like ${me.liked ? 'is-liked' : ''}" id="sheet-like">${icon('favorite')} ${me.liked ? 'Te gusta' : 'Me gusta'}</button>` +
      `<span class="saved-flag" id="saved-flag">guardado ✓</span></div></div>` +
      `</div>` +

      (others.length
        ? `<div class="other-verdict"><div class="other-verdict__head">Lo que dijeron ${others.map((o) => escapeHtml(o.u.name)).join(', ')}</div>` +
          others.map(({ u: ou, e }) =>
            `<div class="verdict">${avatarHTML(ou, 'avatar verdict__avatar')}` +
            `<div class="verdict__main"><div class="verdict__row"><span class="verdict__name">${escapeHtml(ou.name)}</span>` +
            (typeof e.rating === 'number' ? `${starsMarkup(e.rating, 'sm')}<span class="stars-value">${e.rating.toFixed(1)}</span>` : '<span class="verdict__none">sin puntaje</span>') +
            (e.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '') +
            `</div>${e.review ? `<p class="verdict__review">“${escapeHtml(e.review)}”</p>` : ''}${watchMetaLine(f, ou.id)}</div></div>`).join('') +
          `</div>`
        : '') +

      `</div></div>`;

    // interactive stars
    mountInteractiveStars($('#rate-stars', sheet), f, u, me.rating);
    wireWatchMeta(sheet, f, u);
    $('#rate-clear', sheet).addEventListener('click', () => {
      if (guestBlock()) return;
      store.setRating(f.id, u.id, null);
      openSheet(f); // re-render
    });
    $('#save-review', sheet).addEventListener('click', () => {
      if (guestBlock()) return;
      store.setReview(f.id, u.id, $('#review', sheet).value.trim());
      const flag = $('#saved-flag', sheet); flag.classList.add('show');
      setTimeout(() => flag.classList.remove('show'), 1600);
    });
    $('#review', sheet).addEventListener('blur', (e) => { if (!isGuest()) store.setReview(f.id, u.id, e.target.value.trim()); });
    $('#sheet-like', sheet).addEventListener('click', (e) => toggleLike(f, e.currentTarget, true));
    const st = $('#sheet-trailer', sheet); if (st) st.addEventListener('click', () => openTrailer(f));
    const sp = $('#sheet-plan', sheet);
    if (sp) sp.addEventListener('click', () => {
      if (guestBlock()) return;
      if (!movies.some((m) => m.id === f.id)) addExtraFilm({ ...f });   // agendar una peli descubierta la trae a la app
      closeSheet();
      const cals = currentCalendars();
      const C = cals.find((c) => c.id === calBoardId && c.editable) || cals.find((c) => c.editable) || cals[0];
      calBoardId = C.id;
      setRoute('calendario');
      openCalEventModal(C, null, null, () => renderCalendario($('#app')), null, { filmId: f.id });
    });

    sheet.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onSheetKey);
  }

  function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() {
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onSheetKey);
    if (route === 'home') { renderHome($('#app')); } // refresh "Ya vimos"
    sheetFilm = null;
  }

  function mountInteractiveStars(container, f, u, initial) {
    let value = typeof initial === 'number' ? initial : 0;
    container.innerHTML = starsMarkup(value, 'lg') + `<span class="stars-value" id="rate-num" style="margin-left:.7rem">${value ? value.toFixed(1) : '—'}</span>`;
    const widget = container.querySelector('.stars');
    const fill = container.querySelector('.stars__fill');
    const num = container.querySelector('#rate-num');
    widget.classList.add('stars--interactive');
    widget.tabIndex = 0;
    widget.setAttribute('role', 'slider');
    widget.setAttribute('aria-label', 'Tu puntaje, de 0.5 a 5 estrellas');
    widget.setAttribute('aria-valuemin', '0'); widget.setAttribute('aria-valuemax', '5');
    const setVisual = (v) => { fill.style.width = (v / 5) * 100 + '%'; num.textContent = v ? v.toFixed(1) : '—'; };
    const fromX = (clientX) => {
      const r = widget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      return Math.max(0.5, Math.ceil(ratio * 10) / 2);
    };
    widget.addEventListener('pointermove', (e) => setVisual(fromX(e.clientX)));
    widget.addEventListener('pointerleave', () => setVisual(value));
    widget.addEventListener('pointerdown', (e) => { value = fromX(e.clientX); commit(); });
    widget.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { value = Math.min(5, (value || 0) + 0.5); commit(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { value = Math.max(0, (value || 0) - 0.5); commit(); e.preventDefault(); }
    });
    function commit() {
      if (guestBlock()) { value = typeof initial === 'number' ? initial : 0; setVisual(value); return; }
      setVisual(value);
      widget.setAttribute('aria-valuenow', value);
      if (value && !movies.some((x) => x.id === f.id)) addExtraFilm({ ...f }); // persist discovered/new films when rated
      store.setRating(f.id, u.id, value || null);
      const clear = $('#rate-clear', sheet); if (clear) clear.hidden = !value;
    }
  }

  /* ---------- like ---------- */
  function toggleLike(f, btn, relabel) {
    if (guestBlock()) return;
    const u = currentUser();
    store.toggleLike(f.id, u.id);
    const liked = store.get(f.id, u.id).liked;
    btn.classList.toggle('is-liked', liked);
    btn.classList.add('pop');
    setTimeout(() => btn.classList.remove('pop'), 360);
    if (relabel) btn.innerHTML = `${icon('favorite')} ${liked ? 'Te gusta' : 'Me gusta'}`;
  }

  /* ---------- trailer overlay ---------- */
  function openTrailer(f) {
    if (!f.trailer) return;
    let el = document.getElementById('trailer');
    if (!el) { el = document.createElement('div'); el.id = 'trailer'; el.className = 'trailer'; document.body.appendChild(el); }
    const httpOrigin = location.protocol === 'http:' || location.protocol === 'https:';
    const src = `https://www.youtube.com/embed/${f.trailer}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1` + (httpOrigin ? `&origin=${encodeURIComponent(location.origin)}` : '');
    el.innerHTML =
      `<div class="trailer__scrim" data-tclose></div>` +
      `<button class="trailer__back" data-tclose aria-label="Volver">${icon('arrow_back')}</button>` +
      `<div class="trailer__box">` +
      `<div class="trailer__frame"><iframe id="trailer-if" src="${src}" title="Trailer de ${f.title}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` +
      (!httpOrigin ? `<div class="trailer__warn">${icon('info')} Para que reproduzca acá, abrí PWM desde el servidor (http://…), no con doble clic. En el sitio publicado anda solo.</div>` : '') +
      `<div class="trailer__bar"><span class="trailer__title">${f.title}${f.year ? ` · ${f.year}` : ''} — Trailer</span>` +
      `<div class="trailer__ctrls">` +
      `<button class="btn btn--soft" id="trailer-pause">${icon('pause')} Pausa</button>` +
      `<button class="btn btn--soft" id="trailer-fs">${icon('fullscreen')} Full screen</button>` +
      `<a class="btn btn--soft" href="https://www.youtube.com/watch?v=${f.trailer}" target="_blank" rel="noopener">${icon('open_in_new')} YouTube</a>` +
      `<button class="btn btn--accent" data-tclose>${icon('close')} Salir</button>` +
      `</div></div></div>`;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    const iframe = el.querySelector('#trailer-if');
    const cmd = (func) => { try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*'); } catch {} };
    let playing = true;
    el.querySelector('#trailer-pause').addEventListener('click', (e) => {
      playing = !playing;
      cmd(playing ? 'playVideo' : 'pauseVideo');
      e.currentTarget.innerHTML = playing ? `${icon('pause')} Pausa` : `${icon('play_arrow')} Seguir`;
    });
    el.querySelector('#trailer-fs').addEventListener('click', () => {
      const fr = el.querySelector('.trailer__frame');
      (fr.requestFullscreen || fr.webkitRequestFullscreen || function () {}).call(fr);
    });
    el.querySelectorAll('[data-tclose]').forEach((b) => b.addEventListener('click', closeTrailer));
    document.addEventListener('keydown', onTrailerKey);
  }
  function onTrailerKey(e) { if (e.key === 'Escape') closeTrailer(); }
  function closeTrailer() {
    const el = document.getElementById('trailer');
    if (el) { el.innerHTML = ''; el.hidden = true; }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onTrailerKey);
  }

  /* ---------- add-film live search (TMDB) ---------- */
  function openAddFilm(onAdded) {
    if (!WM.api || !WM.api.available) return;
    let el = document.getElementById('addfilm');
    if (!el) { el = document.createElement('div'); el.id = 'addfilm'; el.className = 'addfilm'; document.body.appendChild(el); }
    el.innerHTML =
      `<div class="addfilm__scrim" data-aclose></div>` +
      `<div class="addfilm__panel">` +
      `<div class="addfilm__head"><h3>Agregar peli</h3><button class="icon-btn" data-aclose aria-label="Cerrar">${icon('close')}</button></div>` +
      `<label class="search search--lg"><span class="material-symbols-rounded">search</span><input id="af-input" type="search" placeholder="Buscar película o serie…" autocomplete="off"></label>` +
      `<div class="addfilm__results" id="af-results"><p class="addfilm__hint">Escribí un título para buscar en TMDB.</p></div>` +
      `</div>`;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    const input = el.querySelector('#af-input');
    const results = el.querySelector('#af-results');
    let t;
    input.addEventListener('input', () => {
      clearTimeout(t);
      const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = `<p class="addfilm__hint">Escribí al menos 2 letras…</p>`; return; }
      results.innerHTML = `<p class="addfilm__hint">Buscando…</p>`;
      t = setTimeout(async () => {
        try {
          const list = await WM.api.search(q);
          if (!list.length) { results.innerHTML = `<p class="addfilm__hint">Sin resultados.</p>`; return; }
          results.innerHTML = '';
          list.forEach((rr) => {
            const already = movies.some((m) => m.tmdb === rr.id || m.id === `x-${rr.kind}-${rr.id}`);
            const card = document.createElement('button');
            card.className = 'af-res';
            if (already) card.disabled = true;
            card.innerHTML =
              `<div class="af-res__poster" style="background:${rr.poster ? `#0d0303 url(${rr.poster}) center/cover` : 'var(--surface-2)'}"></div>` +
              `<div class="af-res__body"><div class="af-res__title">${escapeHtml(rr.title)}</div>` +
              `<div class="af-res__meta">${rr.year || ''} · ${rr.kind === 'series' ? 'Serie' : 'Película'}</div></div>` +
              `<span class="af-res__add material-symbols-rounded">${already ? 'check_circle' : 'add_circle'}</span>`;
            card.addEventListener('click', async () => {
              if (card.disabled) return;
              card.disabled = true;
              card.querySelector('.af-res__add').textContent = 'hourglass_top';
              try {
                const film = await WM.api.addDetails(rr.id, rr.media);
                addExtraFilm(film);
                card.querySelector('.af-res__add').textContent = 'check_circle';
                if (onAdded) onAdded(film);
              } catch { card.disabled = false; card.querySelector('.af-res__add').textContent = 'error'; }
            });
            results.appendChild(card);
          });
        } catch { results.innerHTML = `<p class="addfilm__hint">Error al buscar. Probá de nuevo.</p>`; }
      }, 350);
    });
    el.querySelectorAll('[data-aclose]').forEach((b) => b.addEventListener('click', closeAddFilm));
    document.addEventListener('keydown', onAddKey);
    setTimeout(() => input.focus(), 60);
  }
  function onAddKey(e) { if (e.key === 'Escape') closeAddFilm(); }
  function closeAddFilm() {
    const el = document.getElementById('addfilm');
    if (el) { el.innerHTML = ''; el.hidden = true; }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onAddKey);
  }

  /* ---------- mobile tap-to-place (tier can't be dragged on touch) ---------- */
  const isTouch = () => window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches;

  function openPickSheet(title, itemsFn) {
    let el = document.getElementById('picksheet');
    if (!el) { el = document.createElement('div'); el.id = 'picksheet'; el.className = 'picksheet'; document.body.appendChild(el); }
    const render = () => {
      const items = itemsFn();
      el.innerHTML =
        `<div class="picksheet__scrim" data-pclose></div>` +
        `<div class="picksheet__panel"><div class="picksheet__head"><h3>${title}</h3><button class="icon-btn" data-pclose aria-label="Cerrar">${icon('close')}</button></div>` +
        `<div class="picksheet__list">` +
        (items.length ? items.map((it, i) =>
          `<button class="pickrow" data-i="${i}">` +
          (it.thumb ? `<span class="pickrow__thumb" style="background:${it.thumb}"></span>` : `<span class="pickrow__ic material-symbols-rounded"${it.color ? ` style="color:${it.color}"` : ''}>${it.icon || 'label'}</span>`) +
          `<span class="pickrow__label">${escapeHtml(it.label)}</span>${it.sub ? `<span class="pickrow__sub">${it.sub}</span>` : ''}${it.check ? `<span class="pickrow__check material-symbols-rounded">check</span>` : ''}</button>`).join('')
          : `<p class="addfilm__hint">No hay pelis para elegir. Puntuá alguna o usá “Agregar peli”.</p>`) +
        `</div></div>`;
      el.querySelectorAll('[data-pclose]').forEach((b) => b.addEventListener('click', closePickSheet));
      el.querySelectorAll('.pickrow').forEach((b) => b.addEventListener('click', () => { const it = itemsFn()[+b.dataset.i]; if (it && it.onClick) it.onClick(render); }));
    };
    render();
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onPickKey);
  }
  function onPickKey(e) { if (e.key === 'Escape') closePickSheet(); }
  function closePickSheet() {
    const el = document.getElementById('picksheet');
    if (el) { el.innerHTML = ''; el.hidden = true; }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onPickKey);
  }

  function openTierPicker(tierId, B) {
    const label = (rowsOf(B).find((t) => t.id === tierId) || {}).label || '';
    openPickSheet(`Poné en ${label}`, () =>
      boardEligible(B)
        .filter((f) => (boardGet(B, f.id) || null) !== tierId)
        .map((f) => ({
          thumb: posterArt(f), label: f.title, sub: boardGet(B, f.id) ? '(mover)' : '',
          onClick: (render) => { if (guestBlock()) return; boardSet(B, f.id, tierId); fillTier(B); render(); },
        })));
  }
  function openChipMenu(filmId, B) {
    const f = byId(filmId); if (!f) return;
    openPickSheet(f.title, () => {
      const cur = boardGet(B, filmId);
      return [
        ...rowsOf(B).map((t) => ({ icon: 'label', color: t.color, label: t.label, check: cur === t.id, onClick: () => { if (guestBlock()) return; boardSet(B, filmId, t.id); fillTier(B); closePickSheet(); } })),
        { icon: 'remove_circle', label: 'Sacar (Sin ubicar)', onClick: () => { if (guestBlock()) return; boardSet(B, filmId, null); fillTier(B); closePickSheet(); } },
        { icon: 'info', label: 'Ver ficha', onClick: () => { closePickSheet(); openSheet(f); } },
      ];
    });
  }

  /* ============================================================= PERFIL
   * Perfil = la vista linda (stats, medallas, reseñas). Configuraciones = los ajustes de la cuenta.
   * Cuando una peli no tiene fecha cargada a mano, usamos la fecha en que se puntuó. */
  function seenDate(f, uid) {
    const wm = watchMetaOf(f.id, uid).date;
    if (wm) return wm;
    const t = store.get(f.id, uid).updatedAt;
    return t ? String(t).slice(0, 10) : null;
  }
  const isoWeek = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
  };
  function profileStats(uid) {
    const rated = movies.filter((f) => verdictOf(f.id, uid).rating != null);
    const reviews = movies.filter((f) => (verdictOf(f.id, uid).review || '').trim());
    const likes = movies.filter((f) => verdictOf(f.id, uid).liked);
    const year = String(new Date().getFullYear());
    const byDay = {}, byMonth = {}, byWeek = {};
    rated.forEach((f) => {
      const d = seenDate(f, uid); if (!d) return;
      (byDay[d] = byDay[d] || []).push(f);
      byMonth[d.slice(0, 7)] = (byMonth[d.slice(0, 7)] || 0) + 1;
      const w = isoWeek(d); (byWeek[w] = byWeek[w] || new Set()).add(d);
    });
    const dist = {};
    rated.forEach((f) => { const r = verdictOf(f.id, uid).rating; dist[r] = (dist[r] || 0) + 1; });
    const genres = {};
    rated.forEach((f) => (f.genres || []).forEach((g) => (genres[g] = (genres[g] || 0) + 1)));
    const sum = rated.reduce((a, f) => a + verdictOf(f.id, uid).rating, 0);
    // tier: ¿tiene al menos una peli en cada fila? ¿cuántas en la fila de arriba?
    const rows = K.tierRows(store, 'def:' + uid, TIER_DEFAULTS, TIER_RAMP);
    const placed = {};
    movies.forEach((f) => { const t = store.getTier(f.id, uid); if (t) placed[t] = (placed[t] || 0) + 1; });
    return {
      rated: rated.length,
      thisYear: rated.filter((f) => (seenDate(f, uid) || '').startsWith(year)).length,
      series: rated.filter((f) => f.kind === 'series').length,
      movies: rated.filter((f) => f.kind !== 'series').length,
      reviews: reviews.length, likes: likes.length,
      avg: rated.length ? sum / rated.length : 0,
      byDay, byMonth, byWeek, dist, genres,
      bestMonth: Math.max(0, ...Object.values(byMonth)),
      bestWeek: Math.max(0, ...Object.values(byWeek).map((s) => s.size)),
      topRow: placed[(rows[0] || {}).id] || 0,
      tierFull: rows.length > 0 && rows.every((r) => placed[r.id]),
      ratedList: rated, reviewList: reviews,
    };
  }
  const MEDALS = [
    { icon: 'rate_review', name: 'Primera reseña', desc: 'Escribí una reseña', goal: 1, get: (s) => s.reviews },
    { icon: 'local_movies', name: 'Cinéfilo', desc: '10 títulos puntuados', goal: 10, get: (s) => s.rated },
    { icon: 'theaters', name: 'Maratón', desc: '25 títulos puntuados', goal: 25, get: (s) => s.rated },
    { icon: 'workspace_premium', name: 'Centurión', desc: '100 títulos puntuados', goal: 100, get: (s) => s.rated },
    { icon: 'edit_note', name: 'Crítico', desc: '10 reseñas escritas', goal: 10, get: (s) => s.reviews },
    { icon: 'favorite', name: 'Corazón grande', desc: '25 me gusta', goal: 25, get: (s) => s.likes },
    { icon: 'live_tv', name: 'Seriéfilo', desc: '5 series puntuadas', goal: 5, get: (s) => s.series },
    { icon: 'table_rows', name: 'Tier completa', desc: 'Al menos una peli en cada fila', goal: 1, get: (s) => (s.tierFull ? 1 : 0) },
    { icon: 'calendar_month', name: 'Mes intenso', desc: '5 pelis en un mismo mes', goal: 5, get: (s) => s.bestMonth },
    { icon: 'bolt', name: 'Semana redonda', desc: '3 días con pelis en la misma semana', goal: 3, get: (s) => s.bestWeek },
    { icon: 'star', name: 'Amante del PRIME', desc: '10 pelis en la fila de arriba', goal: 10, get: (s) => s.topRow },
  ];
  function statTile(n, label, sub) {
    return `<div class="ptile"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  function miniCalendar(byDay, color) {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const start = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let html = WEEKDAYS.map((w) => `<span class="pmc__h">${w[0]}</span>`).join('');
    for (let i = 0; i < start; i++) html += `<span class="pmc__d pmc__d--out"></span>`;
    for (let d = 1; d <= days; d++) {
      const iso = isoDate(y, m, d);
      const n = (byDay[iso] || []).length;
      const today = d === now.getDate();
      html += `<span class="pmc__d${n ? ' is-on' : ''}${today ? ' is-today' : ''}"${n ? ` style="--c:${color}" title="${n} el ${d}"` : ''}>${d}</span>`;
    }
    return `<div class="pmc"><div class="pmc__title">${MONTHS[m]} ${y}</div><div class="pmc__grid">${html}</div></div>`;
  }
  function yearStrip(byMonth, color) {
    const out = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: MONTHS[d.getMonth()].slice(0, 3), n: byMonth[key] || 0 });
    }
    const max = Math.max(1, ...out.map((o) => o.n));
    return `<div class="pbars">${out.map((o) => `<div class="pbar" title="${o.n} en ${o.label}"><span class="pbar__fill" style="height:${Math.round((o.n / max) * 100)}%;--c:${color}"></span><small>${o.label}</small></div>`).join('')}</div>`;
  }
  function distChart(dist, color) {
    const steps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    const max = Math.max(1, ...steps.map((s) => dist[s] || 0));
    return `<div class="pbars pbars--dist">${steps.map((s) => `<div class="pbar" title="${dist[s] || 0} con ${s}★"><span class="pbar__fill" style="height:${Math.round(((dist[s] || 0) / max) * 100)}%;--c:${color}"></span><small>${s}</small></div>`).join('')}</div>`;
  }
  function genreChart(genres, color) {
    const top = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!top.length) return `<p class="addfilm__hint">Todavía sin datos.</p>`;
    const max = top[0][1];
    return `<div class="prows">${top.map(([g, n]) => `<div class="prow"><span class="prow__l">${escapeHtml(g)}</span><span class="prow__t"><span class="prow__f" style="width:${Math.round((n / max) * 100)}%;--c:${color}"></span></span><b>${n}</b></div>`).join('')}</div>`;
  }
  function profileDetail(iconName, title, insight, body, explanation, open = false) {
    return `<details class="pcard pdetail"${open ? ' open' : ''}>` +
      `<summary class="pdetail__summary"><span class="pdetail__title">${icon(iconName)}<span><b>${title}</b><small>${escapeHtml(insight)}</small></span></span><span class="pdetail__toggle">${icon('expand_more')}</span></summary>` +
      `<div class="pdetail__body">${body}<p class="pdetail__explain">${explanation}</p></div></details>`;
  }

  function renderPerfil(app, uid) {
    const me = currentUser();
    if (me.guest) { store.clearUser(); return showGate(); }
    const id = uid || me.id;
    const u = users[id] || me;
    const mine = id === me.id;
    const s = profileStats(id);
    const acc = store.getAccounts()[id] || {};
    const bio = acc.bio || '';
    const year = String(new Date().getFullYear());
    const topGenre = (Object.entries(s.genres).sort((a, b) => b[1] - a[1])[0] || ['Sin datos'])[0];
    let medalsDone = 0;
    const medals = MEDALS.map((md) => {
      const have = md.get(s);
      const done = have >= md.goal;
      if (done) medalsDone++;
      const pct = Math.min(100, Math.round((have / md.goal) * 100));
      return `<div class="pmedal${done ? ' is-done' : ''}" style="--c:${u.color}">` +
        `<span class="pmedal__ic">${icon(md.icon)}</span>` +
        `<div class="pmedal__b"><b>${md.name}</b><small>${md.desc}</small>` +
        `<span class="pmedal__bar"><span style="width:${pct}%"></span></span>` +
        `<span class="pmedal__n">${Math.min(have, md.goal)} / ${md.goal}</span></div>` +
        (done ? `<span class="pmedal__check">${icon('check_circle')}</span>` : '') + `</div>`;
    }).join('');
    app.innerHTML = '';
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    sec.innerHTML =
      `<div class="phero phero--overview" style="--c:${u.color}"><div class="phero__identity">` +
      `<button class="phero__av" id="p-photo" ${mine ? '' : 'disabled'} title="${mine ? 'Cambiar foto' : ''}">${avatarHTML(u, 'avatar phero__avatar')}${mine ? `<span class="phero__cam">${icon('photo_camera')}</span>` : ''}</button>` +
      `<div class="phero__body"><h2 class="phero__name">${escapeHtml(u.name)}</h2>` +
      `<p class="phero__handle">@${escapeHtml(u.lb || u.handle || u.id)}${u.lb ? ' · Letterboxd' : ''}</p>` +
      `<p class="phero__bio" id="p-bio">${bio ? escapeHtml(bio) : (mine ? '<i>Sin descripción — tocá para escribir algo.</i>' : '<i>Sin descripción.</i>')}</p>` +
      (mine ? `<button class="linklike" id="p-editbio">${icon('edit')} Editar descripción</button>` : '') +
      `</div></div><div class="ptiles ptiles--overview">` +
      statTile(s.rated, 'títulos vistos', 'puntuados') +
      statTile(s.thisYear, 'este año', year) +
      statTile(s.movies, 'pelis') +
      statTile(s.series, 'series') +
      statTile(s.reviews, 'reseñas') +
      statTile(s.likes, 'me gusta') +
      statTile(s.avg ? s.avg.toFixed(2) : '—', 'promedio', 'de 5') +
      `</div></div>` +

      `<div class="profile-layout"><div class="profile-main">` +
      `<section class="profile-block"><h3 class="section__title psub"><span class="accentbar">/</span> Últimas reseñas</h3><div class="pgrid pgrid--wide" id="p-reviews"></div></section>` +
      `<section class="profile-block"><h3 class="section__title psub"><span class="accentbar">/</span> Mejor rankeadas</h3><div class="row" id="p-best"></div></section>` +
      `</div><aside class="profile-rail" aria-label="Actividad y estadísticas">` +
      `<div class="pcard profile-calendar"><h4>${icon('calendar_month')} Este mes</h4>${miniCalendar(s.byDay, u.color)}<p class="pdetail__explain">Los días marcados muestran cuándo viste o puntuaste algo durante el mes.</p></div>` +
      profileDetail('bar_chart', 'Últimos 12 meses', `${s.thisYear} en ${year}`, yearStrip(s.byMonth, u.color), 'Cada barra representa cuántos títulos registraste en ese mes. Sirve para ver tus épocas más activas.', true) +
      profileDetail('star', 'Cómo puntuás', s.avg ? `${s.avg.toFixed(2)} de promedio` : 'Sin promedio', distChart(s.dist, u.color), 'Agrupa tus puntuaciones de media en media estrella para mostrar si sos más exigente o generoso al puntuar.') +
      profileDetail('category', 'Tus géneros', topGenre, genreChart(s.genres, u.color), 'Cuenta los géneros presentes en los títulos que puntuaste. Una película puede sumar en más de un género.') +
      profileDetail('workspace_premium', 'Medallas', `${medalsDone} de ${MEDALS.length} logradas`, `<div class="pmedals">${medals}</div>`, 'Se desbloquean automáticamente con tu actividad. La barra muestra cuánto te falta para cada objetivo.') +
      `</aside></div>`;
    app.appendChild(sec);
    app.appendChild(buildFooter());

    const revs = s.reviewList
      .map((f) => ({ f, t: Date.parse(store.get(f.id, id).updatedAt || 0) || 0 }))
      .sort((a, b) => b.t - a.t).slice(0, 4);
    const rw = sec.querySelector('#p-reviews');
    if (!revs.length) rw.innerHTML = `<p class="addfilm__hint">Todavía sin reseñas.</p>`;
    revs.forEach(({ f }) => {
      const v = verdictOf(f.id, id);
      const c = document.createElement('button');
      c.className = 'prev';
      c.innerHTML = `<span class="prev__poster" style="background:${posterArt(f)}"></span>` +
        `<span class="prev__b"><b>${escapeHtml(f.title)}</b>` +
        `<span class="prev__stars">${starsMarkup(v.rating || 0, 'sm')}${v.rating != null ? `<span class="stars-value">${v.rating.toFixed(1)}</span>` : ''}</span>` +
        `<span class="prev__txt">“${escapeHtml(v.review)}”</span></span>`;
      c.addEventListener('click', () => openSheet(f));
      rw.appendChild(c);
    });

    const best = s.ratedList.slice().sort((a, b) => verdictOf(b.id, id).rating - verdictOf(a.id, id).rating).slice(0, 12);
    const bw = sec.querySelector('#p-best');
    if (!best.length) bw.innerHTML = `<p class="addfilm__hint">Puntuá algo y aparece acá.</p>`;
    best.forEach((f) => bw.appendChild(posterCard(f)));

    if (mine) {
      sec.querySelector('#p-photo').addEventListener('click', () => K.pickPhoto((data) => {
        K.accounts.patch(store, id, { photo: data });
        refreshUsers(); renderHeader(); renderPerfil(app);
        K.toast('Foto actualizada ✓');
      }));
      sec.querySelector('#p-editbio').addEventListener('click', () => openBioEditor(app, id, bio));
    }
  }
  function openBioEditor(app, id, bio) {
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
      `<div class="confirm__title">Tu descripción</div>` +
      `<div class="review-field"><textarea id="bio-txt" maxlength="240" placeholder="Contá algo tuyo…">${escapeHtml(bio)}</textarea></div>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button>` +
      `<button class="btn btn--accent" id="bio-ok">${icon('check')} Guardar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#bio-ok').addEventListener('click', () => {
      K.accounts.patch(store, id, { bio: el.querySelector('#bio-txt').value.trim() });
      refreshUsers(); el.hidden = true; renderPerfil(app);
    });
    setTimeout(() => el.querySelector('#bio-txt').focus(), 40);
  }

  /* ============================================================= CONFIGURACIONES */
  function renderConfig(app) {
    const me = currentUser();
    if (me.guest) { store.clearUser(); return showGate(); }
    const acc = store.getAccounts()[me.id] || {};
    const importState = (WM.importStatus || {})[me.id] || null;
    const syncLine = importState
      ? `${importState.message}${importState.syncedAt ? ` · ${new Date(importState.syncedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}${importState.ok ? ` · ${importState.watched || 0} vistas` : ''}`
      : 'Todavía no hay una sincronización registrada.';
    app.innerHTML = '';
    const sec = document.createElement('section');
    sec.className = 'section';
    sec.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    sec.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">Configuraciones</h3>` +
      `<p class="section__sub">Tu cuenta — es la misma para <b>PWM</b> y <b>PRB</b>.</p></div></div>` +
      `<div class="cfg">` +
      `<div class="cfg__row"><div class="cfg__l">${icon('account_circle')}<div><b>Foto de perfil</b><small>Se recorta y se guarda chiquita (400×400).</small></div></div>` +
      `<div class="cfg__r">${avatarHTML(me, 'avatar cfg__av')}<button class="btn btn--soft btn--xs" id="cfg-photo">${icon('photo_camera')} Cambiar</button>` +
      (acc.photo ? `<button class="btn btn--soft btn--xs" id="cfg-photo-off">${icon('delete')} Sacar</button>` : '') + `</div></div>` +

      `<div class="cfg__row"><div class="cfg__l">${icon('badge')}<div><b>Nombre</b><small>Cómo te ven en la app.</small></div></div>` +
      `<div class="cfg__r"><input class="cfg__in" id="cfg-name" maxlength="24" value="${escapeHtml(me.name)}"></div></div>` +

      `<div class="cfg__row"><div class="cfg__l">${icon('palette')}<div><b>Tu color</b><small>Pinta tus puntajes y los acentos.</small></div></div>` +
      `<div class="cfg__r su-colors">${NEW_COLORS.map((c) => `<button class="su-color${c.toLowerCase() === String(me.color).toLowerCase() ? ' is-on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>` +

      `<div class="cfg__row"><div class="cfg__l">${icon('link')}<div><b>Usuario de Letterboxd</b><small>Para importar reseñas, likes, estrellas, watchlist y vistas. Entra en la próxima corrida del robot (máx. 24h).</small></div></div>` +
      `<div class="cfg__r cfg__r--sync"><input class="cfg__in" id="cfg-lb" maxlength="40" placeholder="tuusuario" value="${escapeHtml(acc.lb || me.lb || me.handle || '')}">` +
      `<span class="cfg-sync${importState && !importState.ok ? ' is-bad' : ''}">${icon(importState && importState.ok ? 'cloud_done' : 'sync_problem')} ${escapeHtml(syncLine)}</span></div></div>` +

      `<div class="cfg__row"><div class="cfg__l">${icon('lock')}<div><b>Contraseña</b><small>4 números. ${K.accounts.hasPin(store, me.id) ? 'Ya tenés una propia.' : 'Todavía usás la de fábrica (1234).'}</small></div></div>` +
      `<div class="cfg__r"><button class="btn btn--soft btn--xs" id="cfg-pin">${icon('key')} Cambiar contraseña</button></div></div>` +

      `<div class="cfg__row"><div class="cfg__l">${icon('logout')}<div><b>Cerrar sesión</b><small>Volvés a la pantalla de “¿Quién sos?”.</small></div></div>` +
      `<div class="cfg__r"><button class="btn btn--soft btn--xs cfg__danger" id="cfg-out">${icon('logout')} Cerrar sesión</button></div></div>` +
      `</div>` +
      `<div class="cfg__actions"><button class="btn btn--accent" id="cfg-save">${icon('save')} Guardar cambios</button><span class="saved-flag" id="cfg-flag">guardado ✓</span></div>`;
    app.appendChild(sec);
    app.appendChild(buildFooter());

    let color = me.color;
    sec.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      color = b.dataset.c;
      sec.querySelectorAll('.su-color').forEach((x) => x.classList.toggle('is-on', x === b));
    }));
    sec.querySelector('#cfg-photo').addEventListener('click', () => K.pickPhoto((data) => {
      K.accounts.patch(store, me.id, { photo: data }); refreshUsers(); renderHeader(); renderConfig(app); K.toast('Foto actualizada ✓');
    }));
    const off = sec.querySelector('#cfg-photo-off');
    if (off) off.addEventListener('click', () => { K.accounts.patch(store, me.id, { photo: null }); refreshUsers(); renderHeader(); renderConfig(app); });
    sec.querySelector('#cfg-pin').addEventListener('click', () => changePin(me));
    sec.querySelector('#cfg-out').addEventListener('click', () => { stopHero(); store.clearUser(); showGate(); });
    sec.querySelector('#cfg-save').addEventListener('click', () => {
      const name = sec.querySelector('#cfg-name').value.trim() || me.name;
      const lb = sec.querySelector('#cfg-lb').value.trim().replace(/^@/, '');
      K.accounts.patch(store, me.id, { name, color, lb, initial: name.charAt(0).toUpperCase() });
      refreshUsers(); applyAccent(); renderHeader();
      const flag = sec.querySelector('#cfg-flag'); flag.classList.add('show'); setTimeout(() => flag.classList.remove('show'), 1600);
      renderConfig(app);
    });
  }
  function changePin(u) {
    const hasOwn = K.accounts.hasPin(store, u.id);
    let stage = hasOwn ? 'old' : 'new';
    let first = null;
    K.pinPad({
      avatar: avatarHTML(u, 'profile__avatar'), name: u.name, color: u.color,
      label: hasOwn ? 'Contraseña actual' : 'Elegí tu nueva contraseña',
      async onDone(pin, ctl) {
        if (stage === 'old') {
          if (!(await K.accounts.checkPin(store, u.id, pin))) return ctl.fail('Esa no es la actual');
          stage = 'new'; return ctl.next('Nueva contraseña');
        }
        if (stage === 'new') { first = pin; stage = 'rep'; return ctl.next('Repetila'); }
        if (pin !== first) { stage = 'new'; first = null; return ctl.next('No coinciden — probá de nuevo'); }
        await K.accounts.setPin(store, u.id, pin);
        ctl.close();
        K.toast('Contraseña cambiada ✓');
        if (route === 'config') renderConfig($('#app'));
      },
    });
  }

  /* ---------- misc ---------- */
  function buildFooter() {
    const f = document.createElement('footer');
    f.className = 'footer';
    const b = WM.build || { version: '1.0', built: null };
    let ver = `versión ${b.version}`;
    if (b.built) { const d = new Date(b.built); ver += ` · ${d.toLocaleDateString('es-AR')} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`; }
    f.innerHTML =
      `<a class="footer__x" href="prb/index.html">${icon('menu_book')} <span><b>PRB</b> · Project Read Books</span> <span class="footer__x-go">${icon('arrow_forward')}</span></a>` +
      `<div class="footer__meta"><b>PWM</b> — <b style="color:var(--ink-dim)">Project Watch Movies</b>. Watchlists de Letterboxd con actualización semanal · imágenes HD (TMDB) · puntajes IMDb + Rotten Tomatoes (OMDb).<span class="footer__ver">${ver}</span></div>`;
    return f;
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ============================================================= BOOT */
  function startApp() {
    applyAccent();
    renderHeader();
    setRoute('home');
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  (async () => {
    await store.init(); mergeExtras(); refreshUsers(); // load shared state from Supabase (falls back to local cache)
    const uid = store.getUser();
    if (uid && (users[uid] || uid === 'guest')) { applyAccent(); startApp(); } else { showGate(); }

    /* Everything is live now, not just the notifications: the store pushes on every remote change
     * (Supabase Realtime, or a light poll if the socket can't join) and we redraw what's on screen. */
    let painting = false;
    store.onRemote(() => {
      if (painting || !store.getUser() || !gate.hidden) return;
      painting = true;
      requestAnimationFrame(() => {
        painting = false;
        mergeExtras(); refreshUsers();
        const busy = !$('#sheet').hidden
          || document.getElementById('swiper')?.hidden === false
          || $('#confirm').hidden === false
          || document.getElementById('invite')?.hidden === false
          || document.getElementById('calday')?.hidden === false;
        renderHeader();                                  // el +N del calendario siempre al día
        if (!busy) renderRoute();
      });
    });
    store.startLive();

    // Belt and braces: also re-sync when the tab regains focus.
    let refreshing = false;
    window.addEventListener('focus', async () => {
      if (refreshing || !store.getUser()) return;
      refreshing = true;
      await store.refresh(); mergeExtras(); refreshUsers();
      refreshing = false;
    });
  })();
})();
