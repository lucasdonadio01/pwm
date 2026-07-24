/* PRB — Project Read Books — app controller (vanilla) */
(function () {
  'use strict';
  const store = PRB.store;
  const K = window.APPKIT;
  const APP_ID = 'prb';
  const users = {};
  function refreshUsers() {
    const merged = K.accounts.all(store, PRB.users);
    Object.keys(users).forEach((k) => { if (!merged[k]) delete users[k]; });
    Object.assign(users, merged);
  }
  refreshUsers();
  const books = PRB.books.slice();
  const root = document.documentElement;

  const $ = (s, r = document) => r.querySelector(s);
  const icon = (n) => `<span class="material-symbols-rounded">${n}</span>`;
  const byId = (id) => books.find((b) => b.id === id);
  const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Books the users added by hand (shared via Supabase settings 'extra_books').
  function mergeExtras() { (store.getSetting('extra_books') || []).forEach((b) => { if (!books.some((x) => x.id === b.id)) books.push(b); }); }
  function addExtraBook(b) {
    if (books.some((x) => x.id === b.id)) return false;
    b.extra = true; books.push(b);
    const ex = store.getSetting('extra_books') || []; ex.push(b); store.setSetting('extra_books', ex);
    return true;
  }

  // avatars are shared with PWM (one level up)
  const PHOTOS = { bian: '../assets/bian.jpg', luke: '../assets/luke.jpg' };
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

  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff; return Math.abs(h); }
  // cold-hue placeholder for books without a cover
  function art(b) {
    if (b.cover) return `#060c18 url(${b.cover}) center/cover`;
    const h1 = 190 + (hash(b.id) % 60);          // blues/cyans
    const h2 = 210 + (hash(b.title) % 50);
    return `radial-gradient(120% 130% at 20% 12%, hsl(${h1} 80% 30% / .95), transparent 55%),` +
      `radial-gradient(130% 130% at 88% 92%, hsl(${h2} 85% 26% / .95), transparent 55%),` +
      `linear-gradient(135deg, hsl(${h1} 60% 10%), hsl(${h2} 65% 7%))`;
  }
  const coverArt = art;

  const isGuest = () => store.getUser() === 'guest';
  const currentUser = () => (isGuest() ? K.accounts.guest() : users[store.getUser()] || null);
  function guestBlock(action = 'guardar cambios') {
    if (!isGuest()) return false;
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-account-close></div><div class="confirm__card account-required">` +
      `<span class="account-required__icon">${icon('lock_person')}</span><div class="confirm__title">Necesitás una cuenta</div>` +
      `<p class="confirm__text">Para ${escapeHtml(action)} y sincronizarlo, creá tu perfil o iniciá sesión.</p>` +
      `<ul class="account-required__benefits"><li>${icon('sync')} Tus cambios quedan guardados</li><li>${icon('group')} Podés compartir tiers y lecturas</li></ul>` +
      `<div class="confirm__actions confirm__actions--stack"><button class="btn btn--accent" id="account-create">${icon('person_add')} Crear usuario</button>` +
      `<button class="btn btn--soft" id="account-login">${icon('login')} Iniciar sesión</button><button class="linklike account-required__cancel" data-account-close>Cancelar</button></div></div>`;
    el.querySelectorAll('[data-account-close]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#account-create').addEventListener('click', () => openSignup());
    el.querySelector('#account-login').addEventListener('click', () => { el.hidden = true; store.setUser(null); showGate(); });
    el.hidden = false;
    return true;
  }
  function applyAccent() { const u = currentUser(); root.style.setProperty('--accent', u ? u.color : 'var(--hot)'); }

  function starsMarkup(value, size = 'sm') {
    const pct = (Math.max(0, Math.min(5, value || 0)) / 5) * 100;
    const five = icon('star').repeat(5);
    return `<span class="stars stars--${size}"><span class="stars__row stars__base">${five}</span><span class="stars__row stars__fill" style="width:${pct}%">${five}</span></span>`;
  }

  /* ---------- verdict (store only; no external import for books) ---------- */
  const verdictOf = (id, uid) => { const e = store.get(id, uid); return { rating: typeof e.rating === 'number' ? e.rating : null, review: e.review || '', liked: !!e.liked }; };

  /* ============================================================= GATE */
  const gate = $('#gate');
  function enterAs(id) { store.setUser(id); refreshUsers(); applyAccent(); gate.hidden = true; startApp(); }
  function showGate() {
    $('#site-header').hidden = true; $('#app').hidden = true;
    const wrap = $('#gate-profiles'); wrap.innerHTML = '';
    // Real users up top, neon-lit in their own colour; secondary options below.
    const usersRow = document.createElement('div'); usersRow.className = 'gate__users';
    Object.values(users).forEach((u) => {
      const btn = document.createElement('button');
      btn.className = 'profile'; btn.style.setProperty('--c', u.color);
      btn.innerHTML = avatarHTML(u, 'profile__avatar') + `<span class="profile__name">${u.name}</span><span class="profile__handle">@${u.handle}</span>`;
      btn.addEventListener('click', () => askPin(u, () => enterAs(u.id)));
      usersRow.appendChild(btn);
    });
    wrap.appendChild(usersRow);
    const altRow = document.createElement('div'); altRow.className = 'gate__alt';
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

  const NEW_COLORS = ['#22D3EE', '#3D7BFF', '#2E7BFF', '#BBEF1F', '#7C5CFF', '#FF2E9A', '#3DDC97', '#F5C518'];
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
        `<div class="su-photo__txt"><b>Foto o GIF de perfil</b><small>Las fotos se recortan · los GIF animados de hasta 1MB mantienen el movimiento y se comparten con PWM.</small>` +
        (photo ? `<button class="linklike" id="su-picoff">Sacar la foto</button>` : '') + `</div></div>` +
        `<label class="tl-field"><span>Nombre</span><input id="su-name" type="text" maxlength="24" placeholder="Cómo te llamás" autocomplete="off"></label>` +
        `<label class="tl-field"><span>Usuario de Letterboxd <small>(opcional)</small></span><input id="su-lb" type="text" maxlength="40" placeholder="tuusuario" autocomplete="off"></label>` +
        `<p class="confirm__text confirm__text--tight">La cuenta, la foto y la contraseña sirven tanto en PRB como en PWM.</p>` +
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
  function choosePin(name, color, photo, onOk, onCancel) {
    let first = null;
    const av = `<span class="profile__avatar" style="--c:${color}">${(name || '?').charAt(0).toUpperCase()}${photo ? `<img class="avatar__img" src="${photo}" alt="">` : ''}</span>`;
    K.pinPad({
      avatar: av, name, color, label: 'Elegí una contraseña de 4 números', onCancel,
      async onDone(pin, ctl) {
        if (first == null) { first = pin; ctl.next('Repetila para confirmar'); return; }
        if (pin !== first) { first = null; ctl.next('No coinciden — elegí una de nuevo'); return; }
        ctl.close(); onOk(pin);
      },
    });
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
    { id: 'selectos', label: 'Selectos' },
    { id: 'leyendo', label: 'Leyendo' },
    { id: 'leidos', label: 'Leídos' },
    { id: 'tier', label: 'Tier' },
  ];
  let route = 'home';
  let profileUserId = null;
  let profileNavigationWired = false;

  // Hash routing: reflect the current section in location.hash so F5/reload keeps you where you
  // were and the browser's Back/Forward move between sections. (See correcciones.md #22.)
  const ROUTES = ['home', 'selectos', 'leyendo', 'leidos', 'tier', 'perfil', 'config'];
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
      detail: item.title || 'Invitación de PWM',
    };
    if (item.type === 'calendar_accept') return {
      icon: 'celebration',
      title: `${actor.name} confirmó que va`,
      detail: item.title || 'Función de PWM',
    };
    if (item.type === 'calendar_share_invite') return {
      icon: 'calendar_add_on',
      title: `${actor.name} quiere compartir un calendario con vos`,
      detail: item.title || 'Calendario de PWM',
    };
    if (item.type === 'calendar_share_accept') return {
      icon: 'group_add',
      title: `${actor.name} aceptó compartir tu calendario`,
      detail: item.title || 'Calendario de PWM',
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
      location.href = `../index.html?calendar-share=${encodeURIComponent(item.calId || '')}`;
      return;
    }
    if (item.type === 'calendar_share_accept') {
      location.href = `../index.html?calendar=${encodeURIComponent(item.calId || '')}`;
      return;
    }
    if (item.type === 'calendar_invite' || item.type === 'calendar_accept') {
      location.href = `../index.html?calendar=${encodeURIComponent(item.calId || 'cal-main')}&date=${encodeURIComponent(item.iso || '')}`;
      return;
    }
    if ((item.type === 'review_like' || item.type === 'review_publish') && item.itemId) {
      if (item.app === APP_ID) {
        const b = byId(item.itemId);
        if (b) openSheet(b, { mode: 'review', reviewUserId: item.reviewOwner || item.actor });
      } else {
        location.href = `../index.html?review=${encodeURIComponent(item.itemId)}&user=${encodeURIComponent(item.reviewOwner || item.actor || '')}`;
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
    const unread = u && !u.guest ? K.activity.unreadCount(store, u.id) : 0;
    header.innerHTML =
      `<button class="hamburger" id="hamburger" aria-label="Abrir menú">${icon('menu')}</button>` +
      `<a class="logo" href="#home" aria-label="PRB — Project Read Books"><b>PRB</b><span class="dot">.</span></a>` +
      `<nav class="nav" id="nav">${NAV.map((n) => `<a href="#${n.id}" data-route="${n.id}" class="${n.id === route ? 'is-active' : ''}">${n.label}</a>`).join('')}` +
      `<a class="nav__x" href="../index.html">${icon('movie')} Pelis</a></nav>` +
      `<div class="header__right"><button class="icon-btn hdr-notif" id="hdr-notif" title="Notificaciones" aria-label="Notificaciones${unread ? ` · ${unread} nueva(s)` : ''}">${icon('notifications')}` +
      (unread ? `<span class="hdr-badge">${unread > 9 ? '9+' : unread}</span>` : '') + `</button><div class="user-chip">` +
      `<button type="button" class="user-chip__name profile-link"${u ? ` data-profile-user="${escapeHtml(u.id)}"` : ''} title="Ver mi perfil">${u ? escapeHtml(u.name) : ''}</button>` +
      `<button type="button" class="user-chip__avatar" id="user-chip" title="Tu cuenta" aria-label="Abrir tu cuenta" aria-haspopup="true">` +
      (u ? avatarHTML(u) : `<span class="avatar" style="--c:var(--hot)">?</span>`) +
      `</button></div></div>`;
    header.querySelectorAll('[data-route]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setRoute(a.dataset.route); $('#nav', header).classList.remove('nav--open'); }));
    $('.logo', header).addEventListener('click', (e) => { e.preventDefault(); setRoute('home'); $('#nav', header).classList.remove('nav--open'); });
    $('#hamburger', header).addEventListener('click', () => $('#nav', header).classList.toggle('nav--open'));
    $('#hdr-notif', header).addEventListener('click', openNotifications);
    $('#user-chip', header).addEventListener('click', openUserMenu);
    header.hidden = false;
  }
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
      const a = b.dataset.act; el.hidden = true;
      if (a === 'perfil') setRoute('perfil');
      else if (a === 'config') setRoute('config');
      else if (a === 'signup') openSignup();
      else if (a === 'out') { stopHero(); store.clearUser(); showGate(); }
    }));
  }
  function onScroll() { $('#site-header').classList.toggle('header--solid', route !== 'home' || window.scrollY > 60); }

  /* ============================================================= ROUTING */
  function setRoute(r, options = {}) {
    K.motion.run(() => {
      route = r;
      profileUserId = r === 'perfil' ? (options.uid || (currentUser() && currentUser().id)) : null;
      syncHash(r);
      document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.route === route));
      window.scrollTo({ top: 0, behavior: 'auto' });
      renderRoute(); onScroll();
    }, { kind: 'route' });
  }
  function renderRoute() {
    stopHero();
    const app = $('#app'); app.hidden = false;
    if (route === 'home') return renderHome(app);
    if (route === 'selectos') return renderSelectos(app);
    if (route === 'leyendo') return renderLeyendo(app);
    if (route === 'leidos') return renderLeidos(app);
    if (route === 'tier') return renderTier(app);
    if (route === 'perfil') return renderPerfil(app, profileUserId);
    if (route === 'config') return renderConfig(app);
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
      const review = e.target.closest('[data-review-book][data-review-user]');
      if (review) {
        const book = byId(review.dataset.reviewBook);
        if (!book) return;
        e.preventDefault();
        e.stopPropagation();
        openSheet(book, { mode: 'review', reviewUserId: review.dataset.reviewUser });
        return;
      }
      const target = e.target.closest('[data-profile-user]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      goToProfile(target.dataset.profileUser);
    }, true);
  }

  /* ---------- reading helpers ---------- */
  const todayISO = () => new Date().toISOString().slice(0, 10);
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function readingPercent(r) {
    if (r.status === 'read') return 100;
    if (typeof r.page === 'number' && typeof r.pageTotal === 'number' && r.pageTotal > 0) return Math.max(0, Math.min(100, Math.round((r.page / r.pageTotal) * 100)));
    return null;
  }
  // Books that at least one user is currently reading.
  function readingBooks() {
    return books.filter((b) => Object.values(users).some((u) => store.getReading(b.id, u.id).status === 'reading'));
  }

  /* ============================================================= HOME */
  function renderHome(app) {
    app.innerHTML = '';
    app.appendChild(buildHero());
    app.appendChild(buildRecommender());
    app.appendChild(buildRead('Leídos'));
    app.appendChild(buildLatestReviews());
    app.appendChild(buildFooter());
    startHero();
  }

  /* ---------- hero ---------- */
  let heroBooks = [], heroIndex = 0, heroTimer = null;
  function buildHero() {
    heroBooks = books.filter((b) => b.featured);
    heroIndex = 0;
    const hero = document.createElement('section');
    hero.className = 'hero';
    hero.innerHTML =
      `<div class="hero__stage">${heroBooks.map((b, i) => heroSlide(b, i)).join('')}</div>` +
      `<button class="hero__arrow hero__arrow--prev" aria-label="Anterior">${icon('chevron_left')}</button>` +
      `<button class="hero__arrow hero__arrow--next" aria-label="Siguiente">${icon('chevron_right')}</button>` +
      `<div class="hero__dots">${heroBooks.map((_, i) => `<button class="hero__dot ${i === 0 ? 'is-active' : ''}" aria-label="Ir a ${i + 1}"></button>`).join('')}</div>`;
    hero.querySelector('.hero__arrow--prev').addEventListener('click', () => slideHero(-1, true));
    hero.querySelector('.hero__arrow--next').addEventListener('click', () => slideHero(1, true));
    hero.querySelectorAll('.hero__dot').forEach((d, i) => d.addEventListener('click', () => goHeroTo(i, true)));
    hero.querySelectorAll('[data-hero-rate]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openSheet(heroBooks[+b.dataset.heroRate]); }));
    hero.querySelectorAll('[data-hero-like]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(heroBooks[+b.dataset.heroLike], b, true); }));
    hero.addEventListener('mouseenter', () => hero.classList.add('is-paused'));
    hero.addEventListener('mouseleave', () => hero.classList.remove('is-paused'));
    return hero;
  }
  function heroSlide(b, i) {
    const meta = [b.genres && b.genres[0], b.year, b.author].filter(Boolean)
      .map((x, idx) => (idx === 0 ? `<span class="eyebrow" style="color:var(--lime)">${x}</span>` : `<span>${x}</span>`)).join('<span class="dot-sep">·</span>');
    const u = currentUser();
    const liked = u && store.get(b.id, u.id).liked;
    return `<div class="hero__slide ${i === 0 ? 'is-active' : ''}" data-index="${i}">` +
      `<div class="hero__bg hero__bg--book" style="background:${art(b)}"></div><div class="hero__scrim"></div>` +
      `<div class="hero__content bhero">` +
      `<div class="bhero__cover"><div class="poster__img" style="background:${coverArt(b)}"></div></div>` +
      `<div class="bhero__text"><div class="hero__meta">${meta}</div>` +
      `<h2 class="hero__title">${escapeHtml(b.title)}</h2>` +
      `<p class="hero__synopsis">${escapeHtml(b.synopsis || '')}</p>` +
      `<div class="hero__actions"><button class="btn btn--accent" data-hero-rate="${i}">${icon('star')} Puntuar y reseñar</button>` +
      `<button class="btn btn--ghost like ${liked ? 'is-liked' : ''}" data-hero-like="${i}">${icon('favorite')} Me gusta</button>` +
      `</div></div></div></div>`;
  }
  function slideHero(dir, manual) { goHeroTo(heroIndex + dir, manual, dir); }
  function goHeroTo(n, manual, dirHint) {
    const slides = [...document.querySelectorAll('.hero__slide')]; if (!slides.length) return;
    const total = heroBooks.length; const newIndex = ((n % total) + total) % total;
    if (newIndex === heroIndex) { if (manual) restartHeroTimer(); return; }
    const dir = dirHint != null ? dirHint : newIndex > heroIndex ? 1 : -1;
    const outEl = slides[heroIndex], inEl = slides[newIndex];
    inEl.style.transition = 'none'; inEl.style.transform = `translateX(${dir > 0 ? 100 : -100}%)`; inEl.style.zIndex = '3'; outEl.style.zIndex = '2';
    void inEl.offsetWidth; inEl.style.transition = '';
    requestAnimationFrame(() => { outEl.style.transform = `translateX(${dir > 0 ? -100 : 100}%)`; inEl.style.transform = 'translateX(0)'; });
    slides.forEach((s, i) => s.classList.toggle('is-active', i === newIndex));
    document.querySelectorAll('.hero__dot').forEach((d, i) => d.classList.toggle('is-active', i === newIndex));
    heroIndex = newIndex; if (manual) restartHeroTimer();
  }
  function startHero() { restartHeroTimer(); }
  function restartHeroTimer() { stopHero(); heroTimer = setInterval(() => slideHero(1, false), 7000); }
  function stopHero() { if (heroTimer) clearInterval(heroTimer); heroTimer = null; }

  /* ---------- recommender ---------- */
  const QUIZ = [
    { id: 'genres', q: 'Género', multi: true, opts: ['Distopía', 'Ciencia ficción', 'Cyberpunk', 'Filosofía', 'Novela', 'Fantasía', 'Clásico', 'Aventura', 'Ensayo'].map((g) => ({ v: g, label: g })) },
    { id: 'era', q: 'Época', opts: [{ v: 'clasico', label: 'Clásicos (pre-1970)' }, { v: 'moderno', label: 'Modernos (1970+)' }, { v: 'any', label: 'Da igual' }] },
    { id: 'vibe', q: '¿Qué buscás?', opts: [{ v: 'oscuro', label: 'Oscuro / distópico' }, { v: 'pensar', label: 'Para pensar' }, { v: 'any', label: 'Da igual' }] },
  ];
  const answers = { genres: [], era: 'any', vibe: 'any' };
  const DARK = ['Distopía', 'Cyberpunk', 'Terror'];
  const THINK = ['Filosofía', 'Ensayo', 'Ciencia ficción'];
  function scoreBook(b, a) {
    const g = b.genres || []; let s = 0;
    if (a.genres.length) { const ov = g.filter((x) => a.genres.includes(x)).length; s += ov ? ov * 4 : -3; }
    if (a.era === 'clasico') s += b.year < 1970 ? 3 : -2; else if (a.era === 'moderno') s += b.year >= 1970 ? 3 : -2;
    if (a.vibe === 'oscuro') s += g.some((x) => DARK.includes(x)) ? 3 : -1; else if (a.vibe === 'pensar') s += g.some((x) => THINK.includes(x)) ? 3 : -1;
    return s;
  }
  function recommend(a) {
    const scored = books.map((b) => ({ b, s: scoreBook(b, a) }));
    const anyFilter = a.genres.length || a.era !== 'any' || a.vibe !== 'any';
    // with filters on, keep only books that actually fit; otherwise everything is fair game
    let pool = anyFilter ? scored.filter((o) => o.s > 0) : scored.slice();
    if (pool.length < 12) pool = scored.slice().sort((x, y) => y.s - x.s).slice(0, Math.max(12, pool.length));
    // rank by score + a random jitter so repeated taps surface fresh (still relevant) picks
    pool.forEach((o) => (o.r = o.s + Math.random() * 4));
    return pool.sort((x, y) => y.r - x.r).slice(0, 12).map((o) => o.b);
  }
  function buildRecommender() {
    const s = document.createElement('section'); s.className = 'section recommender';
    s.innerHTML =
      `<button class="rec-toggle" id="rec-toggle" aria-expanded="false"><div><h3 class="section__title"><span class="accentbar">/</span> ¿Qué leo ahora?</h3>` +
      `<p class="section__sub">Respondé y te tiro 12 libros</p></div><span class="material-symbols-rounded rec-chev">expand_more</span></button>` +
      `<div class="rec-panel" id="rec-panel" hidden><div class="quiz">` +
      QUIZ.map((q) => `<div class="quiz__q"><div class="quiz__label">${q.q}${q.multi ? ' <span class="quiz__multi">— elegí los que quieras</span>' : ''}</div><div class="quiz__opts" data-q="${q.id}" data-multi="${q.multi ? 1 : 0}">${q.opts.map((o) => `<button class="quiz__opt" data-v="${escapeHtml(o.v)}">${o.label}</button>`).join('')}</div></div>`).join('') +
      `<div class="quiz__actions"><button class="btn btn--accent" id="quiz-go">${icon('auto_awesome')} Recomendame</button><button class="btn btn--soft" id="quiz-reset">${icon('restart_alt')} Limpiar</button></div>` +
      `</div><div class="quiz__results" id="quiz-results"></div></div>`;
    const toggle = s.querySelector('#rec-toggle'), panel = s.querySelector('#rec-panel');
    toggle.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; toggle.classList.toggle('is-open', open); });
    s.querySelectorAll('.quiz__opts').forEach((group) => group.addEventListener('click', (e) => {
      const btn = e.target.closest('.quiz__opt'); if (!btn) return; const qid = group.dataset.q;
      if (group.dataset.multi === '1') { const arr = answers[qid], idx = arr.indexOf(btn.dataset.v); if (idx >= 0) { arr.splice(idx, 1); btn.classList.remove('is-on'); } else { arr.push(btn.dataset.v); btn.classList.add('is-on'); } }
      else { answers[qid] = btn.dataset.v; group.querySelectorAll('.quiz__opt').forEach((x) => x.classList.toggle('is-on', x === btn)); }
    }));
    s.querySelector('#quiz-go').addEventListener('click', () => {
      const wrap = s.querySelector('#quiz-results');
      wrap.innerHTML = `<div class="quiz__reshead">${icon('auto_awesome')} Para vos · 12 libros</div><div class="grid" id="quiz-grid"></div>`;
      recommend(answers).forEach((b) => wrap.querySelector('#quiz-grid').appendChild(bookCard(b)));
      wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    s.querySelector('#quiz-reset').addEventListener('click', () => { answers.genres = []; answers.era = 'any'; answers.vibe = 'any'; s.querySelectorAll('.quiz__opt').forEach((x) => x.classList.remove('is-on')); s.querySelector('#quiz-results').innerHTML = ''; });
    return s;
  }

  /* ---------- Leídos ---------- */
  let readOwner = 'all';
  let readView = 'list';
  function readByOwner() {
    return books.filter((b) => {
      const ids = readOwner === 'all' ? Object.keys(users) : [readOwner];
      return ids.some((uid) => {
        const v = verdictOf(b.id, uid);
        const r = store.getReading(b.id, uid);
        return v.rating != null || v.review || v.liked || r.status === 'read';
      });
    });
  }
  function buildRead(title) {
    const s = document.createElement('section'); s.className = 'section';
    s.innerHTML =
      `<div class="section__head section__head--search"><div><h3 class="section__title"><span class="accentbar">/</span> ${title}</h3>` +
      `<p class="section__sub">Filtrá por lector y elegí lista o portadas</p></div>` +
      `<div class="section__tools"><div class="viewtoggle" id="read-view" role="group" aria-label="Cómo verlo">` +
      `<button class="vtbtn${readView === 'list' ? ' is-on' : ''}" data-rview="list" title="Lista">${icon('view_list')}</button>` +
      `<button class="vtbtn${readView === 'grid' ? ' is-on' : ''}" data-rview="grid" title="Grilla">${icon('grid_view')}</button></div>` +
      `<button class="btn btn--soft" id="read-add">${icon('add_circle')} Agregar libro</button></div></div>` +
      `<div class="read-ownerbar" id="read-ownerbar"><button class="read-owner${readOwner === 'all' ? ' is-on' : ''}" data-owner="all">${icon('groups')} Todos</button>` +
      Object.values(users).map((u) => `<button class="read-owner${readOwner === u.id ? ' is-on' : ''}" data-owner="${u.id}">${avatarHTML(u, 'avatar read-owner__av')}${escapeHtml(u.name)}</button>`).join('') +
      `</div><div id="read-results"></div>`;
    const fill = () => {
      const wrap = s.querySelector('#read-results');
      const read = readByOwner();
      wrap.innerHTML = '';
      if (!read.length) {
        wrap.innerHTML = `<div class="empty">${icon('menu_book')}<p>No hay libros leídos con este filtro.<br>Abrí uno y marcá <b>Terminado</b> o puntuá con estrellas.</p></div>`;
        return;
      }
      const grid = document.createElement('div');
      grid.className = readView === 'grid' ? 'read-grid' : 'grid read-list';
      if (readView === 'list') grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))';
      read.forEach((b) => grid.appendChild(readView === 'grid' ? readGridCell(b) : readCard(b)));
      wrap.appendChild(grid);
    };
    s.querySelector('#read-ownerbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-owner]'); if (!b || b.dataset.owner === readOwner) return;
      K.motion.run(() => {
        readOwner = b.dataset.owner;
        s.querySelectorAll('.read-owner').forEach((x) => x.classList.toggle('is-on', x.dataset.owner === readOwner));
        fill();
      }, { kind: 'shared', target: s.querySelector('#read-results') });
    });
    s.querySelector('#read-view').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rview]'); if (!b || b.dataset.rview === readView) return;
      K.motion.run(() => {
        readView = b.dataset.rview;
        s.querySelectorAll('.vtbtn').forEach((x) => x.classList.toggle('is-on', x.dataset.rview === readView));
        fill();
      }, { kind: 'shared', target: s.querySelector('#read-results') });
    });
    s.querySelector('#read-add').addEventListener('click', () => { if (!guestBlock()) openAddBook((b) => { closeAddBook(); openSheet(b); }); });
    fill();
    return s;
  }

  function latestReviews() {
    const out = [];
    Object.values(users).forEach((u) => books.forEach((b) => {
      const v = verdictOf(b.id, u.id);
      if (!(v.review || '').trim()) return;
      const finishedAt = store.getReading(b.id, u.id).finishedAt || '';
      const updatedAt = store.get(b.id, u.id).updatedAt || '';
      const timestamp = Date.parse(finishedAt ? `${finishedAt}T23:59:59` : updatedAt) || 0;
      out.push({ b, u, v, finishedAt, timestamp });
    }));
    return out.sort((a, b) => b.timestamp - a.timestamp);
  }

  function buildLatestReviews() {
    const section = document.createElement('section');
    section.className = 'section home-reviews';
    section.innerHTML =
      `<div class="section__head"><div><h3 class="section__title"><span class="accentbar">/</span> Últimas reseñas</h3>` +
      `<p class="section__sub">Lo último que estuvieron leyendo y comentando.</p></div></div>` +
      `<div class="home-reviews__grid"></div><div class="home-reviews__more"></div>`;
    const reviews = latestReviews();
    const grid = section.querySelector('.home-reviews__grid');
    const more = section.querySelector('.home-reviews__more');
    let visible = 4;
    const draw = () => {
      grid.innerHTML = '';
      if (!reviews.length) {
        grid.innerHTML = `<div class="empty home-reviews__empty">${icon('rate_review')}<p>Todavía no hay reseñas para mostrar.</p></div>`;
        more.innerHTML = '';
        return;
      }
      reviews.slice(0, visible).forEach(({ b, u, v, finishedAt }) => {
        const card = document.createElement('article');
        card.className = 'home-review';
        card.innerHTML =
          `<button class="home-review__poster" data-open-review aria-label="Abrir reseña de ${escapeHtml(b.title)}" style="background:${coverArt(b)}"></button>` +
          `<div class="home-review__body"><div class="home-review__by">${avatarHTML(u, 'avatar home-review__avatar')}` +
          `<span>${profileLink(u.id, u.name)}<small>${finishedAt ? fmtDate(finishedAt) : 'Sin fecha cargada'}</small></span></div>` +
          `<button class="home-review__copy" data-open-review><b>${escapeHtml(b.title)}</b>` +
          `<span class="home-review__stars">${starsMarkup(v.rating || 0, 'sm')}${v.rating != null ? `<strong>${v.rating.toFixed(1)}</strong>` : ''}</span>` +
          `<q>${escapeHtml(v.review)}</q></button></div>`;
        card.querySelectorAll('[data-open-review]').forEach((button) => button.addEventListener('click', () => openSheet(b, { mode: 'review', reviewUserId: u.id })));
        grid.appendChild(K.motion.tag(card, `prb-home-review-${u.id}-${b.id}`));
      });
      more.innerHTML = visible < reviews.length
        ? `<button class="btn btn--soft" data-more-reviews>${icon('expand_more')} Ver más reseñas</button>`
        : '';
      const button = more.querySelector('[data-more-reviews]');
      if (button) button.addEventListener('click', () => K.motion.run(() => {
        visible = Math.min(reviews.length, visible + 4);
        draw();
      }, { kind: 'shared', target: grid }));
    };
    draw();
    return section;
  }
  function readGridCell(b) {
    const card = document.createElement('button'); card.className = 'readcell';
    K.motion.tag(card, `prb-read-${b.id}`);
    const people = (readOwner === 'all' ? Object.values(users) : [users[readOwner]]).filter(Boolean);
    const scores = people.map((u) => {
      const v = verdictOf(b.id, u.id);
      if (v.rating == null) return '';
      return `<span class="readcell__score">${avatarHTML(u, 'avatar readcell__av')}<b>${v.rating.toFixed(1)}</b>${icon('star')}</span>`;
    }).join('');
    card.innerHTML =
      `<span class="readcell__cover" style="background:${coverArt(b)}"></span>` +
      `<span class="readcell__body"><b>${escapeHtml(b.title)}</b><small>${escapeHtml(b.author || '')}${b.year ? ` · ${b.year}` : ''}</small>` +
      `<span class="readcell__scores">${scores || '<span class="readcell__done">Terminado</span>'}</span></span>`;
    card.addEventListener('click', () => openSheet(b));
    return card;
  }
  function readCard(b) {
    const card = document.createElement('article'); card.className = 'watched'; card.style.cursor = 'pointer';
    K.motion.tag(card, `prb-read-${b.id}`);
    const verdicts = Object.values(users).map((u) => {
      const e = verdictOf(b.id, u.id); const rated = typeof e.rating === 'number'; const read = store.getReading(b.id, u.id).status === 'read'; if (!(rated || e.review || e.liked || read)) return '';
      const stars = rated ? `${starsMarkup(e.rating, 'sm')}<span class="stars-value">${e.rating.toFixed(1)}</span>` : `<span class="verdict__none">sin puntaje</span>`;
      const heart = e.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '';
      const review = e.review ? `<button type="button" class="verdict__review verdict__review--open" data-review-book="${escapeHtml(b.id)}" data-review-user="${escapeHtml(u.id)}">“${escapeHtml(e.review)}”</button>` : '';
      return `<div class="verdict">${avatarHTML(u, 'avatar verdict__avatar')}<div class="verdict__main"><div class="verdict__row">${profileLink(u.id, u.name, 'verdict__name')}${stars}${heart}</div>${review}${readingLine(b, u.id)}</div></div>`;
    }).join('');
    card.innerHTML = `<div class="watched__poster"><div class="poster__img" style="background:${coverArt(b)}"></div></div><div class="watched__body"><div class="watched__title">${escapeHtml(b.title)}</div><div class="watched__year">${[b.year, b.author].filter(Boolean).join(' · ')}</div><div class="verdicts">${verdicts}</div></div>`;
    card.addEventListener('click', () => openSheet(b));
    return card;
  }

  /* ---------- Selectos (priority list) ---------- */
  let wlQuery = '';
  let selectosView = 'list';   // 'list' | 'grid'
  function orderedBooks() { const pos = new Map(store.getOrder().map((id, i) => [id, i])); return books.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : Infinity) - (pos.has(b.id) ? pos.get(b.id) : Infinity)); }
  function viewToggleHTML() {
    return `<div class="viewtoggle" id="view-toggle" role="group" aria-label="Cómo verlo">` +
      `<button class="vtbtn${selectosView === 'list' ? ' is-on' : ''}" data-view="list" title="Lista">${icon('view_list')}</button>` +
      `<button class="vtbtn${selectosView === 'grid' ? ' is-on' : ''}" data-view="grid" title="Grilla">${icon('grid_view')}</button></div>`;
  }
  function renderSelectos(app) {
    app.innerHTML = '';
    const s = document.createElement('section'); s.className = 'section'; s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    s.innerHTML =
      `<div class="section__head section__head--search"><div><h3 class="section__title">Selectos</h3><p class="section__sub">Nuestra selección · ${books.length} libros · ordenala por prioridad</p></div>` +
      `<div class="section__tools">${viewToggleHTML()}<label class="search"><span class="material-symbols-rounded">search</span><input id="wl-search" type="search" placeholder="Buscar libro o autor…" value="${escapeHtml(wlQuery)}"></label></div></div>` +
      `<p class="plist__hint" id="pl-hint"></p><div class="plist" id="plist"></div>`;
    app.appendChild(s); app.appendChild(buildFooter());
    s.querySelector('#wl-search').addEventListener('input', (e) => { wlQuery = e.target.value; fillPlist(); });
    s.querySelector('#view-toggle').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]'); if (!b || b.dataset.view === selectosView) return;
      K.motion.run(() => {
        selectosView = b.dataset.view;
        s.querySelectorAll('.vtbtn').forEach((x) => x.classList.toggle('is-on', x.dataset.view === selectosView));
        fillPlist();
      }, { kind: 'shared', target: s.querySelector('#plist') });
    });
    enableReorder(s.querySelector('#plist')); fillPlist();
  }
  function fillPlist() {
    const plist = document.getElementById('plist'); if (!plist) return; plist.innerHTML = '';
    const hint = document.getElementById('pl-hint');
    const full = orderedBooks(); const rankOf = new Map(full.map((b, i) => [b.id, i + 1]));
    const q = wlQuery.trim().toLowerCase();
    const list = q ? full.filter((b) => b.title.toLowerCase().includes(q) || (b.author || '').toLowerCase().includes(q)) : full;
    plist.classList.toggle('plist--grid', selectosView === 'grid');
    if (hint) hint.innerHTML = selectosView === 'grid'
      ? `${icon('grid_view')} En orden de prioridad. Para reordenar, cambiá a vista lista.`
      : `${icon('drag_indicator')} Arrastrá para ordenar, o tocá el número y escribí la posición.`;
    if (!list.length) { plist.innerHTML = `<div class="empty">${icon('search_off')}<p>Nada con “${escapeHtml(wlQuery)}”.</p></div>`; return; }
    if (selectosView === 'grid') { list.forEach((b) => plist.appendChild(plGridCell(b, rankOf.get(b.id)))); return; }
    list.forEach((b) => plist.appendChild(plRow(b, rankOf.get(b.id), full.length)));
  }
  function plGridCell(b, rank) {
    const cell = document.createElement('button'); cell.className = 'plcell'; cell.dataset.id = b.id; cell.title = `${rank}. ${b.title}`;
    K.motion.tag(cell, `prb-selectos-${b.id}`);
    cell.innerHTML = `<span class="plcell__rank">${rank}</span><div class="plcell__img" style="background:${coverArt(b)}"></div><span class="plcell__t">${escapeHtml(b.title)}</span>`;
    cell.addEventListener('click', () => openSheet(b));
    return cell;
  }
  function setPriority(id, newPos) {
    if (guestBlock()) return;
    const cur = orderedBooks().map((b) => b.id); const from = cur.indexOf(id); if (from < 0) return;
    cur.splice(from, 1); const to = Math.max(0, Math.min(cur.length, (parseInt(newPos, 10) || 1) - 1)); cur.splice(to, 0, id);
    store.setOrder(cur); fillPlist();
  }
  function plRow(b, rank, total) {
    const row = document.createElement('div'); row.className = 'plitem'; row.draggable = true; row.dataset.id = b.id;
    K.motion.tag(row, `prb-selectos-${b.id}`);
    row.innerHTML = `<input class="plitem__rankin" type="number" min="1" max="${total}" value="${rank}" aria-label="Prioridad">` +
      `<div class="plitem__poster"><div class="chip__img" style="background:${coverArt(b)}"></div></div>` +
      `<div class="plitem__body"><div class="plitem__title">${escapeHtml(b.title)}</div><div class="plitem__meta"><span>${b.author || ''}</span><span>${b.year || ''}</span></div></div>` +
      `<div class="plitem__handle">${icon('drag_indicator')}</div>`;
    const input = row.querySelector('.plitem__rankin');
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    input.addEventListener('change', () => setPriority(b.id, input.value));
    row.addEventListener('click', (e) => { if (e.target === input || row.dataset.dragged) return; openSheet(b); });
    return row;
  }
  function enableReorder(container) {
    let dragEl = null;
    container.addEventListener('dragstart', (e) => { if (wlQuery.trim()) { e.preventDefault(); return; } const it = e.target.closest('.plitem'); if (!it) return; dragEl = it; it.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', it.dataset.id); } catch {} });
    container.addEventListener('dragover', (e) => { if (!dragEl) return; e.preventDefault(); const after = dragAfter(container, e.clientY); if (after == null) container.appendChild(dragEl); else container.insertBefore(dragEl, after); });
    container.addEventListener('dragend', () => { if (!dragEl) return; dragEl.classList.remove('dragging'); dragEl.dataset.dragged = '1'; const el = dragEl; setTimeout(() => delete el.dataset.dragged, 60); dragEl = null; if (guestBlock()) return fillPlist(); const rows = [...container.querySelectorAll('.plitem')]; store.setOrder(rows.map((n) => n.dataset.id)); rows.forEach((n, i) => { const inp = n.querySelector('.plitem__rankin'); if (inp) inp.value = i + 1; }); });
  }
  function dragAfter(container, y) { const els = [...container.querySelectorAll('.plitem:not(.dragging)')]; return els.reduce((c, ch) => { const box = ch.getBoundingClientRect(); const off = y - box.top - box.height / 2; return off < 0 && off > c.offset ? { offset: off, element: ch } : c; }, { offset: -Infinity, element: null }).element; }

  function renderLeidos(app) { app.innerHTML = ''; const s = buildRead('Leídos'); s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)'; app.appendChild(s); app.appendChild(buildFooter()); }

  /* ---------- Leyendo (in progress) ---------- */
  let leyendoView = 'list';
  function renderLeyendo(app) {
    app.innerHTML = '';
    const s = document.createElement('section'); s.className = 'section'; s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    const list = readingBooks();
    s.innerHTML = `<div class="section__head section__head--search"><div><h3 class="section__title">Leyendo</h3><p class="section__sub">Lo que tenemos en curso · marcá por dónde vas</p></div>` +
      `<div class="section__tools"><div class="viewtoggle" id="ly-view" role="group" aria-label="Cómo verlo">` +
      `<button class="vtbtn${leyendoView === 'list' ? ' is-on' : ''}" data-view="list" title="Lista">${icon('view_list')}</button>` +
      `<button class="vtbtn${leyendoView === 'grid' ? ' is-on' : ''}" data-view="grid" title="Grilla">${icon('grid_view')}</button></div>` +
      `<button class="btn btn--soft" id="ly-add">${icon('add_circle')} Agregar libro</button></div></div>`;
    if (!list.length) {
      const e = document.createElement('div'); e.className = 'empty';
      e.innerHTML = `${icon('auto_stories')}<p>No hay libros en curso.<br>Abrí un libro y tocá <b>Empecé a leer</b>, o agregá uno.</p>`;
      s.appendChild(e);
    } else if (leyendoView === 'grid') {
      const g = document.createElement('div'); g.className = 'reading-gallery';
      list.forEach((b) => g.appendChild(readingGridCell(b)));
      s.appendChild(g);
    } else {
      const wrap = document.createElement('div'); wrap.className = 'reading-list';
      list.forEach((b) => wrap.appendChild(readingCard(b)));
      s.appendChild(wrap);
    }
    app.appendChild(s); app.appendChild(buildFooter());
    s.querySelector('#ly-view').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]'); if (!b || b.dataset.view === leyendoView) return;
      K.motion.run(() => {
        leyendoView = b.dataset.view;
        renderLeyendo(document.getElementById('app'));
      }, { kind: 'shared', target: document.getElementById('app') });
    });
    s.querySelector('#ly-add').addEventListener('click', () => { if (!guestBlock()) openAddBook((b) => {
      // Adding from "Leyendo" should actually put the book in Leyendo, not just in the library.
      const u = currentUser();
      const cur = store.getReading(b.id, u.id);
      store.setReading(b.id, u.id, { status: 'reading', startedAt: cur.startedAt || todayISO() });
      closeAddBook(); renderLeyendo(document.getElementById('app')); openSheet(b);
    }, { allowExisting: true }); });
  }
  function readingCard(b) {
    const u = currentUser();
    const r = store.getReading(b.id, u.id);
    const other = Object.values(users).find((x) => x.id !== u.id);
    const ro = other ? store.getReading(b.id, other.id) : null;
    const meReading = r.status === 'reading';
    const card = document.createElement('article'); card.className = 'reading';
    K.motion.tag(card, `prb-reading-${b.id}`);
    const p = readingPercent(r);
    const statLine = (rr) => `${readingPercent(rr) != null ? `<b>${readingPercent(rr)}%</b>` : '<b>—</b>'}${rr.chapter ? ` · cap. ${escapeHtml(rr.chapter)}` : ''}${rr.page != null && rr.pageTotal != null ? ` · pág. ${rr.page}/${rr.pageTotal}` : ''}<span class="reading__since">${rr.startedAt ? `desde ${fmtDate(rr.startedAt)}` : 'sin fecha de inicio'}</span>`;
    let ctrls;
    if (meReading) {
      ctrls =
        `<div class="reading__bar"><span class="reading__fill" style="width:${p != null ? p : 0}%"></span></div>` +
        `<div class="reading__stat" data-rc-stat>${statLine(r)}</div>` +
        `<div class="reading__ctrls">` +
        `<label class="reading__in">pág.<input type="number" min="0" data-rc="page" value="${r.page != null ? r.page : ''}" placeholder="—"></label>` +
        `<span class="reading__of">de</span>` +
        `<label class="reading__in"><input type="number" min="1" data-rc="pageTotal" value="${r.pageTotal != null ? r.pageTotal : ''}" placeholder="—"></label>` +
        `<label class="reading__in reading__in--cap">cap.<input type="text" data-rc="chapter" value="${r.chapter ? escapeHtml(r.chapter) : ''}" placeholder="—"></label>` +
        `<button class="btn btn--accent reading__done" data-rc-done>${icon('task_alt')} Lo terminé</button></div>`;
    } else {
      ctrls = `<button class="btn btn--soft reading__start" data-rc-start>${icon('auto_stories')} Lo estoy leyendo yo también</button>`;
    }
    const otherChip = (ro && ro.status === 'reading') ? `<div class="reading__other">${avatarHTML(other, 'avatar reading__oavatar')}<span>${profileLink(other.id, other.name)} va ${readingPercent(ro) != null ? readingPercent(ro) + '%' : '—'}${ro.chapter ? ` · cap. ${escapeHtml(ro.chapter)}` : ''}</span></div>` : '';
    card.innerHTML =
      `<div class="reading__poster" data-open><div class="poster__img" style="background:${coverArt(b)}"></div></div>` +
      `<div class="reading__body">` +
      `<div class="reading__title" data-open>${escapeHtml(b.title)}</div>` +
      `<div class="reading__meta">${[b.author, b.year].filter(Boolean).join(' · ')}</div>` +
      ctrls + otherChip +
      `</div>`;
    const save = () => {
      const page = card.querySelector('[data-rc="page"]').value;
      const total = card.querySelector('[data-rc="pageTotal"]').value;
      const chap = card.querySelector('[data-rc="chapter"]').value.trim();
      if (guestBlock()) return;
      store.setReading(b.id, u.id, { page: page === '' ? null : +page, pageTotal: total === '' ? null : +total, chapter: chap || null });
      const r2 = store.getReading(b.id, u.id);
      card.querySelector('.reading__fill').style.width = (readingPercent(r2) != null ? readingPercent(r2) : 0) + '%';
      card.querySelector('[data-rc-stat]').innerHTML = statLine(r2);
    };
    card.querySelectorAll('[data-rc]').forEach((i) => i.addEventListener('change', save));
    const done = card.querySelector('[data-rc-done]'); if (done) done.addEventListener('click', () => { if (guestBlock()) return; store.setReading(b.id, u.id, { status: 'read', finishedAt: store.getReading(b.id, u.id).finishedAt || todayISO() }); renderLeyendo(document.getElementById('app')); });
    const start = card.querySelector('[data-rc-start]'); if (start) start.addEventListener('click', () => { if (guestBlock()) return; store.setReading(b.id, u.id, { status: 'reading', startedAt: store.getReading(b.id, u.id).startedAt || todayISO() }); renderLeyendo(document.getElementById('app')); });
    card.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => openSheet(b)));
    return card;
  }
  // Grid cell: the cover "fills in" from the bottom up as you read; % on top.
  function readingGridCell(b) {
    const u = currentUser();
    let r = store.getReading(b.id, u.id); let who = u;
    if (r.status !== 'reading') { const o = Object.values(users).find((x) => store.getReading(b.id, x.id).status === 'reading'); if (o) { who = o; r = store.getReading(b.id, o.id); } }
    const p = readingPercent(r) || 0;
    const cell = document.createElement('button'); cell.className = 'rgcell'; cell.title = `${b.title} — ${p}%`;
    K.motion.tag(cell, `prb-reading-${b.id}`);
    cell.innerHTML =
      `<div class="rgcell__cover">` +
      `<div class="rgcell__dim" style="background:${coverArt(b)}"></div>` +
      `<div class="rgcell__fill" style="background:${coverArt(b)};clip-path:inset(${100 - p}% 0 0 0)"></div>` +
      `<span class="rgcell__pct">${p}%</span>` +
      (who.id !== u.id ? avatarHTML(who, 'avatar rgcell__avatar') : '') +
      `</div><span class="rgcell__t">${escapeHtml(b.title)}</span>`;
    cell.addEventListener('click', () => openSheet(b));
    return cell;
  }

  /* ---------- book card ---------- */
  function bookCard(b) {
    const card = document.createElement('button'); card.className = 'card';
    card.innerHTML = `<div class="poster"><div class="poster__img" style="background:${coverArt(b)}"></div><div class="poster__label"><span class="t">${escapeHtml(b.title)}</span><span class="y">${b.author || ''}${b.year ? ` · ${b.year}` : ''}</span></div></div>`;
    card.addEventListener('click', () => openSheet(b));
    return card;
  }

  /* ============================================================= TIER */
  const TIER_DEFAULTS = [
    { id: 'prime', label: 'PRIME', sub: 'lo mejor' },
    { id: 'buena', label: 'Muy bueno', sub: '' },
    { id: 'nifu', label: 'Buena', sub: '' },
    { id: 'meh', label: 'Ni fu ni fa', sub: 'del montón' },
    { id: 'basura', label: 'Basura', sub: 'ni ahí' },
  ];
  const TIER_RAMP = ['#22D3EE', '#3D7BFF', '#8B7BFF', '#B06BE0', '#FF4D6D'];
  const rowsOf = (B) => K.tierRows(store, B.id, TIER_DEFAULTS, TIER_RAMP);
  const rawRowsOf = (B) => store.getTierRows(B.id) || TIER_DEFAULTS.map((d) => ({ id: d.id, label: d.label, sub: d.sub || '', color: null }));
  /* ---------- tier boards (default per-user + custom/shared lists) ---------- */
  let tierBoardId = null;
  function currentBoards() {
    const me = currentUser();
    const others = Object.values(users).filter((x) => x.id !== me.id);
    const list = [];
    if (!me.guest) list.push({ id: 'def:' + me.id, type: 'default', kind: 'personal', owner: me.id, members: [me.id], name: 'Mi tier', editable: true });
    others.forEach((o) => list.push({ id: 'def:' + o.id, type: 'default', kind: 'personal', owner: o.id, members: [o.id], name: 'Tier de ' + o.name, editable: false }));
    store.getTierlists().forEach((l) => {
      const members = l.kind === 'shared' ? (Array.isArray(l.members) && l.members.length ? l.members : Object.values(users).map((u) => u.id)) : [l.owner];
      list.push({ id: l.id, type: 'custom', kind: l.kind, owner: l.owner || null, members, name: l.name, editable: !me.guest && members.includes(me.id) });
    });
    return list;
  }
  function userThumb(uid) { const p = photoOf(uid); return p ? `#060c18 url(${p}) center/cover` : ((users[uid] || {}).color || 'var(--surface-2)'); }
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
  function userHasRead(b, uid) {
    const v = verdictOf(b.id, uid);
    return v.rating != null || v.review || v.liked || store.getReading(b.id, uid).status === 'read';
  }
  function boardEligible(B) {
    const placed = (b) => boardGet(B, b.id);
    if (B.kind === 'shared') {
      const mem = B.members || Object.values(users).map((u) => u.id);
      return books.filter((b) => mem.some((uid) => userHasRead(b, uid)) || placed(b));
    }
    return books.filter((b) => userHasRead(b, B.owner) || placed(b));
  }
  const ownerName = (uid) => (users[uid] || {}).name || '';
  function renderTier(app) {
    const me = currentUser();
    const boards = currentBoards();
    let B = boards.find((b) => b.id === tierBoardId) || boards[0];
    tierBoardId = B.id;
    app.innerHTML = '';
    const s = document.createElement('section'); s.className = 'section'; s.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
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
      `<button class="btn btn--soft btn--xs tl-share" id="tl-share">${icon('ios_share')} Compartir</button></div>` +
      (B.editable ? `<p class="tier-hint">${icon('touch_app')} ${isTouch() ? 'Tocá un tier para elegir qué libro poner; tocá uno puesto para moverlo.' : 'Arrastrá los libros al tier que merezcan (o tocá uno para moverlo).'}</p>` : '') +
      `<div class="tier-board" id="tier-board">${rows.map((t, i) =>
        (i ? `<button class="tier-insert" data-tier-insert="${i}" aria-label="Agregar una fila entre ${escapeHtml(rows[i - 1].label)} y ${escapeHtml(t.label)}">${icon('add')}</button>` : '') +
        `<div class="tier"><button class="tier__label${B.editable ? ' tier__label--editable' : ''}" data-tier-row="${escapeHtml(t.id)}" style="--c:${t.color}"${B.editable ? ` title="Editar nombre y color de ${escapeHtml(t.label)}"` : ' disabled'}><b>${escapeHtml(t.label)}</b>${t.sub ? `<small>${escapeHtml(t.sub)}</small>` : ''}</button><div class="tier__drop" data-tier="${escapeHtml(t.id)}"></div></div>`
      ).join('')}</div>` +
      `<div class="tier-pool"><div class="tier-pool__head">Sin ubicar <span class="tier-pool__note">— ${B.kind === 'shared' ? 'lo que leyó cualquiera de los miembros' : (B.editable ? 'solo los libros que leíste' : `solo lo que leyó ${ownerName(B.owner)}`)}</span></div><div class="tier-pool__drop" id="tier-pool" data-tier=""></div></div>` +
      (B.editable ? `<div class="tier-add"><button class="btn btn--soft" id="tier-add-btn">${icon('add_circle')} Agregar libro</button></div>` : '');
    app.appendChild(s); app.appendChild(buildFooter());
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
    if (B.editable) s.querySelector('#tier-add-btn').addEventListener('click', () => { if (!guestBlock()) openAddBook(() => { closeAddBook(); fillTier(B); }); });
    if (B.editable && isTouch()) {
      s.querySelectorAll('.tier__drop').forEach((drop) => drop.addEventListener('click', (e) => { if (e.target.closest('.chip')) return; openTierPicker(drop.dataset.tier, B); }));
      s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip) openChipMenu(chip.dataset.id, B); });
    } else { s.addEventListener('click', (e) => { const chip = e.target.closest('.chip'); if (chip && !chip.classList.contains('dragging')) { const b = byId(chip.dataset.id); if (b) openSheet(b); } }); }
    fillTier(B);
    if (B.editable && !isTouch()) enableTierDnD(B);
  }
  function beginInlineTierEdit(app, B, label) {
    if (label.classList.contains('is-editing') || guestBlock()) return;
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
      store.saveTierRows(B.id, rows); renderTier(app);
    };
    picker.addEventListener('input', () => { color = picker.value; colorTouched = true; label.style.setProperty('--c', color); label.querySelector('.tier-inline__color span').style.setProperty('--row-color', color); });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); renderTier(app); } });
    done.addEventListener('click', (e) => { e.stopPropagation(); save(); });
    done.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(); } });
    setTimeout(() => { name.focus(); name.select(); }, 20);
  }
  function insertTierRow(app, B, index) {
    if (guestBlock()) return;
    const rows = rawRowsOf(B);
    const id = 'row-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    rows.splice(index, 0, { id, label: 'Nueva fila', sub: '', color: null });
    store.saveTierRows(B.id, rows); renderTier(app);
    setTimeout(() => { const label = document.querySelector(`[data-tier-row="${id}"]`); if (label) beginInlineTierEdit(app, B, label); }, 30);
  }
  function openRowsEditor(app, B) {
    if (guestBlock()) return;
    K.openRowEditor({
      host: $('#confirm'), boardName: B.name, ramp: TIER_RAMP,
      rows: rawRowsOf(B).map((r) => ({ ...r, rawColor: r.color || null })),
      onReset: () => { store.clearTierRows(B.id); renderTier(app); },
      onSave: (rows, gone) => {
        store.saveTierRows(B.id, rows);
        if (gone.length) boardEligible(B).forEach((b) => { if (gone.includes(boardGet(B, b.id))) boardSet(B, b.id, null); });
        renderTier(app);
      },
    });
  }
  function shareTier(B) {
    const rows = rowsOf(B);
    const title = B.name;
    const subtitle = B.type === 'default' ? 'Ranking personal' : (B.kind === 'shared' ? `Compartida · ${B.members.map(ownerName).join(' y ')}` : `Personal · ${ownerName(B.owner)}`);
    K.openShareBoard($('#confirm'), () => {
      const byRow = {};
      rows.forEach((r) => (byRow[r.id] = []));
      boardEligible(B).forEach((b) => { const t = boardGet(B, b.id); if (t && byRow[t]) byRow[t].push({ title: b.title, img: b.cover || null }); });
      return {
        brand: 'PRB', title, subtitle,
        bg: '#060c18', ink: '#eff8ff', accent: '#22D3EE',
        rows: rows.map((r) => ({ label: r.label, color: r.color, items: byRow[r.id] })),
        fileName: 'prb-' + title,
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
      `<label class="tl-field"><span>Nombre</span><input id="tl-name" type="text" maxlength="40" placeholder="Ej: Ciencia ficción, Favoritos…" value="${editing ? escapeHtml(B.name) : ''}"></label>` +
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
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">¿Borrar “${escapeHtml(B.name)}”?</div><p class="confirm__text">Se pierde el armado de esta tier list. Los puntajes de los libros no se tocan.</p><div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="tl-delok">${icon('delete')} Borrar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#tl-delok').addEventListener('click', () => { store.saveTierlists(store.getTierlists().filter((l) => l.id !== B.id)); store.clearListData(B.id); tierBoardId = null; el.hidden = true; renderTier(app); });
  }
  function tierChip(b, draggable) { const c = document.createElement('div'); c.className = 'chip' + (draggable ? '' : ' chip--ro'); c.draggable = !!draggable; c.dataset.id = b.id; c.title = b.title; c.innerHTML = `<div class="chip__img" style="background:${coverArt(b)}"></div><div class="chip__t">${escapeHtml(b.title)}</div>`; return c; }
  function fillTier(B) {
    const draggable = B.editable;
    document.querySelectorAll('.tier__drop, #tier-pool').forEach((d) => (d.innerHTML = ''));
    boardEligible(B).forEach((b) => { const t = boardGet(B, b.id); const target = t ? document.querySelector(`.tier__drop[data-tier="${t}"]`) : document.querySelector('#tier-pool'); if (target) target.appendChild(tierChip(b, draggable)); });
    const pool = document.querySelector('#tier-pool'); if (pool && !pool.children.length) pool.innerHTML = `<p class="tier-pool__empty">${draggable ? 'Puntuá un libro y va a aparecer acá para ubicarlo.' : 'Sin libros para mostrar.'}</p>`;
  }
  function enableTierDnD(B) {
    let dragId = null; const section = document.querySelector('#tier-board').closest('.section');
    section.addEventListener('dragstart', (e) => { const chip = e.target.closest('.chip'); if (!chip) return; dragId = chip.dataset.id; chip.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch {} });
    section.addEventListener('dragend', (e) => { const chip = e.target.closest('.chip'); if (chip) chip.classList.remove('dragging'); dragId = null; document.querySelectorAll('.drag-over').forEach((d) => d.classList.remove('drag-over')); });
    [...document.querySelectorAll('.tier__drop'), document.querySelector('#tier-pool')].forEach((drop) => {
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drag-over'); const id = dragId || (e.dataTransfer && e.dataTransfer.getData('text/plain')); if (!id) return; boardSet(B, id, drop.dataset.tier || null); fillTier(B); });
    });
  }

  /* ---------- mobile pick-sheet ---------- */
  const isTouch = () => window.matchMedia('(max-width: 900px)').matches || window.matchMedia('(pointer: coarse)').matches;
  function openPickSheet(title, itemsFn) {
    let el = document.getElementById('picksheet'); if (!el) { el = document.createElement('div'); el.id = 'picksheet'; el.className = 'picksheet'; document.body.appendChild(el); }
    const render = () => {
      const items = itemsFn();
      el.innerHTML = `<div class="picksheet__scrim" data-pclose></div><div class="picksheet__panel"><div class="picksheet__head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" data-pclose>${icon('close')}</button></div><div class="picksheet__list">` +
        (items.length ? items.map((it, i) => `<button class="pickrow" data-i="${i}">${it.thumb ? `<span class="pickrow__thumb" style="background:${it.thumb}"></span>` : `<span class="pickrow__ic material-symbols-rounded"${it.color ? ` style="color:${it.color}"` : ''}>${it.icon || 'label'}</span>`}<span class="pickrow__label">${escapeHtml(it.label)}</span>${it.check ? `<span class="pickrow__check material-symbols-rounded">check</span>` : ''}</button>`).join('') : `<p class="addfilm__hint">Nada para elegir. Puntuá un libro primero.</p>`) +
        `</div></div>`;
      el.querySelectorAll('[data-pclose]').forEach((b) => b.addEventListener('click', closePickSheet));
      el.querySelectorAll('.pickrow').forEach((b) => b.addEventListener('click', () => { const it = itemsFn()[+b.dataset.i]; if (it && it.onClick) it.onClick(render); }));
    };
    render(); el.hidden = false; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', onPickKey);
  }
  function onPickKey(e) { if (e.key === 'Escape') closePickSheet(); }
  function closePickSheet() { const el = document.getElementById('picksheet'); if (el) { el.innerHTML = ''; el.hidden = true; } document.body.style.overflow = ''; document.removeEventListener('keydown', onPickKey); }

  /* ---------- add-book live search (Open Library) ---------- */
  function openAddBook(onAdded, options = {}) {
    let el = document.getElementById('addbook'); if (!el) { el = document.createElement('div'); el.id = 'addbook'; el.className = 'addfilm'; document.body.appendChild(el); }
    el.innerHTML = `<div class="addfilm__scrim" data-aclose></div><div class="addfilm__panel"><div class="addfilm__head"><h3>Agregar libro</h3><button class="icon-btn" data-aclose aria-label="Cerrar">${icon('close')}</button></div><label class="search search--lg"><span class="material-symbols-rounded">search</span><input id="ab-input" type="search" placeholder="Buscar libro o autor…" autocomplete="off"></label><div class="addfilm__results" id="ab-results"><p class="addfilm__hint">Escribí un título para buscar.</p></div></div>`;
    el.hidden = false; document.body.style.overflow = 'hidden';
    const input = el.querySelector('#ab-input'), results = el.querySelector('#ab-results'); let t;
    input.addEventListener('input', () => {
      clearTimeout(t); const q = input.value.trim();
      if (q.length < 2) { results.innerHTML = `<p class="addfilm__hint">Escribí al menos 2 letras…</p>`; return; }
      results.innerHTML = `<p class="addfilm__hint">Buscando…</p>`;
      t = setTimeout(async () => {
        try {
          const list = await PRB.api.search(q);
          if (!list.length) { results.innerHTML = `<p class="addfilm__hint">Sin resultados.</p>`; return; }
          results.innerHTML = '';
          list.forEach((it) => {
            const existing = books.find((b) => b.id === PRB.bookId(it.key));
            // allowExisting (used by "Leyendo") lets you pick a book already in the library
            // so it can be marked as reading, instead of showing it as a done/disabled result.
            const locked = existing && !options.allowExisting;
            const card = document.createElement('button'); card.className = 'af-res'; if (locked) card.disabled = true;
            card.innerHTML = `<div class="af-res__poster" style="background:${it.cover ? `#060c18 url(${it.cover}) center/cover` : 'var(--surface-2)'}"></div><div class="af-res__body"><div class="af-res__title">${escapeHtml(it.title)}</div><div class="af-res__meta">${escapeHtml(it.author || '')}${it.year ? ` · ${it.year}` : ''}</div></div><span class="af-res__add material-symbols-rounded">${locked ? 'check_circle' : 'add_circle'}</span>`;
            card.addEventListener('click', async () => {
              if (card.disabled) return;
              if (existing) { if (onAdded) onAdded(existing); return; } // already in library — just hand it back
              card.disabled = true; card.querySelector('.af-res__add').textContent = 'hourglass_top';
              try { const book = await PRB.api.add(it); addExtraBook(book); card.querySelector('.af-res__add').textContent = 'check_circle'; if (onAdded) onAdded(book); }
              catch { card.disabled = false; card.querySelector('.af-res__add').textContent = 'error'; }
            });
            results.appendChild(card);
          });
        } catch { results.innerHTML = `<p class="addfilm__hint">Error al buscar. Probá de nuevo.</p>`; }
      }, 350);
    });
    el.querySelectorAll('[data-aclose]').forEach((b) => b.addEventListener('click', closeAddBook));
    document.addEventListener('keydown', onAddBookKey); setTimeout(() => input.focus(), 60);
  }
  function onAddBookKey(e) { if (e.key === 'Escape') closeAddBook(); }
  function closeAddBook() { const el = document.getElementById('addbook'); if (el) { el.innerHTML = ''; el.hidden = true; } document.body.style.overflow = ''; document.removeEventListener('keydown', onAddBookKey); }
  function openTierPicker(tierId, B) {
    const label = (rowsOf(B).find((t) => t.id === tierId) || {}).label || '';
    openPickSheet(`Poné en ${label}`, () => boardEligible(B).filter((b) => (boardGet(B, b.id) || null) !== tierId).map((b) => ({ thumb: coverArt(b), label: b.title, onClick: (render) => { if (guestBlock()) return; boardSet(B, b.id, tierId); fillTier(B); render(); } })));
  }
  function openChipMenu(id, B) {
    const b = byId(id); if (!b) return;
    openPickSheet(b.title, () => { const cur = boardGet(B, id); return [...rowsOf(B).map((t) => ({ icon: 'label', color: t.color, label: t.label, check: cur === t.id, onClick: () => { if (guestBlock()) return; boardSet(B, id, t.id); fillTier(B); closePickSheet(); } })), { icon: 'remove_circle', label: 'Sacar (Sin ubicar)', onClick: () => { if (guestBlock()) return; boardSet(B, id, null); fillTier(B); closePickSheet(); } }, { icon: 'info', label: 'Ver ficha', onClick: () => { closePickSheet(); openSheet(b); } }]; });
  }

  /* ---------- reading block (used inside the sheet) ---------- */
  function readingLine(b, uid) {
    const r = store.getReading(b.id, uid);
    const parts = [];
    if (r.startedAt) parts.push(`empezó ${fmtDate(r.startedAt)}`);
    if (r.finishedAt) parts.push(`terminó ${fmtDate(r.finishedAt)}`);
    else if (r.status === 'reading' && readingPercent(r) != null) parts.push(`va ${readingPercent(r)}%`);
    return parts.length ? `<p class="verdict__dates">${icon('event')} ${parts.join(' · ')}</p>` : '';
  }
  function readingBlockHTML(b, u) {
    const r = store.getReading(b.id, u.id);
    const pct = readingPercent(r);
    return `<div class="readblock">` +
      `<div class="readblock__head">${icon('menu_book')} Lectura</div>` +
      `<div class="readblock__status">` +
      `<button class="rbtn ${r.status === 'reading' ? 'is-on' : ''}" data-rb-set="reading">${icon('auto_stories')} Leyendo</button>` +
      `<button class="rbtn ${r.status === 'read' ? 'is-on' : ''}" data-rb-set="read">${icon('task_alt')} Terminado</button>` +
      (r.status ? `<button class="rbtn rbtn--x" data-rb-set="none" title="Sin marcar">${icon('close')}</button>` : '') +
      `</div>` +
      `<div class="readblock__dates">` +
      `<label class="fieldlet">Empecé<input type="date" data-rb="startedAt" value="${r.startedAt || ''}"></label>` +
      `<label class="fieldlet">Terminé<input type="date" data-rb="finishedAt" value="${r.finishedAt || ''}"></label>` +
      `</div>` +
      `<div class="readblock__prog">` +
      `<label class="fieldlet fieldlet--sm">Página<input type="number" min="0" data-rb="page" value="${r.page != null ? r.page : ''}" placeholder="—"></label>` +
      `<label class="fieldlet fieldlet--sm">de<input type="number" min="1" data-rb="pageTotal" value="${r.pageTotal != null ? r.pageTotal : ''}" placeholder="—"></label>` +
      `<label class="fieldlet fieldlet--sm readblock__cap">Capítulo<input type="text" data-rb="chapter" value="${r.chapter ? escapeHtml(r.chapter) : ''}" placeholder="—"></label>` +
      `<span class="readblock__pct" data-rb-pct>${pct != null ? pct + '%' : ''}</span>` +
      `</div></div>`;
  }
  function wireReadingBlock(scope, b, u, rerender = () => openSheet(b)) {
    scope.querySelectorAll('[data-rb-set]').forEach((btn) => btn.addEventListener('click', () => {
      if (guestBlock()) return;
      const v = btn.dataset.rbSet;
      if (v === 'reading') store.setReading(b.id, u.id, { status: 'reading', startedAt: store.getReading(b.id, u.id).startedAt || todayISO() });
      else if (v === 'read') store.setReading(b.id, u.id, { status: 'read', finishedAt: store.getReading(b.id, u.id).finishedAt || todayISO() });
      else store.setReading(b.id, u.id, { status: null });
      rerender(); // re-render so buttons/labels reflect the new status
    }));
    scope.querySelectorAll('[data-rb]').forEach((inp) => inp.addEventListener('change', () => {
      if (guestBlock()) return;
      const k = inp.dataset.rb;
      let val;
      if (k === 'page' || k === 'pageTotal') val = inp.value === '' ? null : +inp.value;
      else if (k === 'chapter') val = inp.value.trim() || null;
      else val = inp.value || null; // dates
      store.setReading(b.id, u.id, { [k]: val });
      const pctEl = scope.querySelector('[data-rb-pct]'); if (pctEl) { const p = readingPercent(store.getReading(b.id, u.id)); pctEl.textContent = p != null ? p + '%' : ''; }
    }));
  }

  function reviewLikeHTML(b, reviewOwner, viewer) {
    const count = store.reviewLikeCount(b.id, reviewOwner.id);
    if (reviewOwner.id === viewer.id) {
      return count ? `<span class="review-like-summary">${icon('favorite')} ${count} ${count === 1 ? 'persona bancó' : 'personas bancaron'} tu reseña</span>` : '';
    }
    const liked = store.hasReviewLike(b.id, reviewOwner.id, viewer.id);
    return `<button type="button" class="review-like${liked ? ' is-liked' : ''}" id="review-like">${icon('favorite')}` +
      `<span class="review-like__label">${liked ? 'Te gusta esta reseña' : 'Me gusta esta reseña'}</span><b>${count || ''}</b></button>`;
  }

  function toggleReviewLike(b, reviewOwner, btn) {
    const viewer = currentUser();
    if (guestBlock('darle like a una reseña') || viewer.id === reviewOwner.id) return;
    const next = !store.hasReviewLike(b.id, reviewOwner.id, viewer.id);
    store.setReviewLike(b.id, reviewOwner.id, viewer.id, next);
    const activityId = `review-like:${APP_ID}:${b.id}:${reviewOwner.id}:${viewer.id}`;
    if (next) {
      K.activity.push(store, {
        id: activityId, type: 'review_like', app: APP_ID, actor: viewer.id, target: reviewOwner.id,
        itemId: b.id, title: b.title, reviewOwner: reviewOwner.id, createdAt: new Date().toISOString(),
      });
    } else {
      K.activity.remove(store, activityId);
    }
    const count = store.reviewLikeCount(b.id, reviewOwner.id);
    btn.classList.toggle('is-liked', next);
    btn.querySelector('.review-like__label').textContent = next ? 'Te gusta esta reseña' : 'Me gusta esta reseña';
    btn.querySelector('b').textContent = count || '';
  }

  function publishReviewActivity(b, before, after) {
    const actor = currentUser();
    const cleanBefore = (before || '').trim();
    const cleanAfter = (after || '').trim();
    if (!cleanAfter || cleanAfter === cleanBefore) return;
    const targets = Object.keys(users).filter((uid) => uid !== actor.id);
    if (!targets.length) return;
    K.activity.push(store, {
      id: `review:${APP_ID}:${b.id}:${actor.id}:${Date.now()}`,
      type: 'review_publish', app: APP_ID, actor: actor.id, targets,
      itemId: b.id, title: b.title, reviewOwner: actor.id,
      action: cleanBefore ? 'updated' : 'published', createdAt: new Date().toISOString(),
    });
  }

  /* ============================================================= SHEET */
  const sheet = $('#sheet');
  function openSheet(b, options = {}) {
    const u = currentUser();
    const reviewMode = options.mode === 'review';
    const reviewOwner = users[options.reviewUserId] || u;
    const canEditReview = reviewMode && reviewOwner.id === u.id && !u.guest;
    const editingReview = canEditReview && options.editing === true;
    const editorVisible = !reviewMode || editingReview;
    const me = verdictOf(b.id, u.id);
    const selected = verdictOf(b.id, reviewOwner.id);
    const excludedUserId = reviewMode ? reviewOwner.id : u.id;
    const others = Object.values(users).filter((x) => x.id !== excludedUserId).map((x) => ({ u: x, e: verdictOf(b.id, x.id) }))
      .filter(({ e }) => typeof e.rating === 'number' || e.review || e.liked);
    const readonlyReview =
      `<div class="rate-box rate-box--review"><div class="rate-box__head review-focus__head">${avatarHTML(reviewOwner)}` +
      `<span class="rate-box__you">Reseña de ${profileLink(reviewOwner.id, reviewOwner.name)}</span>` +
      (canEditReview ? `<button type="button" class="btn btn--soft btn--xs review-focus__edit" id="edit-review">${icon('edit')} Editar</button>` : '') +
      `</div><div class="review-focus__score">` +
      (typeof selected.rating === 'number' ? `${starsMarkup(selected.rating, 'md')}<span class="stars-value">${selected.rating.toFixed(1)}</span>` : `<span class="verdict__none">sin puntaje</span>`) +
      (selected.liked ? `<span class="like is-liked">${icon('favorite')} Le gusta</span>` : '') +
      `</div>` +
      (selected.review ? `<p class="review-focus__text">“${escapeHtml(selected.review)}”</p>` : `<p class="review-focus__empty">Todavía no dejó una reseña.</p>`) +
      readingLine(b, reviewOwner.id) + reviewLikeHTML(b, reviewOwner, u) + `</div>`;
    const editor =
      `<div class="rate-box${editingReview ? ' rate-box--editing' : ''}><div class="rate-box__head">${avatarHTML(u)}` +
      `<span class="rate-box__you">${editingReview ? 'Editar reseña de' : 'Tu puntaje,'} ${profileLink(u.id, u.name)}</span></div>` +
      `<div class="rate-box__row"><div class="rate-box__stars" id="rate-stars"></div><button class="rate-clear" id="rate-clear" ${typeof me.rating === 'number' ? '' : 'hidden'}>borrar</button></div>` +
      readingBlockHTML(b, u) +
      `<div class="review-field"><label for="review">Tu reseña</label><textarea id="review" placeholder="¿Qué te pareció?">${me.review ? escapeHtml(me.review) : ''}</textarea>` +
      `<div class="review-actions"><button class="btn btn--accent" id="save-review">${icon('save')} ${editingReview ? 'Guardar cambios' : 'Guardar reseña'}</button>` +
      (editingReview ? `<button class="btn btn--soft" id="cancel-review">Cancelar</button>` : '') +
      `<button class="btn btn--soft like ${me.liked ? 'is-liked' : ''}" id="sheet-like">${icon('favorite')} ${me.liked ? 'Te gusta' : 'Me gusta'}</button>` +
      `<span class="saved-flag" id="saved-flag">guardado ✓</span></div></div></div>`;
    sheet.innerHTML =
      `<div class="sheet__scrim" data-close></div><div class="sheet__panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(b.title)}">` +
      `<div class="sheet__hero"><div class="hero__bg hero__bg--book" style="background:${art(b)}"></div><button class="sheet__close" data-close>${icon('close')}</button></div>` +
      `<div class="sheet__content"><div class="sheet__meta"><span class="eyebrow" style="color:var(--lime)">${(b.genres && b.genres[0]) || 'Libro'}</span>` +
      [b.author, b.year].filter(Boolean).map((x) => `<span class="dot-sep">·</span><span class="eyebrow">${escapeHtml(String(x))}</span>`).join('') + `</div>` +
      `<h2 class="sheet__title">${escapeHtml(b.title)}</h2>` +
      `<div class="sheet__genres">${(b.genres || []).map((g) => `<span class="gtag">${g}</span>`).join('')}</div>` +
      (!reviewMode ? `<p class="sheet__synopsis">${escapeHtml(b.synopsis || '')}</p>` : '') +
      (editorVisible ? editor : readonlyReview) +
      (!reviewMode && others.length ? `<div class="other-verdict"><div class="other-verdict__head">Lo que dijeron los demás</div>` +
        others.map(({ u: ou, e }) => `<div class="verdict">${avatarHTML(ou, 'avatar verdict__avatar')}<div class="verdict__main"><div class="verdict__row">${profileLink(ou.id, ou.name, 'verdict__name')}` +
          (typeof e.rating === 'number' ? `${starsMarkup(e.rating, 'sm')}<span class="stars-value">${e.rating.toFixed(1)}</span>` : '<span class="verdict__none">sin puntaje</span>') +
          (e.liked ? `<span class="like is-liked">${icon('favorite')}</span>` : '') +
          `</div>${e.review ? `<button type="button" class="verdict__review verdict__review--open" data-review-book="${escapeHtml(b.id)}" data-review-user="${escapeHtml(ou.id)}">“${escapeHtml(e.review)}”</button>` : ''}${readingLine(b, ou.id)}</div></div>`).join('') +
        `</div>` : '') +
      `</div></div>`;
    if (editorVisible) {
      const editOptions = editingReview ? { mode: 'review', reviewUserId: u.id, editing: true } : {};
      mountStars($('#rate-stars', sheet), b, u, me.rating);
      wireReadingBlock(sheet, b, u, () => openSheet(b, editOptions));
      $('#rate-clear', sheet).addEventListener('click', () => { if (guestBlock()) return; store.setRating(b.id, u.id, null); openSheet(b, editOptions); });
      $('#save-review', sheet).addEventListener('click', () => {
        if (guestBlock()) return;
        const nextReview = $('#review', sheet).value.trim();
        store.setReview(b.id, u.id, nextReview);
        publishReviewActivity(b, me.review, nextReview);
        if (editingReview) { openSheet(b, { mode: 'review', reviewUserId: u.id }); return; }
        const f = $('#saved-flag', sheet); f.classList.add('show'); setTimeout(() => f.classList.remove('show'), 1600);
      });
      if (!editingReview) $('#review', sheet).addEventListener('blur', (e) => { if (!isGuest()) store.setReview(b.id, u.id, e.target.value.trim()); });
      $('#sheet-like', sheet).addEventListener('click', (e) => toggleLike(b, e.currentTarget, true));
      const cancel = $('#cancel-review', sheet);
      if (cancel) cancel.addEventListener('click', () => openSheet(b, { mode: 'review', reviewUserId: u.id }));
    } else {
      const edit = $('#edit-review', sheet);
      if (edit) edit.addEventListener('click', () => openSheet(b, { mode: 'review', reviewUserId: u.id, editing: true }));
      const reviewLike = $('#review-like', sheet);
      if (reviewLike) reviewLike.addEventListener('click', () => toggleReviewLike(b, reviewOwner, reviewLike));
    }
    sheet.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheet));
    sheetCloseSeq++; sheet.classList.remove('sheet--closing'); // cancel any in-flight close animation
    sheet.hidden = false; document.body.style.overflow = 'hidden'; document.addEventListener('keydown', onSheetKey);
  }
  function onSheetKey(e) { if (e.key === 'Escape') closeSheet(); }
  let sheetCloseSeq = 0;
  function closeSheet(refresh = true) {
    document.removeEventListener('keydown', onSheetKey);
    const seq = ++sheetCloseSeq;
    const finish = () => {
      if (seq !== sheetCloseSeq) return; // a reopen (or newer close) superseded this one
      sheet.hidden = true; sheet.innerHTML = ''; sheet.classList.remove('sheet--closing');
      document.body.style.overflow = '';
      if (refresh) renderRoute();
    };
    const panel = sheet.querySelector('.sheet__panel');
    if (sheet.hidden || K.motion.reduced() || !panel) return finish();
    sheet.classList.add('sheet--closing'); // CSS animates panel + scrim out, then we hide
    panel.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 420); // fallback if animationend doesn't fire
  }
  function mountStars(container, b, u, initial) {
    let value = typeof initial === 'number' ? initial : 0;
    container.innerHTML = starsMarkup(value, 'lg') + `<span class="stars-value" id="rate-num" style="margin-left:.7rem">${value ? value.toFixed(1) : '—'}</span>`;
    const widget = container.querySelector('.stars'), fill = container.querySelector('.stars__fill'), num = container.querySelector('#rate-num');
    widget.classList.add('stars--interactive'); widget.tabIndex = 0; widget.setAttribute('role', 'slider');
    const setV = (v) => { fill.style.width = (v / 5) * 100 + '%'; num.textContent = v ? v.toFixed(1) : '—'; };
    const fromX = (x) => { const r = widget.getBoundingClientRect(); return Math.max(0.5, Math.ceil(Math.min(1, Math.max(0, (x - r.left) / r.width)) * 10) / 2); };
    widget.addEventListener('pointermove', (e) => setV(fromX(e.clientX)));
    widget.addEventListener('pointerleave', () => setV(value));
    widget.addEventListener('pointerdown', (e) => { value = fromX(e.clientX); commit(); });
    widget.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { value = Math.min(5, value + 0.5); commit(); e.preventDefault(); } if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { value = Math.max(0, value - 0.5); commit(); e.preventDefault(); } });
    function commit() { if (guestBlock()) return setV(typeof initial === 'number' ? initial : 0); setV(value); store.setRating(b.id, u.id, value || null); const c = $('#rate-clear', sheet); if (c) c.hidden = !value; }
  }

  function toggleLike(b, btn, relabel) { if (guestBlock()) return; const u = currentUser(); store.toggleLike(b.id, u.id); const liked = store.get(b.id, u.id).liked; btn.classList.toggle('is-liked', liked); btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 360); if (relabel) btn.innerHTML = `${icon('favorite')} ${liked ? 'Te gusta' : 'Me gusta'}`; }

  /* ============================================================= PERFIL */
  const PROFILE_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const PROFILE_WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
  const profileISO = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  function readDate(b, uid) {
    const r = store.getReading(b.id, uid);
    if (r.finishedAt) return r.finishedAt;
    const t = store.get(b.id, uid).updatedAt;
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
    const read = books.filter((b) => userHasRead(b, uid));
    const rated = books.filter((b) => verdictOf(b.id, uid).rating != null);
    const reviews = books.filter((b) => (verdictOf(b.id, uid).review || '').trim());
    const likes = books.filter((b) => verdictOf(b.id, uid).liked);
    const reading = books.filter((b) => store.getReading(b.id, uid).status === 'reading');
    const year = String(new Date().getFullYear());
    const byDay = {}, byMonth = {}, byWeek = {};
    read.forEach((b) => {
      const d = readDate(b, uid); if (!d) return;
      (byDay[d] = byDay[d] || []).push(b);
      byMonth[d.slice(0, 7)] = (byMonth[d.slice(0, 7)] || 0) + 1;
      const w = isoWeek(d); (byWeek[w] = byWeek[w] || new Set()).add(d);
    });
    const dist = {};
    rated.forEach((b) => { const r = verdictOf(b.id, uid).rating; dist[r] = (dist[r] || 0) + 1; });
    const genres = {};
    read.forEach((b) => (b.genres || []).forEach((g) => (genres[g] = (genres[g] || 0) + 1)));
    const sum = rated.reduce((a, b) => a + verdictOf(b.id, uid).rating, 0);
    const rows = K.tierRows(store, 'def:' + uid, TIER_DEFAULTS, TIER_RAMP);
    const placed = {};
    books.forEach((b) => { const t = store.getTier(b.id, uid); if (t) placed[t] = (placed[t] || 0) + 1; });
    return {
      read: read.length, thisYear: read.filter((b) => (readDate(b, uid) || '').startsWith(year)).length,
      reading: reading.length, reviews: reviews.length, likes: likes.length,
      avg: rated.length ? sum / rated.length : 0,
      byDay, byMonth, byWeek, dist, genres,
      bestMonth: Math.max(0, ...Object.values(byMonth)),
      bestWeek: Math.max(0, ...Object.values(byWeek).map((s) => s.size)),
      topRow: placed[(rows[0] || {}).id] || 0,
      tierFull: rows.length > 0 && rows.every((r) => placed[r.id]),
      ratedList: rated, reviewList: reviews,
    };
  }
  const BOOK_MEDALS = [
    { icon: 'rate_review', name: 'Primera reseña', desc: 'Escribí una reseña', goal: 1, get: (s) => s.reviews },
    { icon: 'menu_book', name: 'Lector', desc: '10 libros leídos', goal: 10, get: (s) => s.read },
    { icon: 'auto_stories', name: 'Devoralibros', desc: '25 libros leídos', goal: 25, get: (s) => s.read },
    { icon: 'workspace_premium', name: 'Biblioteca viva', desc: '100 libros leídos', goal: 100, get: (s) => s.read },
    { icon: 'edit_note', name: 'Crítico', desc: '10 reseñas escritas', goal: 10, get: (s) => s.reviews },
    { icon: 'favorite', name: 'Favoritos', desc: '25 me gusta', goal: 25, get: (s) => s.likes },
    { icon: 'table_rows', name: 'Tier completa', desc: 'Un libro en cada fila', goal: 1, get: (s) => (s.tierFull ? 1 : 0) },
    { icon: 'calendar_month', name: 'Mes intenso', desc: '5 libros en un mes', goal: 5, get: (s) => s.bestMonth },
    { icon: 'bolt', name: 'Semana lectora', desc: '3 días de lectura en una semana', goal: 3, get: (s) => s.bestWeek },
    { icon: 'star', name: 'Amante del PRIME', desc: '10 libros en la fila de arriba', goal: 10, get: (s) => s.topRow },
  ];
  function statTile(n, label, sub) { return `<div class="ptile"><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`; }
  function miniCalendar(byDay, color) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    const start = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    let html = PROFILE_WEEKDAYS.map((w) => `<span class="pmc__h">${w[0]}</span>`).join('');
    for (let i = 0; i < start; i++) html += `<span class="pmc__d pmc__d--out"></span>`;
    for (let d = 1; d <= days; d++) {
      const iso = profileISO(y, m, d), n = (byDay[iso] || []).length, today = d === now.getDate();
      html += `<span class="pmc__d${n ? ' is-on' : ''}${today ? ' is-today' : ''}"${n ? ` style="--c:${color}" title="${n} el ${d}"` : ''}>${d}</span>`;
    }
    return `<div class="pmc"><div class="pmc__title">${PROFILE_MONTHS[m]} ${y}</div><div class="pmc__grid">${html}</div></div>`;
  }
  function yearStrip(byMonth, color) {
    const out = [], now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ label: PROFILE_MONTHS[d.getMonth()].slice(0, 3), n: byMonth[key] || 0 });
    }
    const max = Math.max(1, ...out.map((o) => o.n));
    return `<div class="pbars">${out.map((o) => `<div class="pbar" title="${o.n} en ${o.label}"><span class="pbar__fill" style="height:${Math.round((o.n / max) * 100)}%;--c:${color}"></span><small>${o.label}</small></div>`).join('')}</div>`;
  }
  function distChart(dist, color) {
    const steps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    const max = Math.max(1, ...steps.map((s) => dist[s] || 0));
    return `<div class="pbars pbars--dist">${steps.map((s) => {
      const n = dist[s] || 0;
      return `<button class="pbar pbar--interactive" data-profile-rating="${s}" ${n ? '' : 'disabled'} aria-label="${n} libro${n === 1 ? '' : 's'} con ${s} estrellas">` +
        `<span class="pbar__count">${n}</span><span class="pbar__fill" style="height:${Math.round((n / max) * 100)}%;--c:${color}"></span><small>${s}</small></button>`;
    }).join('')}</div>`;
  }
  function genreChart(genres, color) {
    const top = Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (!top.length) return `<p class="addfilm__hint">Todavía sin datos.</p>`;
    const max = top[0][1];
    return `<div class="prows">${top.map(([g, n]) => `<div class="prow"><span class="prow__l">${escapeHtml(g)}</span><span class="prow__t"><span class="prow__f" style="width:${Math.round((n / max) * 100)}%;--c:${color}"></span></span><b>${n}</b></div>`).join('')}</div>`;
  }
  // Remembers which profile stat/chart cards the user opened, so a background remote
  // re-render (store.onRemote / focus refresh) doesn't snap them shut. Persisted like PWM.
  const PROFILE_DETAIL_STATE_KEY = 'prb.profileDetails';
  let profileDetailState = {};
  try { profileDetailState = JSON.parse(localStorage.getItem(PROFILE_DETAIL_STATE_KEY)) || {}; } catch { profileDetailState = {}; }
  function profileDetailKey(profileId, title) { return `${(currentUser() || {}).id || 'anon'}:${profileId}:${title}`; }
  function rememberProfileDetail(profileId, title, open) {
    profileDetailState[profileDetailKey(profileId, title)] = !!open;
    try { localStorage.setItem(PROFILE_DETAIL_STATE_KEY, JSON.stringify(profileDetailState)); } catch {}
  }
  function profileDetail(profileId, iconName, title, insight, body, explanation, open = false) {
    const saved = profileDetailState[profileDetailKey(profileId, title)];
    const isOpen = typeof saved === 'boolean' ? saved : open;
    return `<details class="pcard pdetail" data-pdetail="${escapeHtml(title)}"${isOpen ? ' open' : ''}>` +
      `<summary class="pdetail__summary"><span class="pdetail__title">${icon(iconName)}<span><b>${title}</b><small>${escapeHtml(insight)}</small></span></span><span class="pdetail__toggle">${icon('expand_more')}</span></summary>` +
      `<div class="pdetail__body">${body}<p class="pdetail__explain">${explanation}</p></div></details>`;
  }
  // Blurred "peek" preview: shows a couple of rows, veils the rest with a fade + "Ver más"
  // button, and expands in place. Ported from PWM for profile parity.
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
    const resetCards = () => cards().forEach((node) => { node.hidden = false; node.inert = false; });
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
        nodes.forEach((node, index) => { const concealed = index >= desktopCount; node.hidden = concealed; node.inert = concealed; });
      }
      syncButtons();
    };
    const scheduleMeasure = () => { cancelAnimationFrame(measureFrame); measureFrame = requestAnimationFrame(measure); };
    const handleBreakpointChange = () => {
      if (!wrapper.isConnected) { mobileQuery.removeEventListener('change', handleBreakpointChange); if (observer) observer.disconnect(); return; }
      scheduleMeasure();
    };
    const setExpanded = (next) => {
      K.motion.run(() => {
        expanded = next;
        wrapper.classList.toggle('is-expanded', expanded);
        if (expanded) { resetCards(); wrapper.classList.remove('has-preview'); wrapper.style.removeProperty('--profile-preview-height'); }
        else { scheduleMeasure(); }
        syncButtons();
      }, { kind: 'shared', target: host });
    };
    if (topButton) topButton.hidden = true;
    bottomButton.addEventListener('click', () => setExpanded(!expanded));
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!wrapper.isConnected) return observer.disconnect(); scheduleMeasure(); }) : null;
    if (observer) observer.observe(host);
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', handleBreakpointChange);
    scheduleMeasure();
  }
  function profileBookCard(b, uid) {
    const v = verdictOf(b.id, uid);
    const c = document.createElement('button'); c.className = 'pbook';
    c.innerHTML = `<span class="pbook__cover" style="background:${coverArt(b)}"></span><span class="pbook__body"><b>${escapeHtml(b.title)}</b>` +
      `<small>${escapeHtml(b.author || '')}</small>${v.rating != null ? `<span>${starsMarkup(v.rating, 'sm')} <b>${v.rating.toFixed(1)}</b></span>` : ''}</span>`;
    c.addEventListener('click', () => openSheet(b));
    return c;
  }
  function openRatingBreakdown(uid, rating, items) {
    const matches = items.filter((b) => verdictOf(b.id, uid).rating === rating);
    const who = users[uid] || currentUser();
    const el = $('#confirm');
    el.innerHTML =
      `<div class="confirm__scrim" data-cancel></div><div class="confirm__card confirm__card--wide rating-breakdown">` +
      `<div class="rating-breakdown__head"><div><div class="confirm__title">${rating} estrellas</div>` +
      `<p class="confirm__text">${escapeHtml(who.name)} puntuó ${matches.length} ${matches.length === 1 ? 'libro' : 'libros'} así.</p></div>` +
      `<button class="icon-btn" data-cancel aria-label="Cerrar">${icon('close')}</button></div>` +
      `<div class="rating-breakdown__grid">${matches.map((b) =>
        `<button class="rating-breakdown__item" data-rating-book="${escapeHtml(b.id)}">` +
        `<span style="background:${coverArt(b)}"></span><b>${escapeHtml(b.title)}</b><small>${escapeHtml(b.author || '')}</small></button>`
      ).join('')}</div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => (el.hidden = true)));
    el.querySelectorAll('[data-rating-book]').forEach((button) => button.addEventListener('click', () => {
      const book = books.find((b) => b.id === button.dataset.ratingBook);
      el.hidden = true;
      if (book) openSheet(book, { mode: verdictOf(book.id, uid).review ? 'review' : undefined, reviewUserId: uid });
    }));
  }
  function renderPerfil(app, uid) {
    const me = currentUser();
    if (me.guest) { store.clearUser(); return showGate(); }
    const id = uid || me.id, u = users[id] || me, mine = id === me.id;
    const s = profileStats(id), acc = store.getAccounts()[id] || {}, bio = acc.bio || '';
    const year = String(new Date().getFullYear());
    const topGenre = (Object.entries(s.genres).sort((a, b) => b[1] - a[1])[0] || ['Sin datos'])[0];
    let medalsDone = 0;
    const medals = BOOK_MEDALS.map((md) => {
      const have = md.get(s), done = have >= md.goal, pct = Math.min(100, Math.round((have / md.goal) * 100));
      if (done) medalsDone++;
      return `<div class="pmedal${done ? ' is-done' : ''}" style="--c:${u.color}"><span class="pmedal__ic">${icon(md.icon)}</span><div class="pmedal__b"><b>${md.name}</b><small>${md.desc}</small><span class="pmedal__bar"><span style="width:${pct}%"></span></span><span class="pmedal__n">${Math.min(have, md.goal)} / ${md.goal}</span></div>${done ? `<span class="pmedal__check">${icon('check_circle')}</span>` : ''}</div>`;
    }).join('');
    app.innerHTML = '';
    const sec = document.createElement('section'); sec.className = 'section'; sec.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    sec.innerHTML =
      `<div class="phero phero--overview" style="--c:${u.color}">` +
      (mine ? `<button class="profile-customize" id="p-customize">${icon('palette')} Personalizar fondo</button>` : '') +
      `<div class="phero__identity"><button class="phero__av" id="p-photo" ${mine ? '' : 'disabled'} title="${mine ? 'Cambiar foto o GIF' : ''}">${avatarHTML(u, 'avatar phero__avatar')}${mine ? `<span class="phero__cam">${icon('photo_camera')}</span>` : ''}</button>` +
      `<div class="phero__body"><h2 class="phero__name">${escapeHtml(u.name)}</h2><p class="phero__handle">@${escapeHtml(u.lb || u.handle || u.id)}</p>` +
      `<p class="phero__bio">${bio ? escapeHtml(bio) : (mine ? '<i>Sin descripción — podés agregar una.</i>' : '<i>Sin descripción.</i>')}</p>` +
      (mine ? `<button class="linklike" id="p-editbio">${icon('edit')} Editar descripción</button>` : '') + `</div></div>` +
      `<div class="ptiles ptiles--overview">${statTile(s.read, 'libros leídos')}${statTile(s.thisYear, 'este año', year)}${statTile(s.reading, 'leyendo ahora')}${statTile(s.reviews, 'reseñas')}${statTile(s.likes, 'me gusta')}${statTile(s.avg ? s.avg.toFixed(2) : '—', 'promedio', 'de 5')}</div></div>` +
      `<div class="profile-layout"><div class="profile-main">` +
      `<section class="profile-block"><div class="profile-block__head"><h3 class="section__title psub"><span class="accentbar">/</span> Últimas reseñas</h3><button class="profile-more" id="p-reviews-more" aria-controls="p-reviews" hidden></button></div>` +
      `<div class="profile-poster-preview" id="p-reviews-preview"><div class="pgrid pgrid--wide" id="p-reviews"></div><span class="profile-poster-preview__veil" aria-hidden="true"></span>` +
      `<button class="profile-poster-preview__more" id="p-reviews-peek" aria-controls="p-reviews" hidden>${icon('unfold_more')} Ver más</button></div></section>` +
      `<section class="profile-block"><div class="profile-block__head"><h3 class="section__title psub"><span class="accentbar">/</span> Mejor rankeados</h3><button class="profile-more" id="p-best-more" aria-controls="p-best" hidden></button></div>` +
      `<div class="profile-poster-preview" id="p-best-preview"><div class="profile-books" id="p-best"></div><span class="profile-poster-preview__veil" aria-hidden="true"></span>` +
      `<button class="profile-poster-preview__more" id="p-best-peek" aria-controls="p-best" hidden>${icon('unfold_more')} Ver más</button></div></section>` +
      `</div><aside class="profile-rail" aria-label="Actividad y estadísticas">` +
      `<div class="pcard profile-calendar"><h4>${icon('calendar_month')} Este mes</h4>${miniCalendar(s.byDay, u.color)}<p class="pdetail__explain">Los días marcados muestran cuándo terminaste o puntuaste una lectura durante el mes.</p></div>` +
      profileDetail(id, 'bar_chart', 'Últimos 12 meses', `${s.thisYear} en ${year}`, yearStrip(s.byMonth, u.color), 'Cada barra representa cuántos libros registraste en ese mes. Sirve para ver tus épocas más activas.', true) +
      profileDetail(id, 'star', 'Cómo puntuás', s.avg ? `${s.avg.toFixed(2)} de promedio` : 'Sin promedio', distChart(s.dist, u.color), 'Agrupa tus puntuaciones de media en media estrella para mostrar si sos más exigente o generoso al puntuar.') +
      profileDetail(id, 'category', 'Tus géneros', topGenre, genreChart(s.genres, u.color), 'Cuenta los géneros presentes en los libros que leíste. Un libro puede sumar en más de un género.') +
      profileDetail(id, 'workspace_premium', 'Medallas', `${medalsDone} de ${BOOK_MEDALS.length} logradas`, `<div class="pmedals">${medals}</div>`, 'Se desbloquean automáticamente con tu actividad. La barra muestra cuánto te falta para cada objetivo.') +
      `</aside></div>`;
    app.appendChild(sec); app.appendChild(buildFooter());
    sec.querySelectorAll('[data-pdetail]').forEach((d) => d.addEventListener('toggle', () => rememberProfileDetail(id, d.dataset.pdetail, d.open)));
    K.profileBackground.apply(sec, sec.querySelector('.phero'), acc, u.color);
    sec.querySelectorAll('[data-profile-rating]').forEach((button) => button.addEventListener('click', () => openRatingBreakdown(id, Number(button.dataset.profileRating), s.ratedList)));
    const revs = s.reviewList.map((b) => ({ b, t: Date.parse(store.get(b.id, id).updatedAt || 0) || 0 })).sort((a, b) => b.t - a.t);
    const rw = sec.querySelector('#p-reviews');
    profileContentPreview(sec.querySelector('#p-reviews-preview'), rw, sec.querySelector('#p-reviews-more'), sec.querySelector('#p-reviews-peek'), revs, ({ b }) => {
      const v = verdictOf(b.id, id), c = document.createElement('button'); c.className = 'prev';
      c.innerHTML = `<span class="prev__poster" style="background:${coverArt(b)}"></span><span class="prev__b"><b>${escapeHtml(b.title)}</b><span class="prev__stars">${starsMarkup(v.rating || 0, 'sm')}${v.rating != null ? `<span class="stars-value">${v.rating.toFixed(1)}</span>` : ''}</span><span class="prev__txt">“${escapeHtml(v.review)}”</span></span>`;
      c.addEventListener('click', () => openSheet(b, { mode: 'review', reviewUserId: id }));
      return K.motion.tag(c, `prb-profile-review-${id}-${b.id}`);
    }, 'Todavía sin reseñas.', { desktopRows: 3 });
    const best = s.ratedList.slice().sort((a, b) => verdictOf(b.id, id).rating - verdictOf(a.id, id).rating);
    const bw = sec.querySelector('#p-best');
    profileContentPreview(sec.querySelector('#p-best-preview'), bw, sec.querySelector('#p-best-more'), sec.querySelector('#p-best-peek'), best, (b) =>
      K.motion.tag(profileBookCard(b, id), `prb-profile-best-${id}-${b.id}`), 'Puntuá un libro y aparece acá.', { desktopRows: 2 });
    if (mine) {
      sec.querySelector('#p-photo').addEventListener('click', () => K.pickPhoto((data) => { K.accounts.patch(store, id, { photo: data }); refreshUsers(); renderHeader(); renderPerfil(app); K.toast('Foto actualizada ✓'); }));
      sec.querySelector('#p-editbio').addEventListener('click', () => openBioEditor(app, id, bio));
      sec.querySelector('#p-customize').addEventListener('click', () => K.profileBackground.open(store, id, {
        color: u.color,
        onSave: () => { refreshUsers(); renderPerfil(app, id); },
      }));
    }
  }
  function openBioEditor(app, id, bio) {
    const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">Tu descripción</div>` +
      `<div class="review-field"><textarea id="bio-txt" maxlength="240" placeholder="Contá algo tuyo…">${escapeHtml(bio)}</textarea></div>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" id="bio-ok">${icon('check')} Guardar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('#bio-ok').addEventListener('click', () => { K.accounts.patch(store, id, { bio: el.querySelector('#bio-txt').value.trim() }); refreshUsers(); el.hidden = true; renderPerfil(app); });
    setTimeout(() => el.querySelector('#bio-txt').focus(), 40);
  }

  /* ============================================================= CONFIGURACIONES */
  function renderConfig(app) {
    const me = currentUser();
    if (me.guest) { store.clearUser(); return showGate(); }
    const acc = store.getAccounts()[me.id] || {};
    app.innerHTML = '';
    const sec = document.createElement('section'); sec.className = 'section'; sec.style.paddingTop = 'calc(var(--header-h) + 1.4rem)';
    sec.innerHTML =
      `<div class="section__head"><div><h3 class="section__title">Configuraciones</h3><p class="section__sub">Tu cuenta — es la misma para <b>PRB</b> y <b>PWM</b>.</p></div></div>` +
      `<div class="cfg">` +
      `<div class="cfg__row"><div class="cfg__l">${icon('account_circle')}<div><b>Foto o GIF de perfil</b><small>Las fotos se recortan; los GIF de hasta 1MB conservan la animación en las dos apps.</small></div></div><div class="cfg__r">${avatarHTML(me, 'avatar cfg__av')}<button class="btn btn--soft btn--xs" id="cfg-photo">${icon('photo_camera')} Cambiar</button>${acc.photo ? `<button class="btn btn--soft btn--xs" id="cfg-photo-off">${icon('delete')} Sacar</button>` : ''}</div></div>` +
      `<div class="cfg__row"><div class="cfg__l">${icon('badge')}<div><b>Nombre</b><small>Cómo te ven en la app.</small></div></div><div class="cfg__r"><input class="cfg__in" id="cfg-name" maxlength="24" value="${escapeHtml(me.name)}"></div></div>` +
      `<div class="cfg__row"><div class="cfg__l">${icon('palette')}<div><b>Tu color</b><small>Pinta tus puntajes y acentos.</small></div></div><div class="cfg__r su-colors">${NEW_COLORS.map((c) => `<button class="su-color${c.toLowerCase() === String(me.color).toLowerCase() ? ' is-on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>` +
      `<div class="cfg__row"><div class="cfg__l">${icon('link')}<div><b>Usuario de Letterboxd</b><small>Se usa en PWM para sincronizar tus películas.</small></div></div><div class="cfg__r"><input class="cfg__in" id="cfg-lb" maxlength="40" placeholder="tuusuario" value="${escapeHtml(acc.lb || me.lb || me.handle || '')}"></div></div>` +
      `<div class="cfg__row"><div class="cfg__l">${icon('lock')}<div><b>Contraseña</b><small>4 números. ${K.accounts.hasPin(store, me.id) ? 'Ya tenés una propia.' : 'Todavía usás la de fábrica (1234).'}</small></div></div><div class="cfg__r"><button class="btn btn--soft btn--xs" id="cfg-pin">${icon('key')} Cambiar contraseña</button></div></div>` +
      `<div class="cfg__row"><div class="cfg__l">${icon('logout')}<div><b>Cerrar sesión</b><small>Volvés a la pantalla de “¿Quién sos?”.</small></div></div><div class="cfg__r"><button class="btn btn--soft btn--xs cfg__danger" id="cfg-out">${icon('logout')} Cerrar sesión</button></div></div></div>` +
      `<div class="cfg__actions"><button class="btn btn--accent" id="cfg-save">${icon('save')} Guardar cambios</button><span class="saved-flag" id="cfg-flag">guardado ✓</span></div>`;
    app.appendChild(sec); app.appendChild(buildFooter());
    let color = me.color;
    sec.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { color = b.dataset.c; sec.querySelectorAll('.su-color').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    sec.querySelector('#cfg-photo').addEventListener('click', () => K.pickPhoto((data) => { K.accounts.patch(store, me.id, { photo: data }); refreshUsers(); renderHeader(); renderConfig(app); K.toast('Foto actualizada ✓'); }));
    const off = sec.querySelector('#cfg-photo-off'); if (off) off.addEventListener('click', () => { K.accounts.patch(store, me.id, { photo: null }); refreshUsers(); renderHeader(); renderConfig(app); });
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
    let stage = hasOwn ? 'old' : 'new', first = null;
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
        await K.accounts.setPin(store, u.id, pin); ctl.close(); K.toast('Contraseña cambiada ✓');
        if (route === 'config') renderConfig($('#app'));
      },
    });
  }

  /* ============================================================= CONFIRM */
  function openConfirm() {
    const u = currentUser(); const el = $('#confirm');
    el.innerHTML = `<div class="confirm__scrim" data-cancel></div><div class="confirm__card"><div class="confirm__title">¿Cambiar de usuario?</div><p class="confirm__text">Estás como <b style="color:${u.color}">${u.name}</b>.</p><div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button><button class="btn btn--accent" data-switch>${icon('switch_account')} Cambiar</button></div></div>`;
    el.hidden = false;
    el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
    el.querySelector('[data-switch]').addEventListener('click', () => { el.hidden = true; stopHero(); store.clearUser(); showGate(); });
  }

  function buildFooter() {
    const f = document.createElement('footer'); f.className = 'footer';
    const bld = PRB.build || { version: '1.0', built: null };
    let ver = `versión ${bld.version}`; if (bld.built) { const d = new Date(bld.built); ver += ` · ${d.toLocaleDateString('es-AR')} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`; }
    f.innerHTML = `<b>PRB</b> — <b style="color:var(--ink-dim)">Project Read Books</b>. Portadas y datos de Open Library · el micro-sitio de libros de <a href="../index.html" style="color:var(--accent)">PWM</a>.<span class="footer__ver">${ver}</span>`;
    return f;
  }

  /* ============================================================= BOOT */
  function openDeepLink() {
    const params = new URLSearchParams(location.search);
    const reviewId = params.get('review');
    const reviewUser = params.get('user');
    if (!reviewId) return;
    const b = byId(reviewId);
    if (b) openSheet(b, { mode: 'review', reviewUserId: reviewUser || currentUser().id });
    history.replaceState({}, '', location.pathname + location.hash);
  }
  function startApp() { applyAccent(); wireProfileNavigation(); wireHashRouting(); renderHeader(); setRoute(routeFromHash() || 'home'); setTimeout(openDeepLink, 40); window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }
  (async () => {
    await store.init();
    mergeExtras();
    refreshUsers();
    const uid = store.getUser();
    if (uid && (users[uid] || uid === 'guest')) { applyAccent(); startApp(); } else { showGate(); }
    let painting = false;
    store.onRemote(() => {
      if (painting || !store.getUser() || !gate.hidden) return;
      painting = true;
      requestAnimationFrame(() => {
        painting = false; mergeExtras(); refreshUsers();
        const busy = !$('#sheet').hidden || $('#confirm').hidden === false || document.getElementById('picksheet')?.hidden === false || document.getElementById('addbook')?.hidden === false || document.getElementById('notification-center');
        renderHeader();
        if (!busy) renderRoute();
      });
    });
    store.startLive();
    let refreshing = false;
    window.addEventListener('focus', async () => { if (refreshing || !store.getUser()) return; refreshing = true; await store.refresh(); mergeExtras(); refreshUsers(); refreshing = false; if ($('#sheet').hidden) renderRoute(); });
  })();
})();
