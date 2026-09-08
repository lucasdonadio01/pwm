/* MUSUQ PACHA · Símbolos — cableado de la interfaz. */

(() => {
  const $ = s => document.querySelector(s);
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  const portada = $('#portada'), taller = $('#taller'), lienzo = $('#lienzo');
  const ctx = lienzo.getContext('2d');
  const estado = $('#estado');

  let pueblo = PUEBLOS[0];
  let modo = 'pincel';
  let color = pueblo.colores[0].h;
  let fondo = pueblo.fondo;
  let tinta = '#1B1A19';
  let pintando = false;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const mezcla = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  /* ---------- paleta de la pagina ---------- */
  function aplicarFondo(hex) {
    fondo = hex;
    const rgb = Simbolo.aRgb(hex);
    const luz = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    const claro = luz > 0.52;
    tinta = claro ? '#1B1A19' : '#F5F2EB';
    const t = Simbolo.aRgb(tinta);
    const raiz = document.documentElement.style;
    raiz.setProperty('--fondo', hex);
    raiz.setProperty('--tinta', tinta);
    raiz.setProperty('--velo', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.58)`);
    raiz.setProperty('--linea', `rgba(${t[0]},${t[1]},${t[2]},0.18)`);
    raiz.setProperty('--suave', `rgba(${t[0]},${t[1]},${t[2]},0.58)`);
    // Los puntos del fondo se mezclan hacia el negro o el blanco, nunca con un
    // delta: sobre un rojo pleno sumar 24 no cambia nada y desaparecian.
    Fondo.paleta(hex, Simbolo.aHex(mezcla(rgb, claro ? [0, 0, 0] : [255, 255, 255], claro ? 0.16 : 0.22)));
    $('#colorFondo').value = hex;
    if (!taller.hidden) dibujarMapa();
  }

  /* ---------- mapa del territorio ---------- */
  function dibujarMapa() {
    const cv = $('#mapa'), paso = 5, d = dpr();
    const cols = MAPA.cols, filas = MAPA.filas.length;
    cv.style.width = (cols * paso) + 'px';
    cv.style.height = (filas * paso) + 'px';
    cv.width = Math.round(cols * paso * d);
    cv.height = Math.round(filas * paso * d);
    const c = cv.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, cols * paso, filas * paso);

    const marca = String(MAPA.orden.indexOf(pueblo.id) + 1);
    const t = Simbolo.aRgb(tinta);
    const apagado = `rgba(${t[0]},${t[1]},${t[2]},0.20)`;
    MAPA.filas.forEach((fila, y) => {
      for (let x = 0; x < fila.length; x++) {
        if (fila[x] === '.') continue;
        c.fillStyle = fila[x] === marca ? pueblo.colores[0].h : apagado;
        c.fillRect(x * paso, y * paso, paso - 1.3, paso - 1.3);
      }
    });
    $('#mapaPie').textContent = pueblo.bioma;
  }

  /* ---------- listas y paleta ---------- */
  function armarPueblos() {
    const ul = $('#listaPueblos');
    ul.innerHTML = '';
    PUEBLOS.forEach(p => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(p.id === pueblo.id));
      b.innerHTML = `<span class="muestra" style="background:${p.colores[0].h}"></span>
                     <span><b>${p.nombre}</b><i>${p.region}</i></span>`;
      b.addEventListener('click', () => elegirPueblo(p));
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function armarPaleta() {
    const cont = $('#paleta');
    cont.innerHTML = '';
    pueblo.colores.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.background = c.h;
      b.title = c.n;
      b.setAttribute('aria-pressed', String(c.h === color));
      b.addEventListener('click', () => {
        elegirColor(c.h, c.n);
        if (Simbolo.seleccion.size) Simbolo.recolorear(c.h);
      });
      cont.appendChild(b);
    });
    $('#notaColor').textContent = (pueblo.colores.find(c => c.h === color) || {}).n || 'color libre';
  }

  function elegirColor(hex, nombre) {
    color = hex;
    $('#colorLibre').value = hex;
    $('#notaColor').textContent = nombre || 'color libre';
    [...$('#paleta').children].forEach(b => b.setAttribute('aria-pressed', String(b.style.background === hex || b.title === nombre)));
  }

  function elegirPueblo(p) {
    pueblo = p;
    Simbolo.pueblo = p;
    elegirColor(p.colores[0].h, p.colores[0].n);
    aplicarFondo(p.fondo);
    armarPueblos();
    armarPaleta();
    dibujarMapa();
    generar();
    avisar(p.nombre + ' · ' + p.bioma);
  }

  function avisar(txt) {
    estado.textContent = txt;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { if (estado.textContent === txt) estado.textContent = ''; }, 3600);
  }

  /* ---------- bucle de dibujo ---------- */
  function cuadro(ahora) {
    const r = lienzo.getBoundingClientRect();
    const d = dpr();
    const w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (lienzo.width !== w || lienzo.height !== h) { lienzo.width = w; lienzo.height = h; }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    Simbolo.componer(ctx, r.width, r.height, ahora, { interfaz: true, tinta });
    requestAnimationFrame(cuadro);
  }

  function ondaDesdeElSimbolo() {
    const r = lienzo.getBoundingClientRect();
    Fondo.onda(r.left + r.width / 2, r.top + r.height / 2);
  }

  function generar(semilla) {
    Simbolo.generar(performance.now(), semilla);
    $('#semilla').textContent = 'semilla ' + Simbolo.firmaSemilla;
    ondaDesdeElSimbolo();
  }

  /* ---------- pintar sobre la grilla ---------- */
  function celdaDe(e) {
    const r = lienzo.getBoundingClientRect();
    return Simbolo.celdaEn(e.clientX - r.left, e.clientY - r.top);
  }

  function actuar(e, primero) {
    const c = celdaDe(e);
    if (!c) return;
    const espejo = $('#espejo').checked;
    if (modo === 'pincel') Simbolo.pintar(c[0], c[1], color, espejo);
    else if (modo === 'borrador') Simbolo.borrar(c[0], c[1], espejo);
    else if (modo === 'cuentagotas') {
      const hex = Simbolo.grilla.get(c[0] + ',' + c[1]);
      if (!hex || !primero) return;
      const nombre = (pueblo.colores.find(x => x.h.toLowerCase() === hex.toLowerCase()) || {}).n;
      elegirColor(hex, nombre);
      avisar('color copiado · ' + (nombre || hex));
    }
    else if (primero) Simbolo.alternarSeleccion(c[0], c[1], espejo);
    else Simbolo.seleccionar(c[0], c[1], espejo);
  }

  lienzo.addEventListener('pointerdown', e => {
    pintando = true;
    actuar(e, true);
    // el capture va despues y protegido: si el puntero ya no esta activo tira
    try { lienzo.setPointerCapture(e.pointerId); } catch (_) { /* sin captura, igual pinta */ }
  });
  lienzo.addEventListener('pointermove', e => {
    Simbolo.hover = celdaDe(e);
    if (pintando) actuar(e, false);
  });
  ['pointerup', 'pointercancel'].forEach(ev => lienzo.addEventListener(ev, () => { pintando = false; }));
  lienzo.addEventListener('pointerleave', () => { Simbolo.hover = null; });

  /* ---------- controles ---------- */
  function elegirModo(m) {
    modo = m;
    [...$('#modos').children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modo === m)));
    if (m !== 'seleccion') Simbolo.seleccion.clear();
    lienzo.style.cursor = m === 'seleccion' ? 'cell' : m === 'cuentagotas' ? 'copy' : 'crosshair';
  }

  $('#modos').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) elegirModo(b.dataset.modo);
  });

  $('#colorLibre').addEventListener('input', e => {
    elegirColor(e.target.value, null);
    if (Simbolo.seleccion.size) Simbolo.recolorear(color);
  });

  $('#colorFondo').addEventListener('input', e => aplicarFondo(e.target.value));

  $('#lado').addEventListener('change', e => { Simbolo.lado = +e.target.value; generar(); });
  $('#generar').addEventListener('click', () => generar());
  $('#limpiar').addEventListener('click', () => Simbolo.limpiar(performance.now()));

  const TECLAS = { q: 'pincel', w: 'borrador', e: 'seleccion', i: 'cuentagotas' };
  addEventListener('keydown', e => {
    if (taller.hidden || e.metaKey || e.ctrlKey || e.altKey || /input|select|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (TECLAS[k]) { elegirModo(TECLAS[k]); avisar(TECLAS[k]); }
    if (k === 'g') generar();
    if (e.key === 'Escape') Simbolo.seleccion.clear();
  });

  /* ---------- exportar ---------- */
  function componerCuadro(W, H, ahora) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const r = lienzo.getBoundingClientRect();
    const d = dpr();
    c.fillStyle = fondo;
    c.fillRect(0, 0, W, H);
    try {
      // recorto del canvas WebGL justo la ventana que ocupa el lienzo
      c.drawImage(Fondo.lienzo, r.left * d, r.top * d, r.width * d, r.height * d, 0, 0, W, H);
    } catch (err) { /* sin WebGL queda el fondo plano */ }
    const escala = W / r.width;
    c.setTransform(escala, 0, 0, escala, 0, 0);
    Simbolo.componer(c, r.width, r.height, ahora, { interfaz: false, tinta });
    return cv;
  }

  $('#png').addEventListener('click', () => {
    const r = lienzo.getBoundingClientRect();
    const W = 2000, H = Math.round(W * r.height / r.width);
    componerCuadro(W, H, performance.now()).toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'musuq-pacha-' + pueblo.id + '-' + Simbolo.firmaSemilla + '.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      avisar('PNG guardado');
    }, 'image/png');
  });

  /* ---------- portada ---------- */
  async function entrar() {
    await PixelSwap.pantalla(async () => {
      portada.hidden = true;
      taller.hidden = false;
      dibujarMapa();
      generar();
    }, { color: tinta });
    ondaDesdeElSimbolo();
    avisar('pintá con Q, borrá con W, seleccioná con E · G genera');
  }

  /* Contador de carga: 4 segundos, con la cuenta desacelerando al final.
     Va por setInterval y no por rAF para que no se frene si la pestaña
     pierde el foco justo en la entrada. */
  function cargar() {
    const el = $('#carga'), arranque = performance.now(), dura = 4000;
    const reloj = setInterval(() => {
      const u = Math.min(1, (performance.now() - arranque) / dura);
      el.textContent = Math.round(100 * (1 - Math.pow(1 - u, 1.7)));
      if (u >= 1) { clearInterval(reloj); entrar(); }
    }, 45);
  }

  /* ---------- arranque ---------- */
  Simbolo.pueblo = pueblo;
  Simbolo.quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  aplicarFondo(pueblo.fondo);
  armarPueblos();
  armarPaleta();
  if (!Fondo.iniciar($('#fondo'))) $('#fondo').style.display = 'none';
  requestAnimationFrame(cuadro);
  cargar();

  // gancho para inspeccionar desde la consola
  window.__mp = { Simbolo, Fondo, componerCuadro, entrar, get pueblo() { return pueblo; } };
})();
