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
  let ciclando = true;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  /* ---------- paleta de la pagina ---------- */
  function aplicarFondo(hex) {
    fondo = hex;
    const [r, g, b] = Simbolo.aRgb(hex);
    const luz = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const claro = luz > 0.52;
    tinta = claro ? '#1B1A19' : '#F5F2EB';
    const t = Simbolo.aRgb(tinta);
    const raiz = document.documentElement.style;
    raiz.setProperty('--fondo', hex);
    raiz.setProperty('--tinta', tinta);
    raiz.setProperty('--velo', `rgba(${r},${g},${b},0.58)`);
    raiz.setProperty('--linea', `rgba(${t[0]},${t[1]},${t[2]},0.18)`);
    raiz.setProperty('--suave', `rgba(${t[0]},${t[1]},${t[2]},0.58)`);
    // el PixelBlast va apenas mas oscuro que el fondo (mas claro si el fondo es
    // oscuro). Delta fijo y no porcentual: sobre un fondo casi negro un 8 % no
    // se ve, y el contraste tiene que ser el mismo con cualquier color.
    Fondo.paleta(hex, Simbolo.aHex([r, g, b].map(v => v + (claro ? -22 : 24))));
    $('#colorFondo').value = hex;
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
        color = c.h;
        $('#colorLibre').value = c.h;
        $('#notaColor').textContent = c.n;
        // si hay celdas seleccionadas, el color va directo sobre ellas
        if (Simbolo.seleccion.size) Simbolo.recolorear(c.h);
        armarPaleta();
      });
      cont.appendChild(b);
    });
    $('#notaColor').textContent = (pueblo.colores.find(c => c.h === color) || {}).n || 'color libre';
  }

  function elegirPueblo(p) {
    pueblo = p;
    Simbolo.pueblo = p;
    color = p.colores[0].h;
    $('#colorLibre').value = color;
    aplicarFondo(p.fondo);
    armarPueblos();
    armarPaleta();
    Simbolo.generar(performance.now());
    ondaDesdeElSimbolo();
    avisar(p.nombre + ' · ' + p.bioma);
  }

  function avisar(txt) {
    estado.textContent = txt;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { if (estado.textContent === txt) estado.textContent = ''; }, 3200);
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
  $('#modos').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    modo = b.dataset.modo;
    [...$('#modos').children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (modo !== 'seleccion') Simbolo.seleccion.clear();
    lienzo.style.cursor = modo === 'seleccion' ? 'cell' : 'crosshair';
  });

  $('#colorLibre').addEventListener('input', e => {
    color = e.target.value;
    $('#notaColor').textContent = 'color libre';
    if (Simbolo.seleccion.size) Simbolo.recolorear(color);
    [...$('#paleta').children].forEach(b => b.setAttribute('aria-pressed', 'false'));
  });

  $('#colorFondo').addEventListener('input', e => aplicarFondo(e.target.value));

  $('#lado').addEventListener('change', e => {
    Simbolo.lado = +e.target.value;
    Simbolo.generar(performance.now());
    ondaDesdeElSimbolo();
  });

  $('#densidad').addEventListener('input', e => { Simbolo.densidad = +e.target.value / 100; });

  $('#generar').addEventListener('click', () => {
    Simbolo.generar(performance.now());
    ondaDesdeElSimbolo();
  });

  $('#limpiar').addEventListener('click', () => Simbolo.limpiar(performance.now()));

  addEventListener('keydown', e => {
    if (taller.hidden || e.metaKey || e.ctrlKey || /input|select/i.test(e.target.tagName)) return;
    if (e.key === 'g' || e.key === 'G') { Simbolo.generar(performance.now()); ondaDesdeElSimbolo(); }
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

  function bajar(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const nombreBase = () =>
    'musuq-pacha-' + pueblo.id + '-g' + String(Simbolo.generacion).padStart(2, '0');

  $('#png').addEventListener('click', () => {
    const r = lienzo.getBoundingClientRect();
    const W = 2000, H = Math.round(W * r.height / r.width);
    componerCuadro(W, H, performance.now()).toBlob(b => {
      bajar(b, nombreBase() + '.png');
      avisar('PNG guardado');
    }, 'image/png');
  });

  $('#gif').addEventListener('click', async e => {
    const boton = e.currentTarget;
    if (boton.disabled) return;
    boton.disabled = true;
    const r = lienzo.getBoundingClientRect();
    const W = 560, H = Math.round(W * r.height / r.width);
    const CUADROS = 30, CADA = 60;                 // 1,8 s a ~16 cuadros por segundo
    const cuadros = [];

    ondaDesdeElSimbolo();
    for (let i = 0; i < CUADROS; i++) {
      await esperar(CADA);
      const cv = componerCuadro(W, H, performance.now());
      cuadros.push(cv.getContext('2d').getImageData(0, 0, W, H).data);
      estado.textContent = 'grabando ' + Math.round((i + 1) / CUADROS * 100) + '%';
    }
    const blob = await GIF.codificar({
      cuadros, ancho: W, alto: H, retardo: Math.round(CADA / 10), colores: 128,
      alProgreso: (p, txt) => { estado.textContent = 'codificando · ' + txt; }
    });
    bajar(blob, nombreBase() + '.gif');
    avisar('GIF guardado · ' + Math.round(blob.size / 1024) + ' KB');
    boton.disabled = false;
  });

  /* ---------- portada ---------- */
  async function ciclarTitulo() {
    const el = $('#titulo');
    const textos = ['MUSUQ PACHA', 'TIEMPO NUEVO', 'MUNDO QUE VIENE'];
    let i = 0;
    while (ciclando) {
      await esperar(2900);
      if (!ciclando) break;
      i = (i + 1) % textos.length;
      await PixelSwap.texto(el, textos[i], { celda: 20, color: tinta });
    }
  }

  $('#entrar').addEventListener('click', async () => {
    ciclando = false;
    await PixelSwap.pantalla(async () => {
      portada.hidden = true;
      taller.hidden = false;
      Simbolo.generar(performance.now());
    }, { color: tinta });
    ondaDesdeElSimbolo();
    avisar('pintá, generá con G y descargá cuando te guste');
  });

  /* ---------- arranque ---------- */
  Simbolo.pueblo = pueblo;
  Simbolo.quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  aplicarFondo(pueblo.fondo);
  armarPueblos();
  armarPaleta();
  if (!Fondo.iniciar($('#fondo'))) $('#fondo').style.display = 'none';
  requestAnimationFrame(cuadro);
  ciclarTitulo();

  // gancho para inspeccionar desde la consola
  window.__mp = { Simbolo, Fondo, componerCuadro, get pueblo() { return pueblo; } };
})();
