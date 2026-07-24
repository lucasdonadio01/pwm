/* APPKIT — the bits PWM and PRB both need.
 *
 * Loaded by BOTH apps (PWM: js/shared.js · PRB: ../js/shared.js) so there is exactly one
 * implementation of: the account store, the PIN pad, the photo cropper, tier-row config
 * and the board→image export. Nothing here knows about films or books: callers pass data in.
 */
window.APPKIT = (function () {
  const icon = (n) => `<span class="material-symbols-rounded">${n}</span>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ============================================================ toast */
  let toastTimer = null;
  function toast(msg, kind) {
    let el = document.getElementById('appkit-toast');
    if (!el) { el = document.createElement('div'); el.id = 'appkit-toast'; el.className = 'appkit-toast'; document.body.appendChild(el); }
    el.className = 'appkit-toast' + (kind ? ' appkit-toast--' + kind : '');
    el.innerHTML = msg;
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  /* ============================================================ motion */
  const motion = (function () {
    const reducedQuery = '(prefers-reduced-motion: reduce)';
    let active = null;
    let fallbackPending = null;

    function reduced() {
      return typeof window.matchMedia === 'function' && window.matchMedia(reducedQuery).matches;
    }

    function flushFallback() {
      if (!fallbackPending) return;
      const pending = fallbackPending;
      if (!pending.committed) {
        pending.committed = true;
        pending.update();
      }
      if (pending.animation && typeof pending.animation.cancel === 'function') pending.animation.cancel();
      if (pending.timer) clearTimeout(pending.timer);
      if (pending.target) pending.target.classList.remove('app-motion-fallback--out', 'app-motion-fallback--in', 'app-motion-fallback--route');
      fallbackPending = null;
    }

    function run(update, options = {}) {
      if (typeof update !== 'function') return null;
      if (reduced()) {
        update();
        return null;
      }

      const root = document.documentElement;
      const kind = options.kind === 'shared' ? 'shared' : 'route';
      if (typeof document.startViewTransition !== 'function') {
        const target = typeof options.target === 'string'
          ? document.querySelector(options.target)
          : options.target || document.getElementById('app');
        if (!target) {
          update();
          return null;
        }
        flushFallback();
        if (typeof target.animate !== 'function') {
          const pending = { update, target, committed: false, timer: null };
          fallbackPending = pending;
          target.classList.toggle('app-motion-fallback--route', kind === 'route');
          target.classList.add('app-motion-fallback--out');
          pending.timer = setTimeout(() => {
            if (fallbackPending !== pending) return;
            pending.committed = true;
            update();
            target.classList.remove('app-motion-fallback--out');
            target.classList.add('app-motion-fallback--in');
            pending.timer = setTimeout(() => {
              target.classList.remove('app-motion-fallback--in', 'app-motion-fallback--route');
              if (fallbackPending === pending) fallbackPending = null;
            }, kind === 'route' ? 240 : 190);
          }, kind === 'route' ? 120 : 90);
          return pending;
        }
        const shift = kind === 'route' ? 6 : 3;
        const pending = { update, target, committed: false, animation: null };
        const out = target.animate([
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
          { opacity: 0, transform: `translateY(-${shift}px)`, filter: 'blur(2px)' },
        ], { duration: kind === 'route' ? 120 : 90, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
        pending.animation = out;
        fallbackPending = pending;
        out.finished.catch(() => {}).then(() => {
          if (fallbackPending !== pending) return;
          pending.committed = true;
          update();
          out.cancel();
          const incoming = target.animate([
            { opacity: 0, transform: `translateY(${shift}px)`, filter: 'blur(2px)' },
            { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' },
          ], { duration: kind === 'route' ? 240 : 190, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
          pending.animation = incoming;
          incoming.finished.catch(() => {}).finally(() => {
            if (fallbackPending === pending) fallbackPending = null;
          });
        });
        return out;
      }

      root.dataset.appMotion = kind;
      if (active && typeof active.skipTransition === 'function') active.skipTransition();

      try {
        const transition = document.startViewTransition(update);
        active = transition;
        transition.finished.catch(() => {}).finally(() => {
          if (active !== transition) return;
          active = null;
          delete root.dataset.appMotion;
        });
        return transition;
      } catch {
        delete root.dataset.appMotion;
        update();
        return null;
      }
    }

    function tag(element, id) {
      if (!element || id == null) return element;
      const safe = String(id).trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      if (safe) {
        element.classList.add('app-motion-item');
        element.style.viewTransitionName = `item-${safe}`;
      }
      return element;
    }

    return { run, tag, reduced };
  })();

  /* ============================================================ colors */
  const hex2rgb = (h) => { const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  /** Sample a multi-stop ramp at t∈[0,1] — used for the automatic top→bottom tier gradient. */
  function rampAt(ramp, t) {
    if (!ramp.length) return '#888888';
    if (ramp.length === 1) return ramp[0];
    const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
    const i = Math.min(ramp.length - 2, Math.floor(x));
    const f = x - i;
    const a = hex2rgb(ramp[i]), b = hex2rgb(ramp[i + 1]);
    return rgb2hex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }
  const autoColor = (i, n, ramp) => rampAt(ramp, n <= 1 ? 0 : i / (n - 1));

  /* ============================================================ tier rows
   * A row is { id, label, sub, color }. color === null means "automatic by position". */
  function normalizeRows(rows, ramp) {
    return (rows || []).map((r, i, all) => ({ ...r, color: r.color || autoColor(i, all.length, ramp) }));
  }
  function tierRows(store, boardId, defaults, ramp) {
    const saved = store.getTierRows(boardId);
    const rows = saved && saved.length ? saved : defaults.map((d) => ({ id: d.id, label: d.label, sub: d.sub || '', color: null }));
    return normalizeRows(rows, ramp);
  }
  const newRowId = () => 'tr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /**
   * Row editor. onSave(rows) receives the raw rows (color:null = automatic);
   * onRemoved(removedIds) lets the caller unplace items that lived in a deleted row.
   */
  function openRowEditor(opts) {
    const { host, boardName, rows, ramp, onSave, onReset } = opts;
    let draft = rows.map((r) => ({ id: r.id, label: r.label, sub: r.sub || '', color: r.rawColor === undefined ? (r.auto ? null : r.color) : r.rawColor }));
    const startIds = draft.map((r) => r.id);
    const el = host;
    const draw = () => {
      const shown = draft.map((r, i) => ({ ...r, shown: r.color || autoColor(i, draft.length, ramp) }));
      el.innerHTML =
        `<div class="confirm__scrim" data-cancel></div><div class="confirm__card confirm__card--wide">` +
        `<div class="confirm__title">Filas de “${esc(boardName)}”</div>` +
        `<p class="confirm__text">Renombrá, reordená, sumá o sacá filas. El color va solo (de arriba hacia abajo); tocá el círculo para elegirlo a mano.</p>` +
        `<div class="rowed">` +
        shown.map((r, i) =>
          `<div class="rowed__row" data-i="${i}">` +
          `<span class="rowed__bar" style="background:${r.shown}"></span>` +
          `<div class="rowed__moves"><button class="rowed__mv" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icon('keyboard_arrow_up')}</button>` +
          `<button class="rowed__mv" data-down="${i}" ${i === draft.length - 1 ? 'disabled' : ''} aria-label="Bajar">${icon('keyboard_arrow_down')}</button></div>` +
          `<input class="rowed__name" data-name="${i}" maxlength="22" value="${esc(r.label)}" placeholder="Nombre de la fila">` +
          `<label class="rowed__color" title="Color a mano"><input type="color" data-color="${i}" value="${r.shown}"><span style="background:${r.shown}"></span></label>` +
          (r.color ? `<button class="rowed__auto" data-auto="${i}" title="Volver al color automático">${icon('auto_fix_high')}</button>` : '') +
          `<button class="rowed__del" data-del="${i}" ${draft.length <= 1 ? 'disabled' : ''} aria-label="Borrar fila">${icon('close')}</button>` +
          `</div>`).join('') +
        `</div>` +
        `<button class="btn btn--soft btn--xs rowed__add" data-add>${icon('add')} Agregar fila</button>` +
        `<div class="confirm__actions"><button class="btn btn--soft" data-reset>${icon('restart_alt')} Por defecto</button>` +
        `<button class="btn btn--soft" data-cancel>Cancelar</button>` +
        `<button class="btn btn--accent" data-ok>${icon('check')} Guardar</button></div></div>`;

      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
      el.querySelectorAll('[data-name]').forEach((inp) => inp.addEventListener('input', () => { draft[+inp.dataset.name].label = inp.value; }));
      el.querySelectorAll('[data-color]').forEach((inp) => inp.addEventListener('input', () => { draft[+inp.dataset.color].color = inp.value; draw(); }));
      el.querySelectorAll('[data-auto]').forEach((b) => b.addEventListener('click', () => { draft[+b.dataset.auto].color = null; draw(); }));
      el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.up; [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; draw(); }));
      el.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.down; [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; draw(); }));
      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { draft.splice(+b.dataset.del, 1); draw(); }));
      el.querySelector('[data-add]').addEventListener('click', () => { draft.push({ id: newRowId(), label: 'Nueva fila', sub: '', color: null }); draw(); });
      el.querySelector('[data-reset]').addEventListener('click', () => { el.hidden = true; if (onReset) onReset(startIds); });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const clean = draft.map((r) => ({ id: r.id, label: (r.label || '').trim() || 'Sin nombre', sub: r.sub || '', color: r.color || null }));
        const gone = startIds.filter((id) => !clean.some((r) => r.id === id));
        el.hidden = true;
        onSave(clean, gone);
      });
    };
    draw();
    el.hidden = false;
  }

  /* ============================================================ accounts (shared PWM+PRB)
   * Honest naming: this is a shared-store password, not server-side auth. It keeps the two of
   * you (and whoever you invite) apart on a private app — it is not protection against someone
   * who already has the database key. */
  const DEFAULT_PIN = '1234';
  async function sha256(txt) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { return 'plain:' + txt; }   // file:// without crypto.subtle — still better than nothing
  }
  const GUEST = { id: 'guest', name: 'Invitado', handle: 'invitado', color: '#8A8A92', initial: '?', guest: true };

  const accounts = {
    /** builtins (from data.js) merged with the created/edited accounts blob. */
    all(store, builtins) {
      const out = {};
      Object.entries(builtins || {}).forEach(([id, u]) => (out[id] = { ...u }));
      const acc = store.getAccounts();
      Object.entries(acc).forEach(([id, a]) => (out[id] = { ...(out[id] || {}), ...a, id }));
      return out;
    },
    guest: () => ({ ...GUEST }),
    async create(store, { name, color, lb, photo, pin }) {
      const base = (name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
      const acc = store.getAccounts();
      let id = base, n = 2;
      while (acc[id] || id === 'guest' || id === 'extra' || id === 'both') id = base + n++;
      acc[id] = {
        id, name: (name || '').trim(), handle: (lb || '').trim() || base, color: color || '#7C5CFF',
        initial: (name || '?').trim().charAt(0).toUpperCase(), photo: photo || null, bio: '',
        lb: (lb || '').trim(), pass: await sha256(id + ':' + (pin || DEFAULT_PIN)), createdAt: new Date().toISOString(), custom: true,
      };
      store.saveAccounts(acc);
      return acc[id];
    },
    patch(store, id, patch) {
      const acc = store.getAccounts();
      acc[id] = { ...(acc[id] || { id }), ...patch, id };
      store.saveAccounts(acc);
      return acc[id];
    },
    async setPin(store, id, pin) { return accounts.patch(store, id, { pass: await sha256(id + ':' + pin) }); },
    async checkPin(store, id, pin) {
      const a = store.getAccounts()[id];
      if (!a || !a.pass) return pin === DEFAULT_PIN;     // built-ins that never set one keep the old 1234
      return a.pass === (await sha256(id + ':' + pin));
    },
    hasPin(store, id) { const a = store.getAccounts()[id]; return !!(a && a.pass); },
  };

  /* ============================================================ shared activity
   * One compact feed for PWM + PRB. Items can target one user (`target`) or several
   * (`targets`) and keep per-user read/dismiss state inside the same shared JSON blob. */
  const activity = {
    all(store) {
      const rows = store.getShared('activity');
      return Array.isArray(rows) ? JSON.parse(JSON.stringify(rows)) : [];
    },
    forUser(store, uid) {
      return activity.all(store)
        .filter((item) => {
          const targets = Array.isArray(item.targets) ? item.targets : (item.target ? [item.target] : []);
          return (!targets.length || targets.includes(uid)) && !(item.dismissedBy || {})[uid];
        })
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },
    unreadCount(store, uid) {
      return activity.forUser(store, uid).filter((item) => !(item.readBy || {})[uid]).length;
    },
    pushMany(store, incoming) {
      const rows = activity.all(store);
      const next = new Map(rows.map((item) => [item.id, item]));
      (incoming || []).filter((item) => item && item.id).forEach((item) => {
        const prev = next.get(item.id) || {};
        next.set(item.id, {
          ...prev, ...item,
          createdAt: item.createdAt || new Date().toISOString(),
          readBy: item.readBy || {},
          dismissedBy: item.dismissedBy || {},
        });
      });
      store.setShared('activity', [...next.values()]
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 250));
    },
    push(store, item) { activity.pushMany(store, [item]); },
    remove(store, id) {
      store.setShared('activity', activity.all(store).filter((item) => item.id !== id));
    },
    removeMany(store, ids) {
      const unwanted = new Set(ids || []);
      if (!unwanted.size) return;
      store.setShared('activity', activity.all(store).filter((item) => !unwanted.has(item.id)));
    },
    markRead(store, uid, ids) {
      const wanted = ids ? new Set(ids) : null;
      const rows = activity.all(store);
      let changed = false;
      rows.forEach((item) => {
        if (wanted && !wanted.has(item.id)) return;
        const targets = Array.isArray(item.targets) ? item.targets : (item.target ? [item.target] : []);
        if (targets.length && !targets.includes(uid)) return;
        item.readBy = item.readBy || {};
        if (!item.readBy[uid]) { item.readBy[uid] = new Date().toISOString(); changed = true; }
      });
      if (changed) store.setShared('activity', rows);
    },
    dismiss(store, uid, id) {
      const rows = activity.all(store);
      const item = rows.find((x) => x.id === id);
      if (!item) return;
      item.dismissedBy = item.dismissedBy || {};
      item.dismissedBy[uid] = true;
      store.setShared('activity', rows);
    },
    timeAgo(iso) {
      const diff = Date.now() - Date.parse(iso || 0);
      if (!Number.isFinite(diff) || diff < 0) return 'recién';
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'recién';
      if (mins < 60) return `hace ${mins} min`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `hace ${hours} h`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
      return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    },
  };

  /* ============================================================ PIN pad
   * opts: { avatar (html), name, color, label, error, onDone(pin), onCancel } */
  function pinPad(opts) {
    let el = document.getElementById('passgate');
    if (!el) { el = document.createElement('div'); el.id = 'passgate'; el.className = 'passgate'; document.body.appendChild(el); }
    el.style.setProperty('--c', opts.color || 'var(--accent)');
    let entered = '';
    let keyHandler = null;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
    const close = () => {
      el.hidden = true; el.innerHTML = '';
      if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
    };
    function draw(err) {
      el.innerHTML =
        `<button class="passgate__back" data-pgback aria-label="Volver">${icon('arrow_back')}</button>` +
        `<div class="passgate__inner">` + (opts.avatar || '') +
        (opts.name ? `<div class="passgate__name" style="color:${opts.color || 'var(--accent)'}">${esc(opts.name)}</div>` : '') +
        `<div class="passgate__label">${esc(opts.label || 'Ingresá la contraseña')}</div>` +
        `<div class="passgate__dots${err ? ' shake' : ''}">${[0, 1, 2, 3].map((i) => `<span class="pdot${i < entered.length ? ' on' : ''}"></span>`).join('')}</div>` +
        `<div class="passgate__keys">` + keys.map((k) => k === 'back'
          ? `<button class="pkey pkey--fn" data-k="back" aria-label="Borrar">${icon('backspace')}</button>`
          : k === 'ok' ? `<button class="pkey pkey--fn" data-k="ok" aria-label="Aceptar">${icon('check')}</button>`
          : `<button class="pkey" data-k="${k}">${k}</button>`).join('') + `</div>` +
        `<div class="passgate__err"${err ? '' : ' style="visibility:hidden"'}>${esc(err || opts.error || 'Contraseña incorrecta')}</div></div>`;
      el.querySelector('[data-pgback]').addEventListener('click', () => { close(); if (opts.onCancel) opts.onCancel(); });
      el.querySelectorAll('.pkey').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    }
    function press(k) {
      if (k === 'back') { entered = entered.slice(0, -1); return draw(); }
      if (k === 'ok') return submit();
      if (entered.length >= 4) return;
      entered += k; draw();
      if (entered.length === 4) setTimeout(submit, 180);
    }
    async function submit() {
      if (entered.length < 4) return;
      const pin = entered;
      const res = await opts.onDone(pin, {
        close,
        fail: (msg) => { entered = ''; draw(msg || 'Contraseña incorrecta'); },
        next: (label) => { entered = ''; opts.label = label || opts.label; draw(); },
      });
      if (res === true) close();
    }
    keyHandler = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') press('ok');
      else if (e.key === 'Escape') { close(); if (opts.onCancel) opts.onCancel(); }
    };
    document.addEventListener('keydown', keyHandler);
    draw();
    el.hidden = false;
    return { close };
  }

  /* ============================================================ photo picker + cropper
   * The site is static (Supabase only stores), so the whole resize happens in the browser:
   * pick up to 10MB → pan/zoom into a square frame → export ~400×400 JPEG (a few KB) → store that.
   * The 10MB original is never persisted. */
  const MAX_UPLOAD = 10 * 1024 * 1024;
  const MAX_GIF_UPLOAD = 1024 * 1024;
  function pickPhoto(onReady) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      if (file.size > MAX_UPLOAD) return toast('Esa imagen pesa más de 10MB. Probá con una más chica.', 'bad');
      const fr = new FileReader();
      fr.onload = () => {
        if (file.type === 'image/gif') {
          if (file.size > MAX_GIF_UPLOAD) return toast('Para que el GIF siga animado, elegí uno de hasta 1MB.', 'bad');
          onReady(fr.result);
          toast('GIF animado listo ✓');
          return;
        }
        openCropper(fr.result, onReady);
      };
      fr.onerror = () => toast('No pude leer la imagen.', 'bad');
      fr.readAsDataURL(file);
    });
    inp.click();
  }

  function pickBackground(onReady) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp,image/gif'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      if (file.size > MAX_UPLOAD) return toast('Ese fondo pesa más de 10MB. Probá con uno más chico.', 'bad');
      const fr = new FileReader();
      fr.onload = () => {
        if (file.type === 'image/gif') {
          if (file.size > MAX_GIF_UPLOAD) return toast('Para guardar el GIF animado, elegí uno de hasta 1MB.', 'bad');
          onReady(fr.result);
          toast('GIF de fondo listo ✓');
          return;
        }
        openCropper(fr.result, onReady, {
          width: 1400, height: 480,
          title: 'Recortá el fondo',
          hint: 'Arrastrá para encuadrar · queda en formato ultrawide',
          action: 'Usar este fondo',
        });
      };
      fr.onerror = () => toast('No pude leer esa imagen.', 'bad');
      fr.readAsDataURL(file);
    });
    inp.click();
  }

  function openCropper(src, onReady, size) {
    const opts = size && typeof size === 'object' ? size : {};
    const OUT_W = typeof size === 'number' ? size : (opts.width || 400);
    const OUT_H = typeof size === 'number' ? size : (opts.height || OUT_W);
    const wide = OUT_W / OUT_H > 1.4;
    let el = document.getElementById('cropper');
    if (!el) { el = document.createElement('div'); el.id = 'cropper'; el.className = 'cropper'; document.body.appendChild(el); }
    el.innerHTML =
      `<div class="cropper__scrim" data-cclose></div><div class="cropper__panel${wide ? ' cropper__panel--wide' : ''}">` +
      `<div class="cropper__head"><h3>${esc(opts.title || 'Recortá tu foto')}</h3><button class="icon-btn" data-cclose aria-label="Cerrar">${icon('close')}</button></div>` +
      `<div class="cropper__stage${wide ? ' cropper__stage--wide' : ''}" id="cr-stage"><canvas id="cr-canvas" width="${OUT_W}" height="${OUT_H}"></canvas><div class="cropper__ring"></div></div>` +
      `<label class="cropper__zoom">${icon('zoom_out')}<input type="range" id="cr-zoom" min="100" max="400" value="100">${icon('zoom_in')}</label>` +
      `<p class="cropper__hint">${esc(opts.hint || 'Arrastrá para mover · deslizá para acercar')}</p>` +
      `<div class="confirm__actions"><button class="btn btn--soft" data-cclose>Cancelar</button>` +
      `<button class="btn btn--accent" id="cr-ok">${icon('check')} ${esc(opts.action || 'Usar esta foto')}</button></div></div>`;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    const close = () => { el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; };
    el.querySelectorAll('[data-cclose]').forEach((b) => b.addEventListener('click', close));

    const cv = el.querySelector('#cr-canvas'), ctx = cv.getContext('2d');
    const zoomInput = el.querySelector('#cr-zoom');
    const img = new Image();
    let scale = 1, minScale = 1, ox = 0, oy = 0, drag = null;
    img.onload = () => {
      minScale = Math.max(OUT_W / img.width, OUT_H / img.height);
      scale = minScale; ox = (OUT_W - img.width * scale) / 2; oy = (OUT_H - img.height * scale) / 2;
      paint();
    };
    img.onerror = () => { toast('No pude abrir esa imagen.', 'bad'); close(); };
    img.src = src;
    function clamp() {
      const w = img.width * scale, h = img.height * scale;
      ox = Math.min(0, Math.max(OUT_W - w, ox));
      oy = Math.min(0, Math.max(OUT_H - h, oy));
    }
    function paint() {
      clamp();
      ctx.clearRect(0, 0, OUT_W, OUT_H);
      ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);
    }
    zoomInput.addEventListener('input', () => {
      const cx = OUT_W / 2, cy = OUT_H / 2;
      const prev = scale;
      scale = minScale * (+zoomInput.value / 100);
      ox = cx - (cx - ox) * (scale / prev);
      oy = cy - (cy - oy) * (scale / prev);
      paint();
    });
    const pt = (e) => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (OUT_W / r.width), y: (t.clientY - r.top) * (OUT_H / r.height) }; };
    const down = (e) => { const p = pt(e); drag = { x: p.x - ox, y: p.y - oy }; };
    const move = (e) => { if (!drag) return; e.preventDefault(); const p = pt(e); ox = p.x - drag.x; oy = p.y - drag.y; paint(); };
    const up = () => (drag = null);
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: false });
    cv.addEventListener('touchstart', down, { passive: true }); cv.addEventListener('touchmove', move, { passive: false }); cv.addEventListener('touchend', up);
    el.querySelector('#cr-ok').addEventListener('click', () => {
      let out;
      try { out = cv.toDataURL('image/jpeg', 0.85); } catch { toast('No pude procesar la imagen.', 'bad'); return; }
      close();
      onReady(out);
    });
  }

  /* ============================================================ profile background
   * Shared account fields:
   * profileBg (data image or https URL), profileBgMode ('banner' | 'full'),
   * profileBgColor (#rrggbb) and profileBgShade (25..85).
   * GIF search uses Wikimedia Commons: free, client-side and no key required. */
  const profileBackground = (function () {
    const DEFAULT_COLOR = '#16090b';
    const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    const safeImage = (value) => {
      const src = String(value || '').trim();
      if (/^https:\/\//i.test(src)) return src;
      if (/^data:image\/(?:gif|png|jpeg|webp);base64,/i.test(src)) return src;
      return '';
    };
    const safeShade = (value) => Math.max(25, Math.min(85, parseInt(value, 10) || 62));

    function read(account, fallbackColor) {
      return {
        image: safeImage(account && account.profileBg),
        mode: account && account.profileBgMode === 'full' ? 'full' : 'banner',
        color: safeColor(account && account.profileBgColor, DEFAULT_COLOR),
        shade: safeShade(account && account.profileBgShade),
      };
    }

    function setVars(element, state) {
      if (!element) return;
      element.style.setProperty('--profile-bg-color', state.color);
      element.style.setProperty('--profile-bg-image', state.image ? `url("${state.image.replace(/["\\]/g, '\\$&')}")` : 'none');
      element.style.setProperty('--profile-bg-shade', String(state.shade / 100));
    }

    function apply(section, hero, account, fallbackColor) {
      const state = read(account, fallbackColor);
      section.classList.add('profile-section', `profile-section--${state.mode}`);
      section.style.setProperty('--c', safeColor(fallbackColor, '#ff0055'));
      hero.classList.add('phero--personalized');
      setVars(section, state);
      setVars(hero, state);
      return state;
    }

    async function search(query) {
      const q = String(query || '').trim().slice(0, 50);
      if (!q) return [];
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrnamespace: '6',
        gsrsearch: `${q} filemime:image/gif`,
        gsrlimit: '12',
        prop: 'imageinfo',
        iiprop: 'url|mime|size',
        iiurlwidth: '640',
        format: 'json',
        origin: '*',
      });
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
      if (!response.ok) throw new Error('gif-search');
      const payload = await response.json();
      return Object.values((payload.query && payload.query.pages) || {})
        .map((page) => {
          const info = page.imageinfo && page.imageinfo[0];
          return info && info.mime === 'image/gif' ? {
            title: String(page.title || '').replace(/^File:/, ''),
            url: safeImage(info.url),
            preview: safeImage(info.thumburl || info.url),
            width: info.width || 0,
            height: info.height || 0,
          } : null;
        })
        .filter((item) => item && item.url)
        .slice(0, 8);
    }

    function open(store, userId, options = {}) {
      const account = store.getAccounts()[userId] || {};
      const state = read(account, options.color);
      let results = [];
      let el = document.getElementById('profile-customizer');
      if (!el) {
        el = document.createElement('div');
        el.id = 'profile-customizer';
        el.className = 'profile-customizer';
        document.body.appendChild(el);
      }
      el.innerHTML =
        `<div class="profile-customizer__scrim" data-pb-close></div>` +
        `<div class="profile-customizer__panel" role="dialog" aria-modal="true" aria-labelledby="pb-title">` +
        `<div class="profile-customizer__head"><div><h3 id="pb-title">Personalizá tu perfil</h3><p>Elegí dónde vive el fondo y hacelo bien tuyo.</p></div>` +
        `<button class="icon-btn" data-pb-close aria-label="Cerrar">${icon('close')}</button></div>` +
        `<div class="profile-bg-preview" id="pb-preview"><span>Vista previa</span></div>` +
        `<div class="profile-customizer__grid">` +
        `<section class="profile-customizer__group"><h4>Alcance</h4><div class="profile-bg-modes" role="group" aria-label="Dónde aplicar el fondo">` +
        `<button class="profile-bg-mode" data-pb-mode="banner">${icon('panorama')}<span><b>Solo portada</b><small>Arriba, junto a tu descripción.</small></span></button>` +
        `<button class="profile-bg-mode" data-pb-mode="full">${icon('fullscreen')}<span><b>Todo el perfil</b><small>Acompaña reseñas y estadísticas.</small></span></button></div></section>` +
        `<section class="profile-customizer__group"><h4>Color y contraste</h4><div class="profile-bg-color">` +
        `<label><span>Color base</span><input type="color" id="pb-color" value="${esc(state.color)}"></label>` +
        `<label class="profile-bg-shade"><span>Oscurecer imagen</span><input type="range" id="pb-shade" min="25" max="85" value="${state.shade}"><b id="pb-shade-value">${state.shade}%</b></label>` +
        `</div></section>` +
        `<section class="profile-customizer__group profile-customizer__group--wide"><div class="profile-customizer__title"><h4>Imagen o GIF ultrawide</h4>` +
        `<div><button class="btn btn--soft btn--xs" id="pb-upload">${icon('upload')} Subir</button>` +
        `<button class="btn btn--soft btn--xs" id="pb-remove">${icon('hide_image')} Usar solo color</button></div></div>` +
        `<label class="profile-bg-url"><span>También podés pegar un enlace directo</span><input id="pb-url" type="url" placeholder="https://…/fondo.gif" value="${esc(state.image && !state.image.startsWith('data:') ? state.image : '')}"></label>` +
        `<div class="profile-gif-search"><label class="search"><span class="material-symbols-rounded">search</span><input id="pb-query" type="search" maxlength="50" placeholder="Buscar GIFs: cine, galaxia, lluvia…"></label>` +
        `<button class="btn btn--soft" id="pb-search">${icon('gif_box')} Buscar</button></div>` +
        `<div class="profile-gif-results" id="pb-results"><p>Buscá un GIF libre en Wikimedia Commons o subí el tuyo.</p></div>` +
        `</section></div>` +
        `<div class="profile-customizer__actions"><button class="btn btn--soft" data-pb-close>Cancelar</button>` +
        `<button class="btn btn--accent" id="pb-save">${icon('check')} Guardar fondo</button></div></div>`;
      el.hidden = false;
      document.body.style.overflow = 'hidden';

      const preview = el.querySelector('#pb-preview');
      const urlInput = el.querySelector('#pb-url');
      const close = () => {
        el.hidden = true;
        el.innerHTML = '';
        document.body.style.overflow = '';
        document.removeEventListener('keydown', onKey);
      };
      const onKey = (event) => { if (event.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      el.querySelectorAll('[data-pb-close]').forEach((button) => button.addEventListener('click', close));

      const refresh = () => {
        setVars(preview, state);
        preview.classList.toggle('is-full', state.mode === 'full');
        preview.classList.toggle('has-image', !!state.image);
        el.querySelectorAll('[data-pb-mode]').forEach((button) => button.classList.toggle('is-on', button.dataset.pbMode === state.mode));
        el.querySelector('#pb-shade-value').textContent = `${state.shade}%`;
      };
      el.querySelectorAll('[data-pb-mode]').forEach((button) => button.addEventListener('click', () => {
        state.mode = button.dataset.pbMode;
        refresh();
      }));
      el.querySelector('#pb-color').addEventListener('input', (event) => { state.color = event.target.value; refresh(); });
      el.querySelector('#pb-shade').addEventListener('input', (event) => { state.shade = safeShade(event.target.value); refresh(); });
      el.querySelector('#pb-upload').addEventListener('click', () => pickBackground((data) => {
        state.image = data;
        urlInput.value = '';
        refresh();
      }));
      el.querySelector('#pb-remove').addEventListener('click', () => {
        state.image = '';
        urlInput.value = '';
        refresh();
      });
      urlInput.addEventListener('change', () => {
        const next = safeImage(urlInput.value);
        if (urlInput.value.trim() && !next) {
          toast('Pegá un enlace directo que empiece con https://', 'bad');
          urlInput.value = state.image.startsWith('https://') ? state.image : '';
          return;
        }
        state.image = next;
        refresh();
      });

      const drawResults = (busy, message) => {
        const host = el.querySelector('#pb-results');
        if (busy) { host.innerHTML = `<p>${icon('hourglass_top')} Buscando GIFs…</p>`; return; }
        if (message) { host.innerHTML = `<p>${esc(message)}</p>`; return; }
        host.innerHTML = results.map((item, index) =>
          `<button class="profile-gif-result" data-pb-gif="${index}" title="${esc(item.title)}">` +
          `<img src="${esc(item.preview)}" alt="${esc(item.title)}" loading="lazy"><span>${esc(item.title)}</span></button>`
        ).join('');
        host.querySelectorAll('[data-pb-gif]').forEach((button) => button.addEventListener('click', () => {
          const item = results[Number(button.dataset.pbGif)];
          state.image = item.url;
          urlInput.value = item.url;
          host.querySelectorAll('.profile-gif-result').forEach((node) => node.classList.toggle('is-on', node === button));
          refresh();
        }));
      };
      const runSearch = async () => {
        const query = el.querySelector('#pb-query').value.trim();
        if (!query) { el.querySelector('#pb-query').focus(); return; }
        drawResults(true);
        try {
          results = await search(query);
          drawResults(false, results.length ? '' : 'No encontré GIFs con esa búsqueda. Probá con otra palabra.');
        } catch {
          drawResults(false, 'No pude buscar ahora. Igual podés subir un GIF o pegar un enlace.');
        }
      };
      el.querySelector('#pb-search').addEventListener('click', runSearch);
      el.querySelector('#pb-query').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); runSearch(); }
      });
      el.querySelector('#pb-save').addEventListener('click', () => {
        accounts.patch(store, userId, {
          profileBg: state.image || null,
          profileBgMode: state.mode,
          profileBgColor: state.color,
          profileBgShade: state.shade,
        });
        close();
        if (typeof options.onSave === 'function') options.onSave();
        toast('Fondo del perfil actualizado ✓');
      });
      refresh();
    }

    return { read, apply, open, search };
  })();

  /* ============================================================ board → image (social export)
   * Hand-drawn on a canvas instead of screenshotting the DOM: the goal is a clean, minimal
   * social card (square or story), not a photo of the app's UI. No library, no network.
   * opts = { title, subtitle, brand, rows:[{label,color,items:[{title,img}]}], format, bg, ink, accent, fileName }
   */
  const boardImageCache = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (boardImageCache.has(src)) return boardImageCache.get(src);
    const pending = new Promise((res) => {
      const sources = [src];
      try {
        const remote = new URL(src, window.location.href);
        if (/^https?:$/.test(remote.protocol) && remote.origin !== window.location.origin) {
          // Poster CDNs usually render fine in CSS but omit the CORS header canvas needs.
          // wsrv returns the same public artwork with CORS enabled, so the PNG keeps its covers.
          sources.push(`https://wsrv.nl/?url=${encodeURIComponent(remote.href)}&output=jpg&q=90`);
        }
      } catch {}
      const tryNext = () => {
        const next = sources.shift();
        if (!next) return res(null);
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = tryNext;
        im.src = next;
      };
      tryNext();
    });
    boardImageCache.set(src, pending);
    return pending;
  }
  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function fitText(ctx, text, max) {
    let t = text;
    if (ctx.measureText(t).width <= max) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }

  async function renderBoardImage(opts) {
    const story = opts.format === 'story';
    const W = 1080, H = story ? 1920 : 1080;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const bg = opts.bg || '#0d0303';
    const ink = opts.ink || '#eff8ff';
    const accent = opts.accent || '#bbef1f';

    // ground + a very soft accent bloom in two corners
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const bloom = (x, y, r, color, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color + a); g.addColorStop(1, color + '00');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    };
    bloom(120, 90, 700, accent, '1f');
    bloom(W - 90, H - 60, 760, accent, '14');

    const P = 68;
    let y = P + 16;

    ctx.textBaseline = 'top';
    ctx.fillStyle = accent;
    ctx.font = '700 26px "JetBrains Mono", monospace';
    ctx.fillText(String(opts.brand || '').toUpperCase(), P, y);
    y += 46;

    ctx.fillStyle = ink;
    ctx.font = `900 ${story ? 84 : 72}px Archivo, system-ui, sans-serif`;
    ctx.fillText(fitText(ctx, opts.title || 'Tier list', W - P * 2), P, y);
    y += story ? 96 : 84;

    if (opts.subtitle) {
      ctx.fillStyle = 'rgba(239,248,255,.55)';
      ctx.font = '500 30px Archivo, system-ui, sans-serif';
      ctx.fillText(fitText(ctx, opts.subtitle, W - P * 2), P, y);
      y += 52;
    }
    y += 14;

    const footerH = 78;
    const rows = opts.rows.filter((r) => r.items.length) .length ? opts.rows : opts.rows;
    const avail = H - y - footerH - P;
    const gap = 14;
    const rowH = Math.max(96, Math.min(story ? 260 : 190, (avail - gap * (rows.length - 1)) / Math.max(1, rows.length)));

    // preload every poster once
    const imgs = await Promise.all(rows.map((r) => Promise.all(r.items.map((it) => loadImg(it.img)))));

    const labelW = 176;
    rows.forEach((row, ri) => {
      const top = y + ri * (rowH + gap);
      if (top + rowH > H - footerH - P + 8) return;

      // label block
      ctx.save();
      roundRect(ctx, P, top, labelW, rowH, 20);
      ctx.fillStyle = row.color; ctx.fill();
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.82)';
      ctx.textAlign = 'center';
      let fs = 40;
      ctx.font = `900 ${fs}px Archivo, system-ui, sans-serif`;
      while (fs > 18 && ctx.measureText(row.label).width > labelW - 24) { fs -= 2; ctx.font = `900 ${fs}px Archivo, system-ui, sans-serif`; }
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, P + labelW / 2, top + rowH / 2);
      ctx.restore();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';

      // posters
      const trackX = P + labelW + 14;
      const trackW = W - P - trackX;
      const ph = rowH - 18;
      const pw = Math.round(ph * (2 / 3));
      const step = pw + 10;
      const fits = Math.max(1, Math.floor((trackW + 10) / step));
      const items = row.items.slice(0, fits);
      const rest = row.items.length - items.length;

      ctx.save();
      roundRect(ctx, trackX, top, trackW, rowH, 20);
      ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fill();
      ctx.strokeStyle = 'rgba(239,248,255,.10)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();

      items.forEach((it, ii) => {
        const x = trackX + 12 + ii * step;
        const py = top + 9;
        ctx.save();
        roundRect(ctx, x, py, pw, ph, 10);
        ctx.clip();
        const im = imgs[ri][ii];
        if (im) {
          const s = Math.max(pw / im.width, ph / im.height);
          ctx.drawImage(im, x + (pw - im.width * s) / 2, py + (ph - im.height * s) / 2, im.width * s, im.height * s);
        } else {
          const g = ctx.createLinearGradient(x, py, x + pw, py + ph);
          g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,.05)');
          ctx.fillStyle = g; ctx.fillRect(x, py, pw, ph);
          ctx.fillStyle = 'rgba(239,248,255,.72)';
          ctx.font = '700 16px Archivo, system-ui, sans-serif';
          const words = String(it.title || '').split(' ');
          let line = '', ly = py + 12;
          words.forEach((w) => {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > pw - 16) { ctx.fillText(line, x + 8, ly); ly += 20; line = w; }
            else line = test;
          });
          if (line && ly < py + ph - 16) ctx.fillText(fitText(ctx, line, pw - 16), x + 8, ly);
        }
        ctx.restore();
      });
      if (rest > 0) {
        ctx.fillStyle = 'rgba(239,248,255,.5)';
        ctx.font = '700 24px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('+' + rest, W - P - 14, top + rowH / 2 - 12);
        ctx.textAlign = 'left';
      }
    });

    // footer
    ctx.fillStyle = 'rgba(239,248,255,.34)';
    ctx.font = '500 24px "JetBrains Mono", monospace';
    const stamp = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(stamp, P, H - P - 30);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.fillText(String(opts.brand || '').toUpperCase(), W - P, H - P - 30);
    ctx.textAlign = 'left';

    return cv;
  }

  async function shareBoardImage(opts) {
    const cv = await renderBoardImage(opts);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) { toast('No pude generar la imagen.', 'bad'); return; }
    const name = (opts.fileName || 'tier') .replace(/[^a-z0-9\-_]+/gi, '-').toLowerCase() + '.png';
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: opts.title }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'downloaded';
  }

  /** Format picker + preview, then share/download. */
  function openShareBoard(host, build) {
    let format = 'square';
    const el = host;
    const draw = (busy) => {
      el.innerHTML =
        `<div class="confirm__scrim" data-cancel></div><div class="confirm__card">` +
        `<div class="confirm__title">Compartir la tier</div>` +
        `<p class="confirm__text">Se arma una imagen limpia con las filas y las portadas. Si tu teléfono lo permite se abre el menú de compartir; si no, se descarga.</p>` +
        `<div class="shfmt">` +
        `<button class="shfmt__opt${format === 'square' ? ' is-on' : ''}" data-fmt="square"><span class="shfmt__box shfmt__box--sq"></span>Cuadrado<small>1080×1080 · feed</small></button>` +
        `<button class="shfmt__opt${format === 'story' ? ' is-on' : ''}" data-fmt="story"><span class="shfmt__box shfmt__box--st"></span>Story<small>1080×1920 · vertical</small></button>` +
        `</div>` +
        `<div class="confirm__actions"><button class="btn btn--soft" data-cancel>Cancelar</button>` +
        `<button class="btn btn--accent" data-go ${busy ? 'disabled' : ''}>${icon(busy ? 'hourglass_top' : 'ios_share')} ${busy ? 'Armando…' : 'Generar'}</button></div></div>`;
      el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => (el.hidden = true)));
      el.querySelectorAll('[data-fmt]').forEach((b) => b.addEventListener('click', () => { format = b.dataset.fmt; draw(); }));
      el.querySelector('[data-go]').addEventListener('click', async () => {
        draw(true);
        try {
          const res = await shareBoardImage({ ...build(), format });
          el.hidden = true;
          if (res === 'downloaded') toast('Imagen descargada ✓');
          else if (res === 'shared') toast('¡Compartida! ✓');
        } catch (e) {
          console.warn(e);
          el.hidden = true;
          toast('No pude generar la imagen.', 'bad');
        }
      });
    };
    draw();
    el.hidden = false;
  }

  return {
    icon, esc, toast,
    motion,
    rampAt, autoColor, tierRows, normalizeRows, newRowId, openRowEditor,
    accounts, activity, sha256, pinPad, DEFAULT_PIN,
    pickPhoto, pickBackground, openCropper, profileBackground, MAX_UPLOAD, MAX_GIF_UPLOAD,
    renderBoardImage, shareBoardImage, openShareBoard,
  };
})();
