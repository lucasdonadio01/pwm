/* WatchMovies — app controller (vanilla, no build step) */
(function () {
  'use strict';
  const users = WM.users;
  const trending = WM.trending;
  const store = WM.store;

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
  // Watchlist = films that live on a Letterboxd watchlist (not the already-watched imports/extras).
  const isWatchlist = (f) => ['bian', 'luke', 'both'].includes(f.owner);
  const watchlistFilms = () => movies.filter(isWatchlist);

  // Merge in-app verdicts (store) with the Letterboxd baseline (rating/like/review from WM.letterboxd).
  const lbData = () => WM.letterboxd || {};
  function lbVerdict(fid, uid) { const u = lbData()[uid]; return (u && u[fid]) || null; }
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

  // Photo avatars: drop files at assets/<id>.jpg. If missing/broken, the initial letter shows.
  const PHOTOS = { bian: 'assets/bian.jpg', luke: 'assets/luke.jpg' };
  function avatarHTML(u, cls = 'avatar') {
    const p = PHOTOS[u.id];
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
  const currentUser = () => users[store.getUser()] || null;
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
      btn.addEventListener('click', () => {
        showPassword(u, () => { store.setUser(u.id); applyAccent(); gate.hidden = true; startApp(); });
      });
      wrap.appendChild(btn);
    });
    gate.hidden = false;
  }

  /* ---------- password gate (numeric keypad) ---------- */
  const PIN = '1234';
  let passKeyHandler = null;
  function showPassword(u, onOk) {
    let el = document.getElementById('passgate');
    if (!el) { el = document.createElement('div'); el.id = 'passgate'; el.className = 'passgate'; document.body.appendChild(el); }
    el.style.setProperty('--c', u.color);
    let entered = '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
    function draw(err) {
      el.innerHTML =
        `<button class="passgate__back" data-pgback aria-label="Volver">${icon('arrow_back')}</button>` +
        `<div class="passgate__inner">` + avatarHTML(u, 'profile__avatar') +
        `<div class="passgate__name" style="color:${u.color}">${u.name}</div>` +
        `<div class="passgate__label">Ingresá la contraseña</div>` +
        `<div class="passgate__dots${err ? ' shake' : ''}">${[0, 1, 2, 3].map((i) => `<span class="pdot${i < entered.length ? ' on' : ''}"></span>`).join('')}</div>` +
        `<div class="passgate__keys">` + keys.map((k) => k === 'back' ? `<button class="pkey pkey--fn" data-k="back" aria-label="Borrar">${icon('backspace')}</button>` : k === 'ok' ? `<button class="pkey pkey--fn" data-k="ok" aria-label="Aceptar">${icon('check')}</button>` : `<button class="pkey" data-k="${k}">${k}</button>`).join('') + `</div>` +
        `<div class="passgate__err"${err ? '' : ' style="visibility:hidden"'}>Contraseña incorrecta</div></div>`;
      el.querySelector('[data-pgback]').addEventListener('click', closePassword);
      el.querySelectorAll('.pkey').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    }
    function press(k) {
      if (k === 'back') { entered = entered.slice(0, -1); return draw(); }
      if (k === 'ok') return check();
      if (entered.length >= 4) return;
      entered += k; draw();
      if (entered.length === 4) setTimeout(check, 180);
    }
    function check() { if (entered === PIN) { closePassword(); onOk(); } else { entered = ''; draw(true); } }
    passKeyHandler = (e) => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('back'); else if (e.key === 'Enter') press('ok'); else if (e.key === 'Escape') closePassword(); };
    document.addEventListener('keydown', passKeyHandler);
    draw(); el.hidden = false;
  }
  function closePassword() { const el = document.getElementById('passgate'); if (el) { el.hidden = true; el.innerHTML = ''; } if (passKeyHandler) { document.removeEventListener('keydown', passKeyHandler); passKeyHandler = null; } }

  /* ============================================================= HEADER */
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
    header.innerHTML =
      `<button class="hamburger" id="hamburger" aria-label="Abrir menú">${icon('menu')}</button>` +
      `<a class="logo" href="#home" aria-label="PWM — Project Watch Movies, inicio"><b>PWM</b><span class="dot">.</span></a>` +
      `<nav class="nav" id="nav">${NAV.map((n) => `<a href="#${n.id}" data-route="${n.id}" class="${n.id === route ? 'is-active' : ''}">${n.label}</a>`).join('')}<a class="nav__x" href="prb/index.html">${icon('menu_book')} Libritos</a></nav>` +
      `<div class="header__right">` +
      `<button class="user-chip" id="user-chip" title="Cambiar de usuario">` +
      `<span class="user-chip__name">${u ? u.name : ''}</span>` +
      (u ? avatarHTML(u) : `<span class="avatar" style="--c:var(--hot)">?</span>`) +
      `</button></div>`;

    header.querySelectorAll('[data-route]').forEach((a) =>
      a.addEventListener('click', (e) => { e.preventDefault(); setRoute(a.dataset.route); $('#nav', header).classList.remove('nav--open'); })
    );
    $('.logo', header).addEventListener('click', (e) => { e.preventDefault(); setRoute('home'); $('#nav', header).classList.remove('nav--open'); });
    $('#hamburger', header).addEventListener('click', () => $('#nav', header).classList.toggle('nav--open'));
    $('#user-chip', header).addEventListener('click', openConfirm);
    header.hidden = false;
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
    return watchlistFilms().map((f) => ({ f, s: scoreFilm(f, a) })).sort((x, y) => y.s - x.s).slice(0, 15).map((o) => o.f);
  }

  function buildRecommender() {
    const s = document.createElement('section');
    s.className = 'section recommender';
    s.innerHTML =
      `<button class="rec-toggle" id="rec-toggle" aria-expanded="false">` +
      `<div><h3 class="section__title"><span class="accentbar">/</span> ¿No saben qué ver?</h3>` +
      `<p class="section__sub">Respondé y te tiro 15 de la watchlist</p></div>` +
      `<span class="material-symbols-rounded rec-chev">expand_more</span></button>` +
      `<div class="rec-panel" id="rec-panel" hidden><div class="quiz">` +
      QUIZ.map((q) =>
        `<div class="quiz__q"><div class="quiz__label">${q.q}${q.multi ? ' <span class="quiz__multi">— elegí los que quieras</span>' : ''}</div>` +
        `<div class="quiz__opts" data-q="${q.id}" data-multi="${q.multi ? 1 : 0}">` +
        q.opts.map((o) => `<button class="quiz__opt" data-v="${escapeHtml(o.v)}">${o.label}</button>`).join('') +
        `</div></div>`).join('') +
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
    s.querySelector('#quiz-go').addEventListener('click', () => {
      const wrap = s.querySelector('#quiz-results');
      wrap.innerHTML = `<div class="quiz__reshead">${icon('auto_awesome')} Para ustedes · 15 pelis</div><div class="grid" id="quiz-grid"></div>`;
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
    const ownerU = users[f.owner];
    const ownerTag = ownerU ? `<span class="dot-sep">·</span><span style="color:${ownerU.color}">En la lista de ${ownerU.name}</span>` : '';
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
          `<div class="verdict__main"><div class="verdict__row"><span class="verdict__name">${u.name}</span>${stars}${heart}</div>${review}</div>` +
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

  /* ---------- catalog (Movies / Series) with genre filters ---------- */
  const catState = { movies: 'Todos', series: 'Todos' };
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
    s.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">${cfg.title}</h3>` +
      `<p class="section__sub">${cfg.sub} · ${cfg.list.length} títulos</p></div></div>` +
      `<div class="genrebar" id="genrebar">${chips.map((g) => `<button class="genre${catState[key] === g ? ' is-on' : ''}" data-g="${escapeHtml(g)}">${g}</button>`).join('')}</div>` +
      `<div class="grid" id="grid"></div>`;
    app.appendChild(s);
    app.appendChild(buildFooter());
    const grid = s.querySelector('#grid');
    const fill = () => {
      grid.innerHTML = '';
      const g = catState[key];
      let list = cfg.list;
      if (g === 'Anime') list = cfg.list.filter((f) => (f.genres || []).includes('Animación') && f.lang === 'ja');
      else if (g !== 'Todos') list = cfg.list.filter((f) => (f.genres || []).includes(g));
      if (!list.length) { grid.innerHTML = `<div class="empty">${icon('theaters')}<p>Nada en “${g}”.</p></div>`; return; }
      list.forEach((f) => grid.appendChild(posterCard(f)));
    };
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
  function renderWatchlist(app) {
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    s.innerHTML =
      `<div class="section__head section__head--search"><div>` +
      `<h3 class="section__title">Watchlist</h3>` +
      `<p class="section__sub">Ordenada por prioridad · ${watchlistFilms().length} títulos</p></div>` +
      `<label class="search"><span class="material-symbols-rounded">search</span>` +
      `<input id="wl-search" type="search" placeholder="Buscar en la watchlist…" value="${escapeHtml(wlQuery)}"></label></div>` +
      `<p class="plist__hint">${icon('drag_indicator')} Arrastrá para ordenar, o tocá el número y escribí la posición. El orden lo comparten Bian & Luke.</p>` +
      `<div class="plist" id="plist"></div>`;
    app.appendChild(s);
    app.appendChild(buildFooter());
    const input = s.querySelector('#wl-search');
    input.addEventListener('input', () => { wlQuery = input.value; fillPlist(); });
    enableReorder(s.querySelector('#plist'));
    fillPlist();
  }

  function fillPlist() {
    const plist = document.getElementById('plist'); if (!plist) return;
    plist.innerHTML = '';
    const full = orderedWatchlist();
    const rankOf = new Map(full.map((f, i) => [f.id, i + 1]));
    const q = wlQuery.trim().toLowerCase();
    const list = q ? full.filter((f) => f.title.toLowerCase().includes(q)) : full;
    if (!list.length) { plist.innerHTML = `<div class="empty">${icon('search_off')}<p>Nada con “${escapeHtml(wlQuery)}”.</p></div>`; return; }
    list.forEach((f) => plist.appendChild(plRow(f, rankOf.get(f.id), full.length)));
  }

  function setPriority(filmId, newPos, total) {
    const cur = orderedWatchlist().map((f) => f.id);
    const from = cur.indexOf(filmId); if (from < 0) return;
    cur.splice(from, 1);
    const to = Math.max(0, Math.min(cur.length, (parseInt(newPos, 10) || 1) - 1));
    cur.splice(to, 0, filmId);
    store.setOrder(cur);
    fillPlist();
  }

  function ownerBadge(f, cls) {
    if (f.owner === 'both') return `<span class="${cls}" style="background:linear-gradient(135deg,var(--bian),var(--luke))" title="En las dos listas">✦</span>`;
    const u = users[f.owner];
    return u ? `<span class="${cls}" style="background:${u.color}" title="Lista de ${u.name}">${u.initial}</span>` : '';
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
      if (wlQuery.trim()) { e.preventDefault(); return; } // no reorder while filtering
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

  /* ============================================================= TIER LIST */
  const TIERS = [
    { id: 'prime', label: 'PRIME', sub: 'lo mejor', color: '#BBEF1F' },
    { id: 'buena', label: 'Muy buena', sub: '', color: '#8BE04A' },
    { id: 'nifu', label: 'Ni fu ni fa', sub: 'del montón', color: '#F5C518' },
    { id: 'meh', label: 'Meh', sub: '', color: '#FF8A3D' },
    { id: 'basura', label: 'Basura', sub: 'ni ahí', color: '#FF2D2D' },
  ];

  function renderTier(app, viewId) {
    const me = currentUser();
    const viewU = users[viewId] || me;
    const isMine = viewU.id === me.id;
    const other = Object.values(users).find((x) => x.id !== me.id);
    app.innerHTML = '';
    const s = document.createElement('section');
    s.className = 'section';
    s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    s.innerHTML =
      `<div class="section__head section__head--search"><div>` +
      `<h3 class="section__title">Tier list</h3>` +
      `<p class="section__sub">${isMine ? `El ranking de <b style="color:${viewU.color}">vos (${viewU.name})</b>` : `Mirando el tier de <b style="color:${viewU.color}">${viewU.name}</b> · solo lectura`}</p></div>` +
      `<button class="btn btn--soft" id="tier-view">${icon('swap_horiz')} ${isMine ? `Ver tier de ${other.name}` : 'Volver al mío'}</button></div>` +
      (isMine ? `<p class="tier-hint">${icon('touch_app')} ${isTouch() ? 'Tocá un tier para elegir qué peli poner ahí; tocá una peli ya puesta para moverla.' : 'Arrastrá pósters al tier que merezcan (o tocá una peli para moverla).'}</p>` : '') +
      `<div class="tier-board" id="tier-board">` +
      TIERS.map((t) => `<div class="tier"><div class="tier__label" style="--c:${t.color}"><b>${t.label}</b>${t.sub ? `<small>${t.sub}</small>` : ''}</div><div class="tier__drop" data-tier="${t.id}"></div></div>`).join('') +
      `</div>` +
      `<div class="tier-pool"><div class="tier-pool__head">Sin ubicar <span class="tier-pool__note">— ${isMine ? 'las que ya viste (Letterboxd o app) o agregaste' : `las que ${viewU.name} vio`}</span></div><div class="tier-pool__drop" id="tier-pool" data-tier=""></div></div>` +
      (isMine ? `<div class="tier-add"><button class="btn btn--soft" id="tier-add-btn">${icon('add_circle')} Agregar peli</button></div>` : '');
    app.appendChild(s);
    app.appendChild(buildFooter());
    s.querySelector('#tier-view').addEventListener('click', () => renderTier(app, isMine ? other.id : me.id));
    if (isMine) s.querySelector('#tier-add-btn').addEventListener('click', () => openAddFilm(() => { closeAddFilm(); fillTier(viewU); }));
    if (isMine && isTouch()) {
      // Mobile: tap a tier to pick films into it; tap a placed chip to move it.
      s.querySelectorAll('.tier__drop').forEach((drop) => drop.addEventListener('click', (e) => {
        if (e.target.closest('.chip')) return;
        openTierPicker(drop.dataset.tier, viewU);
      }));
      s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip) openChipMenu(chip.dataset.id, viewU); });
    } else {
      s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip && !chip.classList.contains('dragging')) { const f = byId(chip.dataset.id); if (f) openSheet(f); } });
    }
    fillTier(viewU);
    if (isMine && !isTouch()) enableTierDnD(viewU);
  }

  function tierEligible(u) {
    return movies.filter((f) => verdictOf(f.id, u.id).rating != null || store.getTier(f.id, u.id) || f.extra);
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
  function fillTier(u) {
    const draggable = currentUser().id === u.id;
    document.querySelectorAll('.tier__drop, #tier-pool').forEach((d) => (d.innerHTML = ''));
    tierEligible(u).forEach((f) => {
      const t = store.getTier(f.id, u.id);
      const target = t ? document.querySelector(`.tier__drop[data-tier="${t}"]`) : document.querySelector('#tier-pool');
      if (target) target.appendChild(tierChip(f, draggable));
    });
    const pool = document.querySelector('#tier-pool');
    if (pool && !pool.children.length) pool.innerHTML = `<p class="tier-pool__empty">${draggable ? 'Todavía no hay pelis para ubicar. Puntuá una peli (queda como “vista”) o tocá <b>Agregar peli</b>.' : 'Sin pelis para mostrar.'}</p>`;
  }
  function enableTierDnD(u) {
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
        if (!id) return;
        store.setTier(id, u.id, drop.dataset.tier || null);
        fillTier(u);
      });
    });
  }

  /* ---------- poster card ---------- */
  function posterCard(f, opts = {}) {
    const card = document.createElement('button');
    card.className = 'card';
    const ownerU = users[f.owner];
    const ownerBadge = ownerU ? `<span class="poster__owner" style="background:${ownerU.color}" title="Lista de ${ownerU.name}">${ownerU.initial}</span>` : '';
    const rank = opts.rank ? `<span class="poster__rank">#${opts.rank}</span>` : '';
    const kindBadge = f.kind === 'series' ? `<span class="poster__kind">Serie</span>` : '';
    card.innerHTML =
      `<div class="poster">` +
      `<div class="poster__img" style="background:${posterArt(f)}"></div>` +
      `<div class="poster__label"><span class="t">${f.title}</span><span class="y">${f.year || ''}</span></div>` +
      `${rank}${kindBadge}${ownerBadge}</div>` +
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
  async function loadMoreSw() {
    if (swLoading || !(WM.api && WM.api.available)) return;
    swLoading = true;
    try { (await WM.api.randomMovies()).forEach((m) => { if (!swMovies.some((x) => x.id === m.id)) swMovies.push(m); }); } catch {}
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
      `<button class="swiper__arrow swiper__arrow--prev" data-swprev ${swIndex <= 0 ? 'disabled' : ''} aria-label="Anterior">${icon('chevron_left')}</button>` +
      `<button class="swiper__arrow swiper__arrow--next" data-swnext aria-label="Siguiente">${icon('chevron_right')}</button>` +
      `<div class="swiper__main"><div class="swiper__card"><div class="swiper__poster" style="background:${posterArt(m)}"></div>` +
      `<div class="swiper__meta">${meta}<div class="swiper__t">${escapeHtml(m.title)}</div></div></div>` +
      `<div class="swiper__rate"><div class="swiper__stars" id="sw-stars"></div>` +
      `<button class="swiper__heart ${v.liked ? 'is-liked' : ''}" data-swlike aria-label="Me gusta">${icon('favorite')}</button></div></div>` +
      `<div class="swiper__bar"><button class="swiper__barbtn" data-swprev ${swIndex <= 0 ? 'disabled' : ''} aria-label="Anterior">${icon('arrow_back')}</button>` +
      `<button class="swiper__barbtn swiper__barbtn--heart ${v.liked ? 'is-liked' : ''}" data-swlike aria-label="Me gusta">${icon('favorite')}</button>` +
      `<button class="swiper__barbtn" data-swnext aria-label="Siguiente">${icon('arrow_forward')}</button></div>` +
      `<div class="swiper__hint">Puntuala y seguí → · ✕ para salir</div>`;
    el.querySelectorAll('[data-swclose]').forEach((b) => b.addEventListener('click', closeSwiper));
    el.querySelectorAll('[data-swprev]').forEach((b) => b.addEventListener('click', () => swGo(-1)));
    el.querySelectorAll('[data-swnext]').forEach((b) => b.addEventListener('click', () => swGo(1)));
    el.querySelectorAll('[data-swlike]').forEach((b) => b.addEventListener('click', () => swLike(m)));
    mountSwiperStars($('#sw-stars', el), m, u, v.rating);
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
    const u = currentUser();
    if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m });
    store.toggleLike(m.id, u.id);
    const liked = store.get(m.id, u.id).liked;
    document.querySelectorAll('#swiper [data-swlike]').forEach((b) => b.classList.toggle('is-liked', liked));
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
    function commit() { setV(value); if (!movies.some((x) => x.id === m.id)) addExtraFilm({ ...m }); store.setRating(m.id, u.id, value || null); }
  }
  function onSwiperKey(e) { if (e.key === 'Escape') closeSwiper(); else if (e.key === 'ArrowLeft') swGo(-1); else if (e.key === 'ArrowRight') swGo(1); }
  function closeSwiper() {
    const el = document.getElementById('swiper'); if (el) { el.hidden = true; el.innerHTML = ''; }
    document.body.style.overflow = ''; document.removeEventListener('keydown', onSwiperKey);
    if (route === 'home') renderHome($('#app'));
  }

  /* ============================================================= SHEET */
  const sheet = $('#sheet');
  let sheetFilm = null;

  function openSheet(f) {
    sheetFilm = f;
    const u = currentUser();
    const me = verdictOf(f.id, u.id);
    const other = Object.values(users).find((x) => x.id !== u.id);
    const otherE = verdictOf(f.id, other.id);
    const otherHas = typeof otherE.rating === 'number' || otherE.review || otherE.liked;

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
      (f.trailer ? `<button class="btn btn--ghost sheet__trailer" id="sheet-trailer">${icon('play_circle')} Ver trailer</button>` : '') +
      `<p class="sheet__synopsis">${f.synopsis || ''}</p>` +

      `<div class="rate-box">` +
      `<div class="rate-box__head">${avatarHTML(u)}<span class="rate-box__you">Tu puntaje, ${u.name}</span></div>` +
      `<div class="rate-box__row"><div class="rate-box__stars" id="rate-stars"></div>` +
      `<button class="rate-clear" id="rate-clear" ${typeof me.rating === 'number' ? '' : 'hidden'}>borrar</button></div>` +
      `<div class="review-field"><label for="review">Tu reseña</label>` +
      `<textarea id="review" placeholder="¿Qué te pareció?">${me.review ? escapeHtml(me.review) : ''}</textarea>` +
      `<div class="review-actions"><button class="btn btn--accent" id="save-review">${icon('save')} Guardar reseña</button>` +
      `<button class="btn btn--soft like ${me.liked ? 'is-liked' : ''}" id="sheet-like">${icon('favorite')} ${me.liked ? 'Te gusta' : 'Me gusta'}</button>` +
      `<span class="saved-flag" id="saved-flag">guardado ✓</span></div></div>` +
      `</div>` +

      (otherHas
        ? `<div class="other-verdict"><div class="other-verdict__head">Lo que dijo ${other.name}</div>` +
          `<div class="verdict">${avatarHTML(other, 'avatar verdict__avatar')}` +
          `<div class="verdict__main"><div class="verdict__row">` +
          (typeof otherE.rating === 'number' ? `${starsMarkup(otherE.rating, 'sm')}<span class="stars-value">${otherE.rating.toFixed(1)}</span>` : '<span class="verdict__none">sin puntaje</span>') +
          (otherE.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '') +
          `</div>${otherE.review ? `<p class="verdict__review">“${escapeHtml(otherE.review)}”</p>` : ''}</div></div></div>`
        : '') +

      `</div></div>`;

    // interactive stars
    mountInteractiveStars($('#rate-stars', sheet), f, u, me.rating);
    $('#rate-clear', sheet).addEventListener('click', () => {
      store.setRating(f.id, u.id, null);
      openSheet(f); // re-render
    });
    $('#save-review', sheet).addEventListener('click', () => {
      store.setReview(f.id, u.id, $('#review', sheet).value.trim());
      const flag = $('#saved-flag', sheet); flag.classList.add('show');
      setTimeout(() => flag.classList.remove('show'), 1600);
    });
    $('#review', sheet).addEventListener('blur', (e) => store.setReview(f.id, u.id, e.target.value.trim()));
    $('#sheet-like', sheet).addEventListener('click', (e) => toggleLike(f, e.currentTarget, true));
    const st = $('#sheet-trailer', sheet); if (st) st.addEventListener('click', () => openTrailer(f));

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
      setVisual(value);
      widget.setAttribute('aria-valuenow', value);
      store.setRating(f.id, u.id, value || null);
      const clear = $('#rate-clear', sheet); if (clear) clear.hidden = !value;
    }
  }

  /* ---------- like ---------- */
  function toggleLike(f, btn, relabel) {
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

  function openTierPicker(tierId, u) {
    const label = (TIERS.find((t) => t.id === tierId) || {}).label || '';
    openPickSheet(`Poné en ${label}`, () =>
      tierEligible(u)
        .filter((f) => (store.getTier(f.id, u.id) || null) !== tierId)
        .map((f) => ({
          thumb: posterArt(f), label: f.title, sub: store.getTier(f.id, u.id) ? '(mover)' : '',
          onClick: (render) => { store.setTier(f.id, u.id, tierId); fillTier(u); render(); },
        })));
  }
  function openChipMenu(filmId, u) {
    const f = byId(filmId); if (!f) return;
    openPickSheet(f.title, () => {
      const cur = store.getTier(filmId, u.id);
      return [
        ...TIERS.map((t) => ({ icon: 'label', color: t.color, label: t.label, check: cur === t.id, onClick: () => { store.setTier(filmId, u.id, t.id); fillTier(u); closePickSheet(); } })),
        { icon: 'remove_circle', label: 'Sacar (Sin ubicar)', onClick: () => { store.setTier(filmId, u.id, null); fillTier(u); closePickSheet(); } },
        { icon: 'info', label: 'Ver ficha', onClick: () => { closePickSheet(); openSheet(f); } },
      ];
    });
  }

  /* ============================================================= CONFIRM (change user) */
  function openConfirm() {
    const u = currentUser();
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-cancel></div>` +
      `<div class="confirm__card"><div class="confirm__title">¿Cambiar de usuario?</div>` +
      `<p class="confirm__text">Estás como <b style="color:${u.color}">${u.name}</b>. Podés volver a elegir quién sos.</p>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button>` +
      `<button class="btn btn--accent" data-switch>${icon('switch_account')} Cambiar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('[data-switch]').addEventListener('click', () => {
      el.hidden = true;
      stopHero();
      store.clearUser();
      showGate();
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
    await store.init(); mergeExtras(); // load shared state from Supabase (falls back to local cache)
    const uid = store.getUser();
    if (uid && users[uid]) { applyAccent(); startApp(); } else { showGate(); }
    // Re-sync with the other user when the tab regains focus.
    let refreshing = false;
    window.addEventListener('focus', async () => {
      if (refreshing || !store.getUser()) return;
      refreshing = true;
      await store.refresh(); mergeExtras();
      refreshing = false;
      if ($('#sheet').hidden && document.getElementById('swiper')?.hidden !== false) renderRoute();
    });
  })();
})();
