/* MUSUQ PACHA · Símbolos — el mosaico de la portada.
   Una grilla de baldosas que cubre la pantalla; cada una es una instancia de
   Motor con su propio pueblo, su fondo y su figura. Cada tanda regenera una
   parte de las baldosas, así siempre hay algo cambiando pero nunca cambia todo
   de golpe. El morph es el mismo del mini juego porque es el mismo motor.
   Entre baldosa y baldosa queda aire: por ahí se ve el PixelBlast del fondo. */

const Mosaico = (() => {
  const LADO = 7;            // celdas por baldosa
  const AIRE = 9;            // px entre baldosas, por donde asoma el PixelBlast
  const CADA = 950;          // ms entre tandas
  const PORCION = 0.22;      // parte de las baldosas que cambia en cada tanda
  const CRUCE = 920;         // ms del cambio de color de fondo, igual que el viaje
  // las tramas y los mandalas son los que mejor leen a 7 celdas, van repetidos
  // para que salgan mas seguido que las calaveras
  const MENU = ['trama', 'trama', 'trama', 'mandala', 'mandala', 'flor', 'flor',
                'animal', 'organico', 'calavera', 'demonio'];

  let cv, ctx, bloque, baldosas = [];
  let cols = 0, filas = 0, tam = 100, ox = 0, oy = 0;
  let hueco = { c0: 0, f0: 0, cw: 0, fh: 0 };
  let raf = 0, reloj = 0, vivo = false;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  /* Cada baldosa toma un pueblo entero: el fondo es uno de sus colores y la
     figura se pinta con los que contrastan contra ese fondo. Así cada cuadrado
     es una combinación que ese pueblo realmente usaba. */
  function combinacion() {
    const p = PUEBLOS[Math.floor(Math.random() * PUEBLOS.length)];
    const fondo = p.colores[Math.floor(Math.random() * p.colores.length)];
    const lf = Motor.luz(fondo.h);
    // se ordena por distancia de luminancia y se toman los tres que mas
    // contrastan: filtrar por umbral dejaba baldosas donde la figura no se veia
    const tinta = p.colores
      .filter(c => c.h !== fondo.h)
      .sort((a, b) => Math.abs(Motor.luz(b.h) - lf) - Math.abs(Motor.luz(a.h) - lf))
      .slice(0, 3);
    return { fondo: fondo.h, colores: tinta };
  }

  function fondoActual(b, ahora) {
    const u = Math.max(0, Math.min(1, (ahora - b.tf) / CRUCE));
    return Motor.mezcla(b.cDe, b.cA, Motor.suave(u));
  }

  function regenerar(b, cuando) {
    const c = combinacion();
    b.cDe = fondoActual(b, performance.now());
    b.cA = Motor.aRgb(c.fondo);
    b.tf = cuando;
    b.motor.generar(cuando, null, c.colores, MENU);
  }

  function medir() {
    const d = dpr();
    cv.width = Math.round(innerWidth * d);
    cv.height = Math.round(innerHeight * d);
    ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);

    // el mosaico no llega a los bordes: queda un marco por donde se ve el
    // PixelBlast moverse alrededor de las baldosas, como en la referencia
    const marco = Math.round(Math.min(innerWidth, innerHeight) * 0.055);
    const anchoUtil = innerWidth - marco * 2, altoUtil = innerHeight - marco * 2;
    const tentativo = Math.max(78, Math.min(132, Math.round(innerWidth / 13)));
    cols = Math.max(4, Math.round(anchoUtil / tentativo));
    filas = Math.max(3, Math.round(altoUtil / tentativo));
    tam = Math.min(anchoUtil / cols, altoUtil / filas);
    ox = (innerWidth - cols * tam) / 2;
    oy = (innerHeight - filas * tam) / 2;

    // el bloque del título ocupa baldosas enteras, como en la referencia
    hueco.cw = Math.max(3, Math.min(cols - 2, Math.round(cols * 0.36)));
    hueco.fh = Math.max(2, Math.min(filas - 2, Math.round(filas * 0.34)));
    hueco.c0 = Math.floor((cols - hueco.cw) / 2);
    hueco.f0 = Math.floor((filas - hueco.fh) / 2);

    if (bloque) {
      bloque.style.left = (ox + hueco.c0 * tam) + 'px';
      bloque.style.top = (oy + hueco.f0 * tam) + 'px';
      bloque.style.width = (hueco.cw * tam - AIRE) + 'px';
      bloque.style.height = (hueco.fh * tam - AIRE) + 'px';
    }
    armar();
  }

  const tapada = (c, f) =>
    c >= hueco.c0 && c < hueco.c0 + hueco.cw && f >= hueco.f0 && f < hueco.f0 + hueco.fh;

  function armar() {
    const previas = baldosas;
    baldosas = [];
    let i = 0;
    for (let f = 0; f < filas; f++) for (let c = 0; c < cols; c++) {
      if (tapada(c, f)) continue;
      const vieja = previas[i++];
      if (vieja) { vieja.c = c; vieja.f = f; baldosas.push(vieja); continue; }
      const b = { c, f, motor: Motor.crear(LADO), cDe: [0, 0, 0], cA: [0, 0, 0], tf: 0 };
      const comb = combinacion();
      b.cDe = b.cA = Motor.aRgb(comb.fondo);
      b.tf = performance.now();
      b.motor.generar(performance.now() - CRUCE, null, comb.colores, MENU);
      baldosas.push(b);
    }
  }

  function pintar(ahora) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const lado = tam - AIRE;
    const celda = lado / (LADO + 2);          // una celda de margen a cada lado
    for (const b of baldosas) {
      const x = ox + b.c * tam, y = oy + b.f * tam;
      if (x > innerWidth || y > innerHeight || x + lado < 0 || y + lado < 0) continue;
      ctx.fillStyle = Motor.aHex(fondoActual(b, ahora));
      ctx.fillRect(x, y, lado, lado);
      b.motor.dibujar(ctx, x + celda, y + celda, celda, ahora, {});
    }
  }

  function bucle(ahora) {
    if (!vivo) return;
    pintar(ahora);
    raf = requestAnimationFrame(bucle);
  }

  function tanda() {
    if (!vivo || !baldosas.length) return;
    const ahora = performance.now();
    const cuantas = Math.max(1, Math.round(baldosas.length * PORCION));
    const elegidas = new Set();
    while (elegidas.size < cuantas) elegidas.add(Math.floor(Math.random() * baldosas.length));
    // pequeño desfasaje adentro de la tanda: no arrancan todas en el mismo cuadro
    [...elegidas].forEach((i, n) => regenerar(baldosas[i], ahora + n * 26));
  }

  function iniciar(canvas, elBloque) {
    cv = canvas; bloque = elBloque; vivo = true;
    medir();
    addEventListener('resize', medir);
    raf = requestAnimationFrame(bucle);
    reloj = setInterval(tanda, CADA);
  }

  function detener() {
    vivo = false;
    cancelAnimationFrame(raf);
    clearInterval(reloj);
    removeEventListener('resize', medir);
    baldosas = [];
  }

  return { iniciar, detener, get baldosas() { return baldosas; } };
})();
