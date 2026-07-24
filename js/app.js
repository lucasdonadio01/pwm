/* WatchMovies — app controller (vanilla, no build step) */
(function () {
  'use strict';
  const trending = WM.trending;
  const store = WM.store;
  const K = window.APPKIT;
  const APP_ID = 'pwm';

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
  function profileLink(uid, label, cls = '') {
    const u = users[uid];
    if (!u) return escapeHtml(label || '');
    return `<button type="button" class="profile-link${cls ? ` ${cls}` : ''}" data-profile-user="${escapeHtml(uid)}">${escapeHtml(label || u.name)}</button>`;
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
    // Real users up top, neon-lit in their own colour; secondary options below.
    const usersRow = document.createElement('div');
    usersRow.className = 'gate__users';
    Object.values(users).forEach((u) => {
      const btn = document.createElement('button');
      btn.className = 'profile';
      btn.style.setProperty('--c', u.color);
      btn.innerHTML =
        avatarHTML(u, 'profile__avatar') +
        `<span class="profile__name">${u.name}</span>` +
        `<span class="profile__handle">@${u.handle}</span>`;
      btn.addEventListener('click', () => askPin(u, () => enterAs(u.id)));
      usersRow.appendChild(btn);
    });
    wrap.appendChild(usersRow);

    const altRow = document.createElement('div');
    altRow.className = 'gate__alt';
    const guest = document.createElement('button');
    guest.className = 'profile profile--alt';
    guest.style.setProperty('--c', '#8A8A92');
    guest.innerHTML = `<span class="profile__avatar profile__avatar--ic" style="--c:#8A8A92">${icon('visibility')}</span>` +
      `<span class="profile__name">Invitado</span><span class="profile__handle">solo mirar</span>`;
    guest.addEventListener('click', () => enterAs('guest'));
    altRow.appendChild(guest);

    const create = document.createElement('button');
    create.className = 'profile profile--alt profile--new';
    create.style.setProperty('--c', 'var(--lime)');
    create.innerHTML = `<span class="profile__avatar profile__avatar--ic" style="--c:var(--lime)">${icon('person_add')}</span>` +
      `<span class="profile__name">Crear usuario</span><span class="profile__handle">nuevo perfil</span>`;
    create.addEventListener('click', () => openSignup());
    altRow.appendChild(create);
    wrap.appendChild(altRow);

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
        `<div class="su-photo__txt"><b>Foto o GIF de perfil</b><small>Fotos hasta 10MB para recortar · GIF animado hasta 1MB, sin perder el movimiento.</small>` +
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
          const acc = await K.accounts.create(store, { name, color, lb, photo, pin, notifyTargets: Object.keys(users) });
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
  let profileUserId = null;
  let profileNavigationWired = false;

  // Hash routing: reflect the current section in location.hash so F5/reload keeps you where you
  // were and the browser's Back/Forward move between sections. (See correcciones.md #22.)
  const ROUTES = ['home', 'watchlist', 'tier', 'movies', 'series', 'calendario', 'perfil', 'config'];
  let hashRoutingWired = false;
  function routeFromHash() {
    const r = (location.hash || '').replace(/^#/, '');
    return ROUTES.includes(r) ? r : null;
  }
  function syncHash(r) {
    if (routeFromHash() === r) return; // already reflected (incl. our own change) — no extra history entry
    location.hash = r; // pushes a history entry so Back/Forward step through sections
  }
  function wireHashRouting() {
    if (hashRoutingWired) return;
    hashRoutingWired = true;
    window.addEventListener('hashchange', () => {
      if (!gate.hidden) return;        // no session yet — ignore
      const r = routeFromHash();
      if (!r || r === route) return;   // invalid, or our own programmatic change
      setRoute(r);
    });
  }

  function activityCopy(item) {
    const actor = users[item.actor] || { name: item.actorName || 'Alguien' };
    if (item.type === 'review_like') return {
      icon: 'favorite',
      title: `${actor.name} le dio me gusta a tu reseña`,
      detail: item.title || 'Una de tus reseñas',
    };
    if (item.type === 'review_publish') return {
      icon: 'rate_review',
      title: `${actor.name} ${item.action === 'updated' ? 'actualizó' : 'publicó'} una reseña`,
      detail: item.title || 'Nueva reseña',
    };
    if (item.type === 'calendar_invite') return {
      icon: 'confirmation_number',
      title: `${actor.name} te invitó a ver una función`,
      detail: [item.title, item.iso ? fmtDay(item.iso) : ''].filter(Boolean).join(' · '),
    };
    if (item.type === 'calendar_accept') return {
      icon: 'celebration',
      title: `${actor.name} confirmó que va`,
      detail: [item.title, item.iso ? fmtDay(item.iso) : ''].filter(Boolean).join(' · '),
    };
    if (item.type === 'calendar_share_invite') return {
      icon: 'calendar_add_on',
      title: `${actor.name} quiere compartir un calendario con vos`,
      detail: item.title || 'Calendario compartido',
    };
    if (item.type === 'calendar_share_accept') return {
      icon: 'group_add',
      title: `${actor.name} aceptó compartir tu calendario`,
      detail: item.title || 'Calendario compartido',
    };
    if (item.type === 'user_joined') return {
      icon: 'waving_hand',
      title: `¡${actor.name} se ha unido!`,
      detail: 'Ya podés visitar su perfil y conocer sus gustos.',
    };
    return { icon: 'notifications', title: 'Tenés una novedad', detail: item.title || '' };
  }

  function closeNotifications() {
    const el = document.getElementById('notification-center');
    if (el) el.remove();
    document.body.style.overflow = '';
  }

  function openActivityItem(item) {
    closeNotifications();
    if (item.type === 'user_joined') {
      goToProfile(item.actor);
      return;
    }
    if (item.type === 'calendar_share_invite') {
      openCalendarShareInvite(item);
      return;
    }
    if (item.type === 'calendar_share_accept') {
      calBoardId = item.calId;
      setRoute('calendario');
      return;
    }
    if (item.type === 'calendar_invite' || item.type === 'calendar_accept') {
      if (item.type === 'calendar_invite') {
        openInviteOverlay(item.eventId);
        return;
      }
      calBoardId = item.calId || 'cal-main';
      if (item.iso) {
        const d = new Date(item.iso + 'T00:00:00');
        calCursor = { y: d.getFullYear(), m: d.getMonth() };
      }
      setRoute('calendario');
      if (item.iso) setTimeout(() => {
        const C = currentCalendars().find((c) => c.id === calBoardId) || currentCalendars()[0];
        openCalDay(C, item.iso);
      }, 60);
      return;
    }
    if ((item.type === 'review_like' || item.type === 'review_publish') && item.itemId) {
      if (item.app === APP_ID) {
        const f = byId(item.itemId);
        if (f) openSheet(f, { mode: 'review', reviewUserId: item.reviewOwner || item.actor });
      } else {
        location.href = `prb/index.html?review=${encodeURIComponent(item.itemId)}&user=${encodeURIComponent(item.reviewOwner || item.actor || '')}`;
      }
    }
  }

  function openNotifications() {
    const u = currentUser();
    if (!u || u.guest) return;
    closeNotifications();
    const items = K.activity.forUser(store, u.id);
    const unread = new Set(items.filter((item) => !(item.readBy || {})[u.id]).map((item) => item.id));
    const el = document.createElement('div');
    el.id = 'notification-center';
    el.className = 'notification-center';
    el.innerHTML =
      `<button class="notification-center__scrim" data-notif-close aria-label="Cerrar notificaciones"></button>` +
      `<aside class="notification-panel" role="dialog" aria-modal="true" aria-label="Notificaciones">` +
      `<div class="notification-panel__head"><div><h3>Notificaciones</h3><p>Lo nuevo entre ustedes.</p></div><button class="icon-btn" data-notif-close aria-label="Cerrar">${icon('close')}</button></div>` +
      `<div class="notification-list">` +
      (items.length ? items.map((item, i) => {
        const copy = activityCopy(item);
        const actor = users[item.actor] || { id: item.actor, color: '#777', initial: '?' };
        return `<div class="notif-item${unread.has(item.id) ? ' is-unread' : ''}">` +
          `<button class="notif-item__main" data-notif-open="${i}">${avatarHTML(actor, 'avatar notif-item__avatar')}` +
          `<span class="notif-item__icon">${icon(copy.icon)}</span><span class="notif-item__copy"><b>${escapeHtml(copy.title)}</b>` +
          `<small>${escapeHtml(copy.detail)}</small><time>${escapeHtml(K.activity.timeAgo(item.createdAt))}</time></span></button>` +
          `<button class="icon-btn notif-item__dismiss" data-notif-dismiss="${i}" aria-label="Sacar notificación">${icon('close')}</button></div>`;
      }).join('') : `<div class="notification-empty">${icon('notifications_none')}<b>Está todo tranquilo</b><p>Cuando alguien publique, le dé like a una reseña o te invite, aparece acá.</p></div>`) +
      `</div></aside>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    el.querySelectorAll('[data-notif-close]').forEach((b) => b.addEventListener('click', closeNotifications));
    el.querySelectorAll('[data-notif-open]').forEach((b) => b.addEventListener('click', () => openActivityItem(items[+b.dataset.notifOpen])));
    el.querySelectorAll('[data-notif-dismiss]').forEach((b) => b.addEventListener('click', () => {
      K.activity.dismiss(store, u.id, items[+b.dataset.notifDismiss].id);
      openNotifications();
    }));
    if (unread.size) {
      K.activity.markRead(store, u.id, [...unread]);
      renderHeader();
    }
  }

  function renderHeader() {
    const u = currentUser();
    const header = $('#site-header');
    const pend = pendingInvites().length;
    const unread = u && !u.guest ? K.activity.unreadCount(store, u.id) : 0;
    header.innerHTML =
      `<button class="hamburger" id="hamburger" aria-label="Abrir menú">${icon('menu')}</button>` +
      `<a class="logo" href="#home" aria-label="PWM — Project Watch Movies, inicio"><b>PWM</b><span class="dot">.</span></a>` +
      `<nav class="nav" id="nav">${NAV.map((n) => `<a href="#${n.id}" data-route="${n.id}" class="${n.id === route ? 'is-active' : ''}">${n.label}</a>`).join('')}<a class="nav__x" href="prb/index.html">${icon('menu_book')} Libritos</a></nav>` +
      `<div class="header__right">` +
      `<button class="icon-btn hdr-bolt" id="hdr-bolt" title="Modo relámpago" aria-label="Modo relámpago">${icon('bolt')}</button>` +
      `<button class="icon-btn hdr-cal" id="hdr-cal" title="Calendario" aria-label="Calendario${pend ? ` · ${pend} invitación(es) nueva(s)` : ''}">${icon('calendar_month')}` +
      (pend ? `<span class="hdr-badge">+${pend}</span>` : '') + `</button>` +
      `<button class="icon-btn hdr-notif" id="hdr-notif" title="Notificaciones" aria-label="Notificaciones${unread ? ` · ${unread} nueva(s)` : ''}">${icon('notifications')}` +
      (unread ? `<span class="hdr-badge">${unread > 9 ? '9+' : unread}</span>` : '') + `</button>` +
      `<div class="user-chip">` +
      `<button type="button" class="user-chip__name profile-link"${u ? ` data-profile-user="${escapeHtml(u.id)}"` : ''} title="Ver mi perfil">${u ? escapeHtml(u.name) : ''}</button>` +
      `<button type="button" class="user-chip__avatar" id="user-chip" title="Tu cuenta" aria-label="Abrir tu cuenta" aria-haspopup="true">` +
      (u ? avatarHTML(u) : `<span class="avatar" style="--c:var(--hot)">?</span>`) +
      `</button></div></div>`;

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
    $('#hdr-notif', header).addEventListener('click', openNotifications);
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
  function setRoute(r, options = {}) {
    K.motion.run(() => {
      if (r === 'watchlist' && route !== 'watchlist') wlOwner = defaultWatchlistOwner();
      route = r;
      profileUserId = r === 'perfil' ? (options.uid || (currentUser() && currentUser().id)) : null;
      syncHash(r);
      updateNavActive();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      renderRoute();
      onScroll();
    }, { kind: 'route' });
  }

  function renderRoute() {
    stopHero();
    const app = $('#app');
    app.hidden = false;
    if (route === 'home') return renderHome(app);
    if (route === 'watchlist') return renderWatchlist(app);
    if (route === 'tier') return renderTier(app);
    if (route === 'calendario') return renderCalendario(app);
    if (route === 'perfil') return renderPerfil(app, profileUserId);
    if (route === 'config') return renderConfig(app);
    const cfg = {
      movies: { title: 'Movies', sub: 'Solo películas', list: watchlistFilms().filter((m) => m.kind === 'movie') },
      series: { title: 'Series', sub: 'Series de la watchlist + trending del momento', list: seriesList() },
    }[route];
    renderCatalog(app, cfg, route);
  }

  function goToProfile(uid) {
    if (!users[uid] || currentUser().guest) return;
    closeSheet(false);
    const confirm = $('#confirm');
    if (confirm) confirm.hidden = true;
    setRoute('perfil', { uid });
  }

  function wireProfileNavigation() {
    if (profileNavigationWired) return;
    profileNavigationWired = true;
    document.addEventListener('click', (e) => {
      const review = e.target.closest('[data-review-film][data-review-user]');
      if (review) {
        const film = byId(review.dataset.reviewFilm);
        if (!film) return;
        e.preventDefault();
        e.stopPropagation();
        openSheet(film, { mode: 'review', reviewUserId: review.dataset.reviewUser });
        return;
      }
      const target = e.target.closest('[data-profile-user]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      goToProfile(target.dataset.profileUser);
    }, true);
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
    app.appendChild(buildLatestReviews());
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
      ? `<span class="dot-sep">·</span><span style="color:${ownerUs[0].color}">En ${ownerUs.length > 1 ? 'las listas' : 'la lista'} de ${ownerUs.map((u) => profileLink(u.id, u.name)).join(' y ')}</span>`
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
  function latestReviews() {
    const out = [];
    Object.values(users).forEach((u) => movies.forEach((f) => {
      const v = verdictOf(f.id, u.id);
      if (!(v.review || '').trim()) return;
      const watchedAt = watchMetaOf(f.id, u.id).date || '';
      const updatedAt = store.get(f.id, u.id).updatedAt || '';
      const timestamp = Date.parse(watchedAt ? `${watchedAt}T23:59:59` : updatedAt) || 0;
      out.push({ f, u, v, watchedAt, timestamp });
    }));
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  /* One card per FILM (not per review): if two people reviewed it, both verdicts show
   * together in reduced form. Tapping opens the sheet in review mode, where they're readable. */
  function latestReviewFilms() {
    const byFilm = new Map();
    latestReviews().forEach((r) => {
      const cur = byFilm.get(r.f.id);
      if (!cur) byFilm.set(r.f.id, { f: r.f, top: r, timestamp: r.timestamp });
      else if (r.timestamp > cur.timestamp) { cur.top = r; cur.timestamp = r.timestamp; }
    });
    return [...byFilm.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
  // Compact "who said what" strip: avatar + score (+ a mark when there's a written review).
  function reviewPeopleHTML(f) {
    return Object.values(users).map((u) => {
      const e = verdictOf(f.id, u.id);
      const rated = typeof e.rating === 'number';
      const hasReview = !!(e.review || '').trim();
      if (!rated && !hasReview) return '';
      return `<span class="hrperson" title="${escapeHtml(u.name)}${rated ? ` · ${e.rating.toFixed(1)}` : ''}${hasReview ? ' · con reseña' : ''}">` +
        avatarHTML(u, 'avatar hrperson__av') +
        (rated ? `<b>${icon('star')}${e.rating.toFixed(1)}</b>` : `<b class="hrperson__none">—</b>`) +
        (hasReview ? `<span class="hrperson__ic">${icon('rate_review')}</span>` : '') +
        `</span>`;
    }).join('');
  }
  // Card markup shared by the real reviews and the blurred "peek" teaser below the fold.
  function reviewCardInnerHTML(f, top) {
    return `<button class="home-review__poster" data-open-review aria-label="Ver las reseñas de ${escapeHtml(f.title)}" style="background:${posterArt(f)}"></button>` +
      `<div class="home-review__body">` +
      `<div class="home-review__people">${reviewPeopleHTML(f)}</div>` +
      `<button class="home-review__copy" data-open-review><b>${escapeHtml(f.title)}</b>` +
      `<small class="home-review__when">${top.watchedAt ? fmtDay(top.watchedAt) : 'Sin fecha cargada'}</small>` +
      `<q>${escapeHtml(top.v.review)}</q></button></div>`;
  }
  function buildLatestReviews() {
    const section = document.createElement('section');
    section.className = 'section home-reviews';
    section.innerHTML =
      `<div class="section__head"><div><h3 class="section__title"><span class="accentbar">/</span> Últimas reseñas</h3>` +
      `<p class="section__sub">Lo último que estuvieron viendo y comentando · tocá una para leer las reseñas.</p></div></div>` +
      `<div class="home-reviews__grid"></div><div class="home-reviews__more"></div>`;
    const films = latestReviewFilms();
    const grid = section.querySelector('.home-reviews__grid');
    const more = section.querySelector('.home-reviews__more');
    let visible = 4;
    const draw = () => {
      grid.innerHTML = '';
      more.innerHTML = '';
      if (!films.length) {
        grid.innerHTML = `<div class="empty home-reviews__empty">${icon('rate_review')}<p>Todavía no hay reseñas para mostrar.</p></div>`;
        return;
      }
      films.slice(0, visible).forEach(({ f, top }) => {
        const card = document.createElement('article');
        card.className = 'home-review';
        card.innerHTML = reviewCardInnerHTML(f, top);
        card.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', () => openSheet(f, { mode: 'review', reviewUserId: top.u.id })));
        grid.appendChild(K.motion.tag(card, `pwm-home-review-${f.id}`));
      });
      const remaining = films.length - visible;
      if (remaining <= 0) return;
      // Teaser: the next reviews rendered blurred + faded behind the "Ver más" button.
      // Fade into a dark tone matching the viewer's profile background (just dark if they use a gif/image).
      const acc = store.getAccounts()[currentUser().id] || {};
      const validBgColor = /^#[0-9a-f]{6}$/i.test(acc.profileBgColor || '');
      const peekTint = (acc.profileBg || !validBgColor) ? '#0d0303' : acc.profileBgColor;
      const peekCards = films.slice(visible, visible + 2)
        .map(({ f, top }) => `<article class="home-review">${reviewCardInnerHTML(f, top)}</article>`).join('');
      more.innerHTML =
        `<div class="home-reviews__peek" style="--peek-tint:${peekTint}">` +
          `<div class="home-reviews__peek-grid" aria-hidden="true" inert>${peekCards}</div>` +
          `<button class="btn btn--soft home-reviews__morebtn" data-more-reviews>${icon('expand_more')} Ver ${remaining} reseña${remaining === 1 ? '' : 's'} más</button>` +
        `</div>`;
      more.querySelector('[data-more-reviews]').addEventListener('click', () => K.motion.run(() => {
        visible = films.length;
        draw();
      }, { kind: 'shared', target: section }));
    };
    draw();
    return section;
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
      list.forEach((f) => grid.appendChild(K.motion.tag(posterCard(f), `pwm-catalog-${key}-${f.id}`)));
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
        fresh.forEach((f) => grid.appendChild(K.motion.tag(posterCard(f), `pwm-catalog-${key}-${f.id}`)));
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
      if (b.dataset.g === catState[key]) return;
      const update = () => {
        catState[key] = b.dataset.g;
        s.querySelectorAll('.genre').forEach((x) => x.classList.toggle('is-on', x === b));
        fill();
      };
      if (discovering()) update();
      else K.motion.run(update, { kind: 'shared', target: grid });
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
  function defaultWatchlistOwner() {
    const user = currentUser();
    return user && !user.guest ? user.id : 'all';
  }
  /** Every account stays selectable, even when its watchlist is empty. */
  function watchlistOwners() {
    return Object.values(users);
  }
  function ownerFilterHTML() {
    const owners = watchlistOwners();
    if (!owners.length) return '';
    if (wlOwner !== 'all' && !owners.some((u) => u.id === wlOwner)) wlOwner = defaultWatchlistOwner();
    return `<div class="genrebar ownerbar" id="wl-owner">` +
      `<button class="genre${wlOwner === 'all' ? ' is-on' : ''}" data-own="all">Todos</button>` +
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
    s.querySelector('#view-toggle').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]'); if (!b || b.dataset.view === watchlistView) return;
      K.motion.run(() => {
        watchlistView = b.dataset.view;
        s.querySelectorAll('.vtbtn').forEach((x) => x.classList.toggle('is-on', x.dataset.view === watchlistView));
        fillPlist();
      }, { kind: 'shared', target: s.querySelector('#plist') });
    });
    const ob = s.querySelector('#wl-owner');
    if (ob) ob.addEventListener('click', (e) => {
      const b = e.target.closest('[data-own]'); if (!b || b.dataset.own === wlOwner) return;
      K.motion.run(() => {
        wlOwner = b.dataset.own;
        ob.querySelectorAll('.genre').forEach((x) => x.classList.toggle('is-on', x.dataset.own === wlOwner));
        fillPlist();
      }, { kind: 'shared', target: s.querySelector('#plist') });
    });
    enableReorder(s.querySelector('#plist'));
    fillPlist();
  }

  const wlFiltered = () => wlQuery.trim() !== '' || wlOwner !== 'all';
  function fillPlist() {
    const plist = document.getElementById('plist'); if (!plist) return;
    plist.innerHTML = '';
    const hint = document.getElementById('pl-hint');
    const full = orderedWatchlist();
    const q = wlQuery.trim().toLowerCase();
    let list = q ? full.filter((f) => f.title.toLowerCase().includes(q)) : full;
    if (wlOwner !== 'all') list = list.filter((f) => ownersOf(f).includes(wlOwner));
    const filtered = wlFiltered();
    // When filtered (by owner or search) reordering is off, so number the visible subset 1..n
    // instead of leaking each film's global shared-priority position (e.g. Luke's list starting at 9).
    const rankOf = new Map((filtered ? list : full).map((f, i) => [f.id, i + 1]));
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
    list.forEach((f) => plist.appendChild(plRow(f, rankOf.get(f.id), filtered ? list.length : full.length, filtered)));
  }
  function plGridCell(f, rank) {
    const cell = document.createElement('button'); cell.className = 'plcell'; cell.dataset.id = f.id; cell.title = `${rank}. ${f.title}`;
    K.motion.tag(cell, `pwm-watchlist-${f.id}`);
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

  function plRow(f, rank, total, locked = false) {
    const row = document.createElement('div');
    row.className = 'plitem';
    row.draggable = !locked;
    row.dataset.id = f.id;
    K.motion.tag(row, `pwm-watchlist-${f.id}`);
    row.innerHTML =
      `<input class="plitem__rankin" type="number" min="1" max="${total}" value="${rank}"${locked ? ' readonly tabindex="-1"' : ''} title="${locked ? 'Sacá el filtro para reordenar' : 'Escribí la posición'}" aria-label="Posición de prioridad">` +
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
      ? (B.editable ? `El ranking de ${profileLink(me.id, `vos (${me.name})`)}` : `Mirando el tier de ${profileLink(B.owner, ownerName(B.owner))} · solo lectura`)
      : (B.kind === 'shared' ? `Tier <b>compartida</b> — la editan ${B.members.map((uid) => profileLink(uid, ownerName(uid))).join(' y ')}${B.editable ? '' : ' · vos solo mirás'}` : `Tier <b>personal</b> de ${profileLink(B.owner, ownerName(B.owner))}${B.editable ? '' : ' · solo lectura'}`);
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
  const personalCalendarId = (uid) => `cal-personal:${uid}`;
  function personalCalendar(uid, viewerId = uid) {
    return {
      id: personalCalendarId(uid), type: 'personal', name: uid === viewerId ? 'Mi calendario' : `Calendario de ${ownerName(uid)}`,
      owner: uid, members: [uid], pendingMembers: [], editable: !currentUser().guest && uid === viewerId, viewUser: uid,
    };
  }
  function normalizedCalendar(c, viewerId = currentUser().id) {
    const members = Array.isArray(c.members) && c.members.length ? [...new Set(c.members)] : [c.owner];
    if (!members.includes(c.owner)) members.unshift(c.owner);
    return {
      ...c, type: 'custom', members,
      pendingMembers: Array.isArray(c.pendingMembers) ? c.pendingMembers.filter((uid) => !members.includes(uid)) : [],
      editable: !currentUser().guest && members.includes(viewerId),
      manageable: !currentUser().guest && c.owner === viewerId,
    };
  }
  function legacyCalendarFor(uid) {
    const all = store.getCalEvents('cal-main');
    const involved = Object.values(all).flat().some((ev) =>
      ev.by === uid || eventInvitees({ id: 'cal-main', members: Object.keys(users) }, ev).includes(uid) || !!(ev.accepted || {})[uid]);
    if (!involved) return null;
    return {
      id: 'cal-main', type: 'legacy', name: 'Calendario anterior', owner: uid, members: [uid],
      pendingMembers: [], editable: !currentUser().guest, manageable: false, viewUser: uid,
    };
  }
  function currentCalendars() {
    const me = currentUser();
    const list = [personalCalendar(me.id, me.id)];
    store.getCalendars().forEach((raw) => {
      const c = normalizedCalendar(raw, me.id);
      if (c.owner === me.id || c.members.includes(me.id)) list.push(c);
    });
    const legacy = legacyCalendarFor(me.id);
    if (legacy) list.push(legacy);
    return list;
  }
  function allEventCalendars() {
    const out = Object.keys(users).filter((uid) => uid !== 'guest').map((uid) => personalCalendar(uid, currentUser().id));
    store.getCalendars().forEach((raw) => out.push(normalizedCalendar(raw, currentUser().id)));
    if (Object.keys(store.getCalEvents('cal-main')).length) {
      out.push({ id: 'cal-main', type: 'legacy', name: 'Calendario anterior', owner: null, members: Object.keys(users), pendingMembers: [], editable: false });
    }
    return out;
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
  function eventInvitees(C, ev) {
    if (Array.isArray(ev.invitees)) return ev.invitees.filter((uid) => uid !== ev.by && users[uid]);
    if (C.id === 'cal-main') {
      const knownLegacyMembers = new Set(['bian', 'luke', ...Object.keys(ev.accepted || {}), ...Object.keys(ev.dismissed || {})]);
      return [...knownLegacyMembers].filter((uid) => uid !== ev.by && users[uid]);
    }
    return C.members.filter((uid) => uid !== ev.by && users[uid]); // legacy events invited every member
  }

  function calendarEventsFor(C) {
    const base = store.getCalEvents(C.id);
    if (C.type !== 'personal' && C.type !== 'legacy') return base;
    const uid = C.viewUser || currentUser().id;
    const visible = {};
    Object.entries(base).forEach(([iso, events]) => {
      const rows = events.filter((ev) => ev.by === uid || !!(ev.accepted || {})[uid]);
      if (rows.length) visible[iso] = rows;
    });
    if (C.type === 'personal') {
      allEventCalendars().forEach((source) => {
        if (source.id === C.id) return;
        Object.entries(store.getCalEvents(source.id)).forEach(([iso, events]) => {
          events.forEach((ev) => {
            if (!(ev.accepted || {})[uid]) return;
            const exists = (visible[iso] || []).some((row) => row.id === ev.id && (row.__calId || C.id) === source.id);
            if (!exists) (visible[iso] = visible[iso] || []).push({ ...ev, __calId: source.id });
          });
        });
      });
    }
    return visible;
  }

  function sendCalendarInviteActivities(C, iso, ev, invitees) {
    const actor = users[ev.by] || currentUser();
    const f = byId(ev.filmId) || { title: 'una función' };
    K.activity.pushMany(store, invitees.map((uid) => ({
      id: `calendar-invite:${C.id}:${ev.id}:${uid}`,
      type: 'calendar_invite', app: APP_ID, actor: actor.id, target: uid,
      calId: C.id, eventId: ev.id, iso, itemId: ev.filmId, title: f.title,
      createdAt: new Date().toISOString(),
    })));
  }

  function sendCalendarAcceptActivity(C, iso, ev, uid) {
    const f = byId(ev.filmId) || { title: 'una función' };
    K.activity.push(store, {
      id: `calendar-accept:${C.id}:${ev.id}:${uid}`,
      type: 'calendar_accept', app: APP_ID, actor: uid, target: ev.by,
      calId: C.id, eventId: ev.id, iso, itemId: ev.filmId, title: f.title,
      createdAt: new Date().toISOString(),
    });
  }

  function sendCalendarShareActivities(C, invitees) {
    const actor = users[C.owner] || currentUser();
    K.activity.pushMany(store, invitees.map((uid) => ({
      id: `calendar-share:${C.id}:${uid}`,
      type: 'calendar_share_invite', app: APP_ID, actor: actor.id, target: uid,
      calId: C.id, title: C.name, createdAt: new Date().toISOString(),
    })));
  }

  function openCalendarShareInvite(item) {
    const me = currentUser();
    const raw = store.getCalendars().find((c) => c.id === item.calId);
    if (!raw || !(raw.pendingMembers || []).includes(me.id)) {
      K.activity.markRead(store, me.id, [item.id]);
      K.toast('Esta invitación ya no está disponible.', 'bad');
      return;
    }
    const owner = users[raw.owner] || { name: item.actorName || 'Alguien', color: 'var(--accent)' };
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-cancel></div><div class="confirm__card calendar-share-invite" style="--c:${owner.color}">` +
      `<span class="calendar-share-invite__icon">${icon('calendar_add_on')}</span>` +
      `<div class="confirm__title">${escapeHtml(owner.name)} quiere compartir un calendario con vos</div>` +
      `<p class="confirm__text">Si aceptás, <b>${escapeHtml(raw.name)}</b> va a aparecer junto a tu calendario personal y van a poder editarlo entre los dos.</p>` +
      `<div class="confirm__actions"><button class="btn btn--soft" id="cal-share-no">${icon('close')} Ahora no</button>` +
      `<button class="btn btn--accent" id="cal-share-yes">${icon('group_add')} Aceptar calendario</button></div></div>`;
    el.hidden = false;
    el.querySelector('[data-cancel]').addEventListener('click', () => (el.hidden = true));
    el.querySelector('#cal-share-no').addEventListener('click', () => {
      const next = store.getCalendars().map((c) => c.id === raw.id
        ? { ...c, pendingMembers: (c.pendingMembers || []).filter((uid) => uid !== me.id) }
        : c);
      store.saveCalendars(next);
      K.activity.dismiss(store, me.id, item.id);
      el.hidden = true;
      K.toast('No se compartió el calendario.');
    });
    el.querySelector('#cal-share-yes').addEventListener('click', () => {
      const acceptedAt = new Date().toISOString();
      const next = store.getCalendars().map((c) => {
        if (c.id !== raw.id) return c;
        return {
          ...c,
          members: [...new Set([...(c.members || [c.owner]), me.id])],
          pendingMembers: (c.pendingMembers || []).filter((uid) => uid !== me.id),
        };
      });
      store.saveCalendars(next);
      K.activity.markRead(store, me.id, [item.id]);
      K.activity.dismiss(store, me.id, item.id);
      K.activity.push(store, {
        id: `calendar-share-accept:${raw.id}:${me.id}`,
        type: 'calendar_share_accept', app: APP_ID, actor: me.id, target: raw.owner,
        calId: raw.id, title: raw.name, createdAt: acceptedAt,
      });
      calBoardId = raw.id;
      el.hidden = true;
      setRoute('calendario');
      showCalendarToast('Calendario compartido', `Ya podés usar “${raw.name}”.`, 'success');
    });
  }

  /* ---------- invitations ----------
   * Every event records who created it (`by`). For everyone else on that calendar it is an
   * invitation until they accept or dismiss it — that's the +N on the header calendar icon. */
  function eachEvent(fn) {
    const cals = allEventCalendars();
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
      if (!eventInvitees(C, ev).includes(u.id)) return;
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
    const acceptedMembers = C.members.filter((uid) => uid !== C.owner);
    const pendingCount = (C.pendingMembers || []).length;
    const memberSummary = C.type === 'personal'
      ? 'Solo vos · las funciones que aceptes también aparecen acá'
      : [acceptedMembers.length ? `${acceptedMembers.length + 1} personas` : 'Solo vos por ahora', pendingCount ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    s.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">Calendario</h3><p class="section__sub">${memberSummary} · poné pelis en fechas y mirá lo que ${C.type === 'personal' ? 'viste' : 'vieron'}</p></div></div>` +
      `<div class="tier-switch" id="cal-switch">` +
      mine.map((c) => `<button class="tswitch${c.id === C.id ? ' is-on' : ''}" data-cal="${c.id}">${icon('calendar_month')}${escapeHtml(c.name)}</button>`).join('') +
      `<button class="tswitch tswitch--add" id="cal-new">${icon('add')} Nuevo</button>` +
      `</div>` +
      (C.type === 'personal' ? `<div class="tier-toolbar"><button class="btn btn--soft btn--xs" id="cal-share">${icon('group_add')} Compartir calendario</button></div>`
        : (C.manageable ? `<div class="tier-toolbar"><button class="btn btn--soft btn--xs" id="cal-edit">${icon('edit')} Editar y compartir</button><button class="btn btn--soft btn--xs" id="cal-del">${icon('delete')} Borrar</button></div>` : '')) +
      `<div class="calbar"><div class="calbar__nav"><button class="icon-btn" id="cal-prev" aria-label="Mes anterior">${icon('chevron_left')}</button>` +
      `<div class="calbar__title">${MONTHS[calCursor.m]} ${calCursor.y}</div>` +
      `<button class="icon-btn" id="cal-next" aria-label="Mes siguiente">${icon('chevron_right')}</button></div>` +
      `<button class="btn btn--soft btn--xs cal-today" id="cal-today">Hoy</button></div>` +
      `<div class="calgrid" id="calgrid"></div>` +
      `<div class="cal-legend">${icon('theaters')} función planeada · ${icon('event_available')} ya la vieron (según la fecha de la reseña)</div>`;
    app.appendChild(s); app.appendChild(buildFooter());
    s.querySelector('#cal-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-cal]'); if (!b) return; calBoardId = b.dataset.cal; renderCalendario(app); });
    s.querySelector('#cal-new').addEventListener('click', () => { if (!guestBlock()) openCalendarModal(app, null); });
    const cs = s.querySelector('#cal-share'); if (cs) cs.addEventListener('click', () => openCalendarModal(app, null, { name: `Calendario de ${currentUser().name}` }));
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
  function openInviteOverlay(preferredEventId) {
    const list = pendingInvites();
    if (!list.length) return;
    let i = Math.max(0, list.findIndex((n) => n.ev.id === preferredEventId));
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
        sendCalendarAcceptActivity(n.C, n.iso, n.ev, u.id);
        K.activity.markRead(store, u.id, [`calendar-invite:${n.C.id}:${n.ev.id}:${u.id}`]);
        showCalendarToast('¡Anotado!', `Le avisamos a ${users[n.ev.by] ? users[n.ev.by].name : 'quien te invitó'}.`, 'success');
        i++; draw();
      });
      el.querySelector('[data-inv-no]').addEventListener('click', () => {
        const u = currentUser();
        patchEvent(n.C.id, n.iso, n.ev.id, (e) => { e.dismissed = e.dismissed || {}; e.dismissed[u.id] = true; });
        K.activity.markRead(store, u.id, [`calendar-invite:${n.C.id}:${n.ev.id}:${u.id}`]);
        i++; draw();
      });
    };
    draw();
    el.hidden = false;
  }

  function renderCalGrid(C) {
    const grid = document.getElementById('calgrid'); if (!grid) return;
    const titleEl = document.querySelector('.calbar__title'); if (titleEl) titleEl.textContent = `${MONTHS[calCursor.m]} ${calCursor.y}`;
    const events = calendarEventsFor(C);
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
  function eventAttendanceHTML(C, ev) {
    const me = currentUser();
    const invitees = eventInvitees(C, ev);
    const accepted = ev.accepted || {};
    const dismissed = ev.dismissed || {};
    if (ev.by === me.id) {
      if (!invitees.length) return `<div class="calev__attendance is-solo">${icon('person')} La agendaste sin invitados.</div>`;
      return `<div class="calev__attendance-list">${invitees.map((uid) => {
        const who = users[uid] || { name: uid };
        if (accepted[uid]) return `<div class="calev__attendance is-going">${icon('how_to_reg')} <b>${escapeHtml(who.name)}</b> asistirá a la función!</div>`;
        if (dismissed[uid]) return `<div class="calev__attendance is-declined">${icon('person_off')} <b>${escapeHtml(who.name)}</b> esta vez no puede.</div>`;
        return `<div class="calev__attendance is-pending">${icon('schedule')} <b>${escapeHtml(who.name)}</b> todavía no confirmó.</div>`;
      }).join('')}</div>`;
    }
    if (invitees.includes(me.id)) {
      const from = users[ev.by] || { name: 'Alguien' };
      if (accepted[me.id]) return `<div class="calev__attendance is-going">${icon('check_circle')} Confirmaste que vas a la función.</div>`;
      if (dismissed[me.id]) return `<div class="calev__attendance is-declined">${icon('event_busy')} Dijiste que esta vez no.</div>`;
      return `<div class="calev__attendance is-pending">${icon('mark_email_unread')} Invitación de <b>${escapeHtml(from.name)}</b> pendiente… ` +
        `<button class="linklike" data-answer-invite="${escapeHtml(ev.id)}">Responder</button></div>`;
    }
    const going = invitees.filter((uid) => accepted[uid]);
    return going.length ? `<div class="calev__attendance is-going">${icon('groups')} ${going.map((uid) => escapeHtml((users[uid] || {}).name || uid)).join(', ')} ${going.length === 1 ? 'asistirá' : 'asistirán'}.</div>` : '';
  }
  function openCalDay(C, iso) {
    const evsNow = calendarEventsFor(C)[iso] || [];
    const watNow = watchedByDate(C.members)[iso] || [];
    if (!evsNow.length && !watNow.length && C.editable) {
      openCalEventModal(C, iso, null, () => renderCalGrid(C), () => {});
      return;
    }
    let el = document.getElementById('calday'); if (!el) { el = document.createElement('div'); el.id = 'calday'; el.className = 'picksheet'; document.body.appendChild(el); }
    const render = () => {
      const evs = calendarEventsFor(C)[iso] || [];
      const wat = watchedByDate(C.members)[iso] || [];
      const dateLabel = new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      el.innerHTML =
        `<div class="picksheet__scrim" data-cdclose></div><div class="picksheet__panel">` +
        `<div class="picksheet__head"><h3>${dateLabel}</h3><button class="icon-btn" data-cdclose>${icon('close')}</button></div>` +
        `<div class="picksheet__list">` +
        (evs.length ? `<div class="calday__sec">${icon('theaters')} Funciones planeadas</div>` + evs.map((e) => {
          const f = byId(e.filmId) || { id: e.filmId, title: '?' };
          const m = modeOf(e.mode);
          const canEdit = C.type === 'personal' || C.type === 'legacy' ? e.by === currentUser().id : C.editable;
          return `<div class="calev"><span class="calev__poster" style="background:${filmThumb(f)}"></span>` +
            `<div class="calev__body"><div class="calev__title">${escapeHtml(f.title)}</div>` +
            `<div class="calev__meta">${[e.time ? icon('schedule') + ' ' + escapeHtml(e.time) : '', m ? icon(m.icon) + ' ' + m.label : '', e.place ? icon('place') + ' ' + escapeHtml(e.place) : ''].filter(Boolean).join(' · ') || 'sin horario ni lugar'}</div>` +
            eventAttendanceHTML(C, e) +
            `</div>${canEdit ? `<button class="icon-btn calev__edit" data-edit="${e.id}" data-edit-cal="${escapeHtml(e.__calId || C.id)}" aria-label="Editar">${icon('edit')}</button>` : ''}</div>`;
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
        const sourceId = b.dataset.editCal || C.id;
        const ev = (calEventsMap(sourceId)[iso] || []).find((x) => x.id === b.dataset.edit);
        if (!ev) return;
        const sourceCalendar = allEventCalendars().find((calendar) => calendar.id === sourceId) || C;
        closeCalDay();
        openCalEventModal(sourceCalendar, iso, ev, reopen, reopen);
      }));
      el.querySelectorAll('[data-answer-invite]').forEach((b) => b.addEventListener('click', () => {
        const eventId = b.dataset.answerInvite;
        closeCalDay();
        openInviteOverlay(eventId);
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
    const eventCreatorId = (ev && ev.by) || currentUser().id;
    const inviteCandidates = Object.values(users).filter((u) => u && !u.guest && u.id !== eventCreatorId);
    const invitees = new Set(editing ? eventInvitees(C, ev) : []);

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
        `<div class="tl-members cev-invitees"><div class="tl-members__lbl">¿A quién invitás? <span id="cev-invite-count">${invitees.size ? `${invitees.size} ${invitees.size === 1 ? 'persona elegida' : 'personas elegidas'}` : 'nadie por ahora'}</span></div>` +
        (inviteCandidates.length ? inviteCandidates.map((person) => `<button type="button" class="tl-member${invitees.has(person.id) ? ' is-on' : ''}" data-invite-user="${escapeHtml(person.id)}">${avatarHTML(person, 'avatar tl-member__av')} ${escapeHtml(person.name)}</button>`).join('') :
          `<p class="addfilm__hint">No hay otros usuarios disponibles.</p>`) + `</div>` +
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
      el.querySelectorAll('[data-invite-user]').forEach((b) => b.addEventListener('click', () => {
        const uid = b.dataset.inviteUser;
        if (invitees.has(uid)) invitees.delete(uid); else invitees.add(uid);
        b.classList.toggle('is-on', invitees.has(uid));
        const count = el.querySelector('#cev-invite-count');
        if (count) count.textContent = invitees.size ? `${invitees.size} ${invitees.size === 1 ? 'persona elegida' : 'personas elegidas'}` : 'nadie por ahora';
      }));
      el.querySelector('#cev-ok').addEventListener('click', () => {
        if (!filmId) { K.toast('Elegí una película primero.', 'bad'); picking = true; draw(); return; }
        if (askDay) { const di = el.querySelector('#cev-day'); day = (di && di.value) || day; }
        const time = el.querySelector('#cev-time').value || null;
        const place = el.querySelector('#cev-place').value.trim() || null;
        const me = currentUser();
        const map = store.getCalEvents(C.id); map[day] = map[day] || [];
        let savedEvent = null;
        let newInvitees = [];
        if (editing) {
          const e2 = map[day].find((x) => x.id === ev.id);
          if (e2) {
            const previous = eventInvitees(C, e2);
            e2.filmId = filmId; e2.time = time; e2.place = place; e2.mode = mode; e2.invitees = [...invitees];
            newInvitees = [...invitees].filter((uid) => !previous.includes(uid));
            const removedInvitees = previous.filter((uid) => !invitees.has(uid));
            K.activity.removeMany(store, removedInvitees.map((uid) => `calendar-invite:${C.id}:${e2.id}:${uid}`));
            ['accepted', 'dismissed', 'acceptSeen'].forEach((field) => {
              const status = e2[field] || {};
              Object.keys(status).forEach((uid) => { if (!invitees.has(uid)) delete status[uid]; });
              e2[field] = status;
            });
            savedEvent = e2;
          }
        } else {
          savedEvent = {
            id: 'ce-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            filmId, time, place, mode, by: me.id, createdAt: new Date().toISOString(),
            invitees: [...invitees], accepted: {}, dismissed: {}, acceptSeen: {},
          };
          map[day].push(savedEvent);
          newInvitees = [...invitees];
        }
        store.saveCalEvents(C.id, map);
        if (savedEvent && newInvitees.length) sendCalendarInviteActivities(C, day, savedEvent, newInvitees);
        el.hidden = true;
        const invited = invitees.size;
        if (!editing && invited) showCalendarToast('Invitación enviada', `${invited} ${invited === 1 ? 'persona recibió' : 'personas recibieron'} la función.`, 'success');
        else if (!editing) showCalendarToast('Función agendada', 'Quedó en tu calendario, sin invitados.', 'success');
        if (onDone) onDone(day);
      });
      const del = el.querySelector('#cev-del');
      if (del) del.addEventListener('click', () => {
        const map = store.getCalEvents(C.id);
        map[iso] = (map[iso] || []).filter((x) => x.id !== ev.id);
        if (!map[iso].length) delete map[iso];
        K.activity.removeMany(store, [
          ...eventInvitees(C, ev).map((uid) => `calendar-invite:${C.id}:${ev.id}:${uid}`),
          ...Object.keys(ev.accepted || {}).map((uid) => `calendar-accept:${C.id}:${ev.id}:${uid}`),
        ]);
        store.saveCalEvents(C.id, map); el.hidden = true; if (onDone) onDone(iso);
      });
    };
    draw();
    el.hidden = false;
  }
  function openCalendarModal(app, C, options = {}) {
    const editing = !!C; const me = currentUser();
    const others = Object.values(users).filter((x) => x.id !== me.id && x.id !== 'guest' && !x.guest);
    const accepted = new Set(editing && Array.isArray(C.members) ? C.members.filter((id) => id !== me.id) : []);
    const selected = new Set([...accepted, ...(editing && Array.isArray(C.pendingMembers) ? C.pendingMembers : [])]);
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
      `<div class="confirm__title">${editing ? 'Editar calendario' : 'Nuevo calendario'}</div>` +
      `<label class="tl-field"><span>Nombre</span><input id="cal-name" type="text" maxlength="40" placeholder="Ej: Ciclo de terror…" value="${escapeHtml(editing ? C.name : (options.name || ''))}"></label>` +
      `<div class="tl-members"><div class="tl-members__lbl">¿Con quién querés compartirlo? <span>Les llega una invitación y recién se suma si la aceptan.</span></div>${others.map((o) => {
        const state = accepted.has(o.id) ? ' · ya aceptó' : (selected.has(o.id) ? ' · invitación pendiente' : '');
        return `<button class="tl-member${selected.has(o.id) ? ' is-on' : ''}" data-member="${o.id}">${avatarHTML(o, 'avatar tl-member__av')} ${escapeHtml(o.name)}${state ? `<small>${state}</small>` : ''}</button>`;
      }).join('')}</div>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="cal-ok">${icon('check')} ${editing ? 'Guardar' : 'Crear'}</button></div></div>`;
    el.hidden = false;
    const nameInput = el.querySelector('#cal-name'); setTimeout(() => nameInput.focus(), 40);
    el.querySelectorAll('[data-member]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.member;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      b.classList.toggle('is-on', selected.has(id));
    }));
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#cal-ok').addEventListener('click', () => {
      const name = nameInput.value.trim(); if (!name) { nameInput.focus(); return; }
      let saved;
      let newlyInvited = [];
      if (editing) {
        const removed = [...new Set([...(C.members || []), ...(C.pendingMembers || [])])]
          .filter((uid) => uid !== C.owner && !selected.has(uid));
        newlyInvited = [...selected].filter((uid) => !accepted.has(uid) && !(C.pendingMembers || []).includes(uid));
        saved = {
          ...C, name,
          members: [C.owner, ...[...accepted].filter((uid) => selected.has(uid))],
          pendingMembers: [...selected].filter((uid) => !accepted.has(uid)),
        };
        delete saved.editable;
        delete saved.manageable;
        store.saveCalendars(store.getCalendars().map((c) => (c.id === C.id ? saved : c)));
        K.activity.removeMany(store, removed.map((uid) => `calendar-share:${C.id}:${uid}`));
      } else {
        const id = 'cal-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        newlyInvited = [...selected];
        saved = { id, name, owner: me.id, members: [me.id], pendingMembers: newlyInvited };
        store.saveCalendars([...store.getCalendars(), saved]);
        calBoardId = id;
      }
      if (newlyInvited.length) sendCalendarShareActivities(saved, newlyInvited);
      el.hidden = true; renderCalendario(app);
      if (newlyInvited.length) showCalendarToast('Invitación para compartir enviada', `${newlyInvited.length === 1 ? 'La otra persona decide' : 'Las otras personas deciden'} si se suma al calendario.`, 'success');
    });
  }
  function deleteCalendar(app, C) {
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">¿Borrar “${escapeHtml(C.name)}”?</div><p class="confirm__text">Se borran las funciones planeadas de este calendario. Las reseñas no se tocan.</p><div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="cal-delok">${icon('delete')} Borrar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#cal-delok').addEventListener('click', () => {
      const activityIds = [];
      const map = store.getCalEvents(C.id);
      Object.values(map).flat().forEach((ev) => {
        eventInvitees(C, ev).forEach((uid) => activityIds.push(`calendar-invite:${C.id}:${ev.id}:${uid}`));
        Object.keys(ev.accepted || {}).forEach((uid) => activityIds.push(`calendar-accept:${C.id}:${ev.id}:${uid}`));
      });
      (C.pendingMembers || []).forEach((uid) => activityIds.push(`calendar-share:${C.id}:${uid}`));
      (C.members || []).filter((uid) => uid !== C.owner).forEach((uid) => activityIds.push(`calendar-share-accept:${C.id}:${uid}`));
      K.activity.removeMany(store, activityIds);
      store.saveCalendars(store.getCalendars().filter((c) => c.id !== C.id));
      store.clearCalEvents(C.id);
      calBoardId = null; el.hidden = true; renderCalendario(app);
    });
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
      existing.owner = 'extra'; // remove from watchlist (keep as extra so a rating still shows in "Últimas reseñas")
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

  function reviewLikeHTML(f, reviewOwner, viewer) {
    const count = store.reviewLikeCount(f.id, reviewOwner.id);
    if (reviewOwner.id === viewer.id) {
      return count ? `<span class="review-like-summary">${icon('favorite')} ${count} ${count === 1 ? 'persona bancó' : 'personas bancaron'} tu reseña</span>` : '';
    }
    const liked = store.hasReviewLike(f.id, reviewOwner.id, viewer.id);
    return `<button type="button" class="review-like${liked ? ' is-liked' : ''}" id="review-like">${icon('favorite')}` +
      `<span class="review-like__label">${liked ? 'Te gusta esta reseña' : 'Me gusta esta reseña'}</span><b>${count || ''}</b></button>`;
  }

  function toggleReviewLike(f, reviewOwner, btn) {
    const viewer = currentUser();
    if (guestBlock('darle like a una reseña') || viewer.id === reviewOwner.id) return;
    const next = !store.hasReviewLike(f.id, reviewOwner.id, viewer.id);
    store.setReviewLike(f.id, reviewOwner.id, viewer.id, next);
    const activityId = `review-like:${APP_ID}:${f.id}:${reviewOwner.id}:${viewer.id}`;
    if (next) {
      K.activity.push(store, {
        id: activityId, type: 'review_like', app: APP_ID, actor: viewer.id, target: reviewOwner.id,
        itemId: f.id, title: f.title, reviewOwner: reviewOwner.id, createdAt: new Date().toISOString(),
      });
    } else {
      K.activity.remove(store, activityId);
    }
    const count = store.reviewLikeCount(f.id, reviewOwner.id);
    btn.classList.toggle('is-liked', next);
    btn.querySelector('.review-like__label').textContent = next ? 'Te gusta esta reseña' : 'Me gusta esta reseña';
    btn.querySelector('b').textContent = count || '';
  }

  function publishReviewActivity(f, before, after) {
    const actor = currentUser();
    const cleanBefore = (before || '').trim();
    const cleanAfter = (after || '').trim();
    if (!cleanAfter || cleanAfter === cleanBefore) return;
    const targets = Object.keys(users).filter((uid) => uid !== actor.id);
    if (!targets.length) return;
    K.activity.push(store, {
      id: `review:${APP_ID}:${f.id}:${actor.id}:${Date.now()}`,
      type: 'review_publish', app: APP_ID, actor: actor.id, targets,
      itemId: f.id, title: f.title, reviewOwner: actor.id,
      action: cleanBefore ? 'updated' : 'published', createdAt: new Date().toISOString(),
    });
  }

  /* ============================================================= SHEET */
  const sheet = $('#sheet');
  let sheetFilm = null;

  function openSheet(f, options = {}) {
    sheetFilm = f;
    const u = currentUser();
    const reviewMode = options.mode === 'review';
    const reviewOwner = users[options.reviewUserId] || u;
    const canEditReview = reviewMode && reviewOwner.id === u.id && !u.guest;
    const editingReview = canEditReview && options.editing === true;
    const editorVisible = !reviewMode || editingReview;
    const me = verdictOf(f.id, u.id);
    const selected = verdictOf(f.id, reviewOwner.id);
    const excludedUserId = reviewMode ? reviewOwner.id : u.id;
    const others = Object.values(users).filter((x) => x.id !== excludedUserId).map((x) => ({ u: x, e: verdictOf(f.id, x.id) }))
      .filter(({ e }) => typeof e.rating === 'number' || e.review || e.liked);
    const readonlyReview =
      `<div class="rate-box rate-box--review">` +
      `<div class="rate-box__head review-focus__head">${avatarHTML(reviewOwner)}` +
      `<span class="rate-box__you">Reseña de ${profileLink(reviewOwner.id, reviewOwner.name)}</span>` +
      (canEditReview ? `<button type="button" class="btn btn--soft btn--xs review-focus__edit" id="edit-review">${icon('edit')} Editar</button>` : '') +
      `</div><div class="review-focus__score">` +
      (typeof selected.rating === 'number' ? `${starsMarkup(selected.rating, 'md')}<span class="stars-value">${selected.rating.toFixed(1)}</span>` : `<span class="verdict__none">sin puntaje</span>`) +
      (selected.liked ? `<span class="like is-liked">${icon('favorite')} Le gusta</span>` : '') +
      `</div>` +
      (selected.review ? `<p class="review-focus__text">“${escapeHtml(selected.review)}”</p>` : `<p class="review-focus__empty">Todavía no dejó una reseña.</p>`) +
      watchMetaLine(f, reviewOwner.id) +
      reviewLikeHTML(f, reviewOwner, u) +
      `</div>`;
    const editor =
      `<div class="rate-box${editingReview ? ' rate-box--editing' : ''}">` +
      `<div class="rate-box__head">${avatarHTML(u)}<span class="rate-box__you">${editingReview ? 'Editar reseña de' : 'Tu puntaje,'} ${profileLink(u.id, u.name)}</span></div>` +
      `<div class="rate-box__row"><div class="rate-box__stars" id="rate-stars"></div>` +
      `<button class="rate-clear" id="rate-clear" ${typeof me.rating === 'number' ? '' : 'hidden'}>borrar</button></div>` +
      watchMetaHTML(f, u) +
      `<div class="review-field"><label for="review">Tu reseña</label>` +
      `<textarea id="review" placeholder="¿Qué te pareció?">${me.review ? escapeHtml(me.review) : ''}</textarea>` +
      `<div class="review-actions"><button class="btn btn--accent" id="save-review">${icon('save')} ${editingReview ? 'Guardar cambios' : 'Guardar reseña'}</button>` +
      (editingReview ? `<button class="btn btn--soft" id="cancel-review">Cancelar</button>` : '') +
      `<button class="btn btn--soft like ${me.liked ? 'is-liked' : ''}" id="sheet-like">${icon('favorite')} ${me.liked ? 'Te gusta' : 'Me gusta'}</button>` +
      `<span class="saved-flag" id="saved-flag">guardado ✓</span></div></div></div>`;

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
      ((!reviewMode || f.trailer) ? `<div class="sheet__cta">` +
      (f.trailer ? `<button class="btn btn--ghost sheet__trailer" id="sheet-trailer">${icon('play_circle')} Ver trailer</button>` : '') +
      (!reviewMode ? `<button class="btn btn--ghost" id="sheet-plan">${icon('event')} Agendar</button>` : '') +
      `</div>` : '') +
      (!reviewMode ? `<p class="sheet__synopsis">${escapeHtml(f.synopsis || '')}</p>` : '') +
      (editorVisible ? editor : readonlyReview) +

      (others.length
        ? `<div class="other-verdict"><div class="other-verdict__head">Lo que dijeron los demás</div>` +
          others.map(({ u: ou, e }) =>
            `<div class="verdict">${avatarHTML(ou, 'avatar verdict__avatar')}` +
            `<div class="verdict__main"><div class="verdict__row">${profileLink(ou.id, ou.name, 'verdict__name')}` +
            (typeof e.rating === 'number' ? `${starsMarkup(e.rating, 'sm')}<span class="stars-value">${e.rating.toFixed(1)}</span>` : '<span class="verdict__none">sin puntaje</span>') +
            (e.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '') +
            `</div>${e.review ? `<button type="button" class="verdict__review verdict__review--open" data-review-film="${escapeHtml(f.id)}" data-review-user="${escapeHtml(ou.id)}">“${escapeHtml(e.review)}”</button>` : ''}${watchMetaLine(f, ou.id)}</div></div>`).join('') +
          `</div>`
        : '') +

      `</div></div>`;

    if (editorVisible) {
      mountInteractiveStars($('#rate-stars', sheet), f, u, me.rating);
      wireWatchMeta(sheet, f, u);
      $('#rate-clear', sheet).addEventListener('click', () => {
        if (guestBlock()) return;
        store.setRating(f.id, u.id, null);
        openSheet(f, editingReview ? { mode: 'review', reviewUserId: u.id, editing: true } : {});
      });
      $('#save-review', sheet).addEventListener('click', () => {
        if (guestBlock()) return;
        const nextReview = $('#review', sheet).value.trim();
        store.setReview(f.id, u.id, nextReview);
        publishReviewActivity(f, me.review, nextReview);
        if (editingReview) {
          openSheet(f, { mode: 'review', reviewUserId: u.id });
          return;
        }
        const flag = $('#saved-flag', sheet); flag.classList.add('show');
        setTimeout(() => flag.classList.remove('show'), 1600);
      });
      if (!editingReview) $('#review', sheet).addEventListener('blur', (e) => { if (!isGuest()) store.setReview(f.id, u.id, e.target.value.trim()); });
      $('#sheet-like', sheet).addEventListener('click', (e) => toggleLike(f, e.currentTarget, true));
      const cancel = $('#cancel-review', sheet);
      if (cancel) cancel.addEventListener('click', () => openSheet(f, { mode: 'review', reviewUserId: u.id }));
    } else {
      const edit = $('#edit-review', sheet);
      if (edit) edit.addEventListener('click', () => openSheet(f, { mode: 'review', reviewUserId: u.id, editing: true }));
      const reviewLike = $('#review-like', sheet);
      if (reviewLike) reviewLike.addEventListener('click', () => toggleReviewLike(f, reviewOwner, reviewLike));
    }
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
    sheetCloseSeq++; // cancel any in-flight close animation from a previous sheet
    sheet.classList.remove('sheet--closing');
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onSheetKey);
  }

  function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }
  let sheetCloseSeq = 0;
  function closeSheet(refresh = true) {
    document.removeEventListener('keydown', onSheetKey);
    const seq = ++sheetCloseSeq;
    const finish = () => {
      if (seq !== sheetCloseSeq) return; // a reopen (or newer close) superseded this one
      sheet.hidden = true;
      sheet.setAttribute('aria-hidden', 'true');
      sheet.innerHTML = '';
      sheet.classList.remove('sheet--closing');
      document.body.style.overflow = '';
      if (refresh && route === 'home') { renderHome($('#app')); } // refresh "Últimas reseñas"
      sheetFilm = null;
    };
    const panel = sheet.querySelector('.sheet__panel');
    if (sheet.hidden || K.motion.reduced() || !panel) return finish();
    sheet.classList.add('sheet--closing'); // CSS animates panel + scrim out, then we hide
    panel.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 420); // fallback if animationend doesn't fire
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
  function profileCalendarDays(uid, byDay) {
    const merged = {};
    Object.entries(byDay).forEach(([iso, items]) => (merged[iso] = items.slice()));
    allEventCalendars().forEach((C) => {
      const dates = calEventsMap(C.id);
      Object.entries(dates).forEach(([iso, events]) => events.forEach((ev) => {
        const involved = ev.by === uid || eventInvitees(C, ev).includes(uid) || !!(ev.accepted || {})[uid];
        if (involved) (merged[iso] = merged[iso] || []).push({ calendar: C.id, event: ev.id });
      }));
    });
    return merged;
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
      html += `<button class="pmc__d${n ? ' is-on' : ''}${today ? ' is-today' : ''}" data-profile-cal-date="${iso}"` +
        ` style="--c:${color}" aria-label="${d} de ${MONTHS[m]}${n ? `, ${n} actividad${n === 1 ? '' : 'es'}` : ''}">${d}</button>`;
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
    return `<div class="pbars pbars--dist">${steps.map((s) => {
      const n = dist[s] || 0;
      return `<button class="pbar pbar--interactive" data-profile-rating="${s}" ${n ? '' : 'disabled'} aria-label="${n} título${n === 1 ? '' : 's'} con ${s} estrellas">` +
        `<span class="pbar__count">${n}</span><span class="pbar__fill" style="height:${Math.round((n / max) * 100)}%;--c:${color}"></span><small>${s}</small></button>`;
    }).join('')}</div>`;
  }
  function genreChart(genres, color) {
    const top = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!top.length) return `<p class="addfilm__hint">Todavía sin datos.</p>`;
    const max = top[0][1];
    return `<div class="prows">${top.map(([g, n]) => `<div class="prow"><span class="prow__l">${escapeHtml(g)}</span><span class="prow__t"><span class="prow__f" style="width:${Math.round((n / max) * 100)}%;--c:${color}"></span></span><b>${n}</b></div>`).join('')}</div>`;
  }
  const PROFILE_DETAIL_STATE_KEY = 'pwm.profile.detailState';
  let profileDetailState = {};
  try { profileDetailState = JSON.parse(localStorage.getItem(PROFILE_DETAIL_STATE_KEY) || '{}') || {}; } catch {}
  function profileDetailIsOpen(profileId, key) {
    const viewer = (currentUser() || {}).id || 'anon';
    const saved = profileDetailState[`${viewer}:${profileId}:${key}`];
    return saved !== false;
  }
  function rememberProfileDetail(profileId, key, open) {
    const viewer = (currentUser() || {}).id || 'anon';
    profileDetailState[`${viewer}:${profileId}:${key}`] = !!open;
    try { localStorage.setItem(PROFILE_DETAIL_STATE_KEY, JSON.stringify(profileDetailState)); } catch {}
  }
  function profileDetail(profileId, key, iconName, title, insight, body, explanation) {
    return `<details class="pcard pdetail" data-profile-detail="${escapeHtml(key)}"${profileDetailIsOpen(profileId, key) ? ' open' : ''}>` +
      `<summary class="pdetail__summary"><span class="pdetail__title">${icon(iconName)}<span><b>${title}</b><small>${escapeHtml(insight)}</small></span></span><span class="pdetail__toggle">${icon('expand_more')}</span></summary>` +
      `<div class="pdetail__body">${body}<p class="pdetail__explain">${explanation}</p></div></details>`;
  }
  function profileContentPreview(wrapper, host, topButton, bottomButton, items, renderItem, emptyText, options = {}) {
    let expanded = false;
    let hasOverflow = false;
    let measureFrame = 0;
    let observer = null;
    const mobileQuery = window.matchMedia('(max-width: 520px)');
    host.innerHTML = '';
    if (!items.length) host.innerHTML = `<p class="addfilm__hint">${emptyText}</p>`;
    items.forEach((item, index) => host.appendChild(renderItem(item, index)));
    const cards = () => [...host.children].filter((node) => !node.classList.contains('addfilm__hint'));
    const syncButtons = () => {
      const usesInlinePreview = mobileQuery.matches || !!options.desktopRows;
      if (topButton) topButton.hidden = true; // "Ver todas" removed — the peek button is the only toggle
      bottomButton.hidden = !hasOverflow || !usesInlinePreview;
      bottomButton.innerHTML = expanded
        ? `${icon('unfold_less')} Ver menos`
        : `${icon('unfold_more')} Ver más`;
      bottomButton.setAttribute('aria-expanded', String(expanded));
    };
    const resetCards = () => cards().forEach((node) => {
      node.hidden = false;
      node.inert = false;
    });
    const measure = () => {
      if (!wrapper.isConnected || expanded) return;
      const nodes = cards();
      resetCards();
      wrapper.classList.remove('has-preview');
      wrapper.style.removeProperty('--profile-preview-height');

      const previewRows = mobileQuery.matches ? 1 : Number(options.desktopRows || 0);
      if (previewRows) {
        const tops = [...new Set(nodes.map((node) => node.offsetTop))].sort((a, b) => a - b);
        hasOverflow = tops.length > previewRows;
        if (hasOverflow) {
          const clippedTop = tops[previewRows];
          const clippedCard = nodes.find((node) => node.offsetTop === clippedTop);
          wrapper.style.setProperty('--profile-preview-height', `${Math.round(clippedTop + (clippedCard ? clippedCard.offsetHeight * .52 : 120))}px`);
          nodes.forEach((node) => { node.inert = node.offsetTop >= clippedTop; });
          wrapper.classList.add('has-preview');
        }
      } else {
        const desktopCount = Number(options.desktopCount || items.length);
        hasOverflow = items.length > desktopCount;
        nodes.forEach((node, index) => {
          const concealed = index >= desktopCount;
          node.hidden = concealed;
          node.inert = concealed;
        });
      }
      syncButtons();
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(measureFrame);
      measureFrame = requestAnimationFrame(measure);
    };
    const handleBreakpointChange = () => {
      if (!wrapper.isConnected) {
        mobileQuery.removeEventListener('change', handleBreakpointChange);
        if (observer) observer.disconnect();
        return;
      }
      scheduleMeasure();
    };
    const setExpanded = (next) => {
      K.motion.run(() => {
        expanded = next;
        wrapper.classList.toggle('is-expanded', expanded);
        if (expanded) {
          resetCards();
          wrapper.classList.remove('has-preview');
          wrapper.style.removeProperty('--profile-preview-height');
        } else {
          scheduleMeasure();
        }
        syncButtons();
      }, { kind: 'shared', target: host });
    };
    if (topButton) topButton.hidden = true;
    bottomButton.addEventListener('click', () => setExpanded(!expanded));
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (!wrapper.isConnected) return observer.disconnect();
      scheduleMeasure();
    }) : null;
    if (observer) observer.observe(host);
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleBreakpointChange);
    scheduleMeasure();
  }

  function openRatingBreakdown(uid, rating, items) {
    const matches = items.filter((f) => verdictOf(f.id, uid).rating === rating);
    const who = users[uid] || currentUser();
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-cancel></div><div class="confirm__card confirm__card--wide rating-breakdown">` +
      `<div class="rating-breakdown__head"><div><div class="confirm__title">${rating} estrellas</div>` +
      `<p class="confirm__text">${escapeHtml(who.name)} puntuó ${matches.length} ${matches.length === 1 ? 'título' : 'títulos'} así.</p></div>` +
      `<button class="icon-btn" data-cancel aria-label="Cerrar">${icon('close')}</button></div>` +
      `<div class="rating-breakdown__grid">${matches.map((f) =>
        `<button class="rating-breakdown__item" data-rating-film="${escapeHtml(f.id)}">` +
        `<span style="background:${posterArt(f)}"></span><b>${escapeHtml(f.title)}</b><small>${f.year || ''}</small></button>`
      ).join('')}</div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => (el.hidden = true)));
    el.querySelectorAll('[data-rating-film]').forEach((button) => button.addEventListener('click', () => {
      const film = byId(button.dataset.ratingFilm);
      el.hidden = true;
      if (film) openSheet(film, { mode: verdictOf(film.id, uid).review ? 'review' : undefined, reviewUserId: uid });
    }));
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
      `<div class="phero phero--overview" style="--c:${u.color}">` +
      (mine ? `<button class="profile-customize" id="p-customize">${icon('palette')} Personalizar fondo</button>` : '') +
      `<div class="phero__identity">` +
      `<button class="phero__av" id="p-photo" ${mine ? '' : 'disabled'} title="${mine ? 'Cambiar foto o GIF' : ''}">${avatarHTML(u, 'avatar phero__avatar')}${mine ? `<span class="phero__cam">${icon('photo_camera')}</span>` : ''}</button>` +
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
      `<section class="profile-block"><div class="profile-block__head"><h3 class="section__title psub"><span class="accentbar">/</span> Últimas reseñas</h3><button class="profile-more" id="p-reviews-more" aria-controls="p-reviews" hidden></button></div>` +
      `<div class="profile-poster-preview" id="p-reviews-preview"><div class="pgrid pgrid--wide" id="p-reviews"></div><span class="profile-poster-preview__veil" aria-hidden="true"></span>` +
      `<button class="profile-poster-preview__more" id="p-reviews-peek" aria-controls="p-reviews" hidden>${icon('unfold_more')} Ver más</button></div></section>` +
      `<section class="profile-block"><div class="profile-block__head"><h3 class="section__title psub"><span class="accentbar">/</span> Mejor rankeadas</h3><button class="profile-more" id="p-best-more" aria-controls="p-best" hidden></button></div>` +
      `<div class="profile-poster-preview" id="p-best-preview"><div class="profile-poster-grid" id="p-best"></div><span class="profile-poster-preview__veil" aria-hidden="true"></span>` +
      `<button class="profile-poster-preview__more" id="p-best-peek" aria-controls="p-best" hidden>${icon('unfold_more')} Ver más</button></div></section>` +
      `<section class="profile-block"><div class="profile-block__head"><h3 class="section__title psub"><span class="accentbar">/</span> Watchlist de ${escapeHtml(u.name)}</h3><button class="profile-more" id="p-watchlist-more" aria-controls="p-watchlist" hidden></button></div>` +
      `<div class="profile-poster-preview" id="p-watchlist-preview"><div class="profile-poster-grid" id="p-watchlist"></div><span class="profile-poster-preview__veil" aria-hidden="true"></span>` +
      `<button class="profile-poster-preview__more" id="p-watchlist-peek" aria-controls="p-watchlist" hidden>${icon('unfold_more')} Ver más</button></div></section>` +
      `</div><aside class="profile-rail" aria-label="Actividad y estadísticas">` +
      `<div class="pcard profile-calendar"><h4>${icon('calendar_month')} Este mes</h4>${miniCalendar(profileCalendarDays(id, s.byDay), u.color)}` +
      `<p class="pdetail__explain">Los días marcados reúnen funciones agendadas y títulos vistos.</p>` +
      `<button class="linklike profile-calendar__open" id="p-calendar-open">${icon('open_in_new')} Abrir calendario completo</button></div>` +
      profileDetail(id, 'ratings', 'star', 'Cómo puntuás', s.avg ? `${s.avg.toFixed(2)} de promedio` : 'Sin promedio', distChart(s.dist, u.color), 'Agrupa tus puntuaciones de media en media estrella para mostrar si sos más exigente o generoso al puntuar.') +
      profileDetail(id, 'months', 'bar_chart', 'Últimos 12 meses', `${s.thisYear} en ${year}`, yearStrip(s.byMonth, u.color), 'Cada barra representa cuántos títulos registraste en ese mes. Sirve para ver tus épocas más activas.') +
      profileDetail(id, 'genres', 'category', 'Tus géneros', topGenre, genreChart(s.genres, u.color), 'Cuenta los géneros presentes en los títulos que puntuaste. Una película puede sumar en más de un género.') +
      profileDetail(id, 'medals', 'workspace_premium', 'Medallas', `${medalsDone} de ${MEDALS.length} logradas`, `<div class="pmedals">${medals}</div>`, 'Se desbloquean automáticamente con tu actividad. La barra muestra cuánto te falta para cada objetivo.') +
      `</aside></div>`;
    app.appendChild(sec);
    app.appendChild(buildFooter());
    K.profileBackground.apply(sec, sec.querySelector('.phero'), acc, u.color);
    const openProfileCalendar = (iso = '') => {
      if (id !== me.id) {
        K.toast(`El calendario completo de ${u.name} es personal.`);
        return;
      }
      const cals = currentCalendars();
      let target = cals.find((C) => {
        if (!iso) return false;
        return (calendarEventsFor(C)[iso] || []).some((ev) => ev.by === id || !!(ev.accepted || {})[id]);
      }) || cals.find((C) => C.type === 'personal') || cals[0] || currentCalendars()[0];
      calBoardId = target.id;
      if (iso) {
        const date = new Date(`${iso}T00:00:00`);
        calCursor = { y: date.getFullYear(), m: date.getMonth() };
      }
      setRoute('calendario');
      if (iso) setTimeout(() => {
        target = currentCalendars().find((C) => C.id === calBoardId) || currentCalendars()[0];
        openCalDay(target, iso);
      }, 60);
    };
    sec.querySelector('#p-calendar-open').addEventListener('click', () => openProfileCalendar());
    sec.querySelectorAll('[data-profile-cal-date]').forEach((button) => button.addEventListener('click', () => openProfileCalendar(button.dataset.profileCalDate)));
    sec.querySelectorAll('[data-profile-rating]').forEach((button) => button.addEventListener('click', () => openRatingBreakdown(id, Number(button.dataset.profileRating), s.ratedList)));
    sec.querySelectorAll('[data-profile-detail]').forEach((detail) => detail.addEventListener('toggle', () => {
      rememberProfileDetail(id, detail.dataset.profileDetail, detail.open);
    }));

    const revs = s.reviewList
      .map((f) => ({ f, t: Date.parse(store.get(f.id, id).updatedAt || 0) || 0 }))
      .sort((a, b) => b.t - a.t);
    const rw = sec.querySelector('#p-reviews');
    profileContentPreview(sec.querySelector('#p-reviews-preview'), rw, sec.querySelector('#p-reviews-more'), sec.querySelector('#p-reviews-peek'), revs, ({ f }) => {
        const v = verdictOf(f.id, id);
        const c = document.createElement('button');
        c.className = 'prev';
        c.innerHTML = `<span class="prev__poster" style="background:${posterArt(f)}"></span>` +
          `<span class="prev__b"><b>${escapeHtml(f.title)}</b>` +
          `<span class="prev__stars">${starsMarkup(v.rating || 0, 'sm')}${v.rating != null ? `<span class="stars-value">${v.rating.toFixed(1)}</span>` : ''}</span>` +
          `<span class="prev__txt">“${escapeHtml(v.review)}”</span></span>`;
        c.addEventListener('click', () => openSheet(f, { mode: 'review', reviewUserId: id }));
        return K.motion.tag(c, `pwm-profile-review-${id}-${f.id}`);
      }, 'Todavía sin reseñas.', { desktopRows: 1 });

    const best = s.ratedList.slice().sort((a, b) => verdictOf(b.id, id).rating - verdictOf(a.id, id).rating);
    const bw = sec.querySelector('#p-best');
    profileContentPreview(sec.querySelector('#p-best-preview'), bw, sec.querySelector('#p-best-more'), sec.querySelector('#p-best-peek'), best, (f) =>
      K.motion.tag(posterCard(f), `pwm-profile-best-${id}-${f.id}`), 'Puntuá algo y aparece acá.', { desktopRows: 2 });

    const watchlist = orderedWatchlist().filter((f) => ownersOf(f).includes(id));
    const ww = sec.querySelector('#p-watchlist');
    profileContentPreview(sec.querySelector('#p-watchlist-preview'), ww, sec.querySelector('#p-watchlist-more'), sec.querySelector('#p-watchlist-peek'), watchlist, (f) =>
      K.motion.tag(posterCard(f), `pwm-profile-watchlist-${id}-${f.id}`), `${escapeHtml(u.name)} todavía no tiene títulos en su watchlist.`, { desktopRows: 2 });

    if (mine) {
      sec.querySelector('#p-photo').addEventListener('click', () => K.pickPhoto((data) => {
        K.accounts.patch(store, id, { photo: data });
        refreshUsers(); renderHeader(); renderPerfil(app);
        K.toast('Foto actualizada ✓');
      }));
      sec.querySelector('#p-editbio').addEventListener('click', () => openBioEditor(app, id, bio));
      sec.querySelector('#p-customize').addEventListener('click', () => K.profileBackground.open(store, id, {
        color: u.color,
        onSave: () => { refreshUsers(); renderPerfil(app, id); },
      }));
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
      `<div class="cfg__row"><div class="cfg__l">${icon('account_circle')}<div><b>Foto o GIF de perfil</b><small>Las fotos se recortan; los GIF de hasta 1MB conservan la animación en las dos apps.</small></div></div>` +
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
  function openDeepLink() {
    const params = new URLSearchParams(location.search);
    const reviewId = params.get('review');
    const reviewUser = params.get('user');
    const calendarId = params.get('calendar');
    const calendarShareId = params.get('calendar-share');
    const date = params.get('date');
    if (reviewId) {
      const f = byId(reviewId);
      if (f) openSheet(f, { mode: 'review', reviewUserId: reviewUser || currentUser().id });
    } else if (calendarShareId) {
      const invite = K.activity.forUser(store, currentUser().id)
        .find((item) => item.type === 'calendar_share_invite' && item.calId === calendarShareId);
      if (invite) openCalendarShareInvite(invite);
      else K.toast('Esa invitación para compartir ya no está disponible.', 'bad');
    } else if (calendarId) {
      calBoardId = calendarId;
      if (date) {
        const d = new Date(date + 'T00:00:00');
        calCursor = { y: d.getFullYear(), m: d.getMonth() };
      }
      setRoute('calendario');
      if (date) setTimeout(() => {
        const C = currentCalendars().find((c) => c.id === calBoardId) || currentCalendars()[0];
        openCalDay(C, date);
      }, 60);
    }
    if (reviewId || calendarId || calendarShareId) history.replaceState({}, '', location.pathname + location.hash);
  }

  function startApp() {
    applyAccent();
    wireProfileNavigation();
    wireHashRouting();
    renderHeader();
    setRoute(routeFromHash() || 'home');
    setTimeout(openDeepLink, 40);
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
          || document.getElementById('calday')?.hidden === false
          || document.getElementById('notification-center');
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
