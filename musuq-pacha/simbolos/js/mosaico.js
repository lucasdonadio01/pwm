/* MUSUQ PACHA · Símbolos — el mosaico de la portada.
   Una grilla de baldosas que cubre la pantalla; cada una es una instancia de
   Motor con su propio pueblo, su fondo y su figura. Cada tanda regenera una
   parte de las baldosas, así siempre hay algo cambiando pero nunca cambia todo
   de golpe. El morph es el mismo del mini juego porque es el mismo motor.
   Entre baldosa y baldosa queda aire: por ahí se ve el PixelBlast del fondo. */

const Mosaico = (() => {
  const LADO = 7;            // celdas por baldosa
  const AIRE = 9;            // px entre baldosas, por donde asoma el PixelBlast
  const CADA = 700;          // ms entre tandas
  const PORCION = 0.22;      // parte de las baldosas que cambia en cada tanda
  const CRUCE = 920;         // ms del cambio de color de fondo, igual que el viaje
  const CRECE = 0.16;        // cuanto se agranda la baldosa bajo el cursor
  const ENFRIA = 0.026;      // cuanto baja el calor por cuadro: es la cola del barrido
  // flores y mandalas se llevan la mayoria: son las que mas variantes tienen
  // y las que mejor leen a 7 celdas. Sin calaveras.
  const MENU = ['flor', 'flor', 'flor', 'flor', 'mandala', 'mandala', 'mandala',
                'mandala', 'trama', 'trama', 'demonio', 'abstracto'];

  let cv, ctx, bloque, baldosas = [], indice = new Map();
  let raton = { x: -1, y: -1 };
  let cols = 0, filas = 0, tam = 100, ox = 0, oy = 0;
  let hueco = { c0: 0, f0: 0, cw: 0, fh: 0 };
  let raf = 0, reloj = 0, vivo = false;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

  /* El repertorio de la portada es la paleta viva más todos los colores de los
     pueblos, sin repetidos. En el juego cada pueblo mantiene su paleta; acá lo
     que importa es que la combinación salte a la vista. */
  const POZO = (() => {
    const vistos = new Set(), lista = [];
    for (const c of PALETA_VIVA.concat(...PUEBLOS.map(p => p.colores))) {
      const k = c.h.toLowerCase();
      if (!vistos.has(k)) { vistos.add(k); lista.push(c); }
    }
    return lista;
  })();

  /* Fondo y figura se eligen complementarios: se puntúa cada candidato por la
     distancia de tono contra el fondo (180° es el complementario exacto) más la
     diferencia de luminancia, y se sortean tres entre los mejores. Se toman los
     mejores seis y no el primero para que no salga siempre la misma dupla. */
  function combinacion() {
    const fondo = POZO[Math.floor(Math.random() * POZO.length)];
    const lf = Motor.luz(fondo.h), tf = Motor.tono(fondo.h);
    const neutro = tf.s < 0.18;

    const puntaje = c => {
      const dl = Math.abs(Motor.luz(c.h) - lf);
      if (neutro || Motor.tono(c.h).s < 0.18) return dl * 2.2;   // sin tono útil: solo luz
      return (Motor.distanciaTono(c.h, fondo.h) / 180) * 1.5 + dl;
    };

    let candidatos = POZO.filter(c => c.h !== fondo.h && Math.abs(Motor.luz(c.h) - lf) > 0.13);
    if (candidatos.length < 3) candidatos = POZO.filter(c => c.h !== fondo.h);
    const mejores = candidatos
      .map(c => ({ c, p: puntaje(c) }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 6)
      .map(x => x.c);

    const colores = [];
    while (colores.length < 3 && mejores.length) {
      colores.push(mejores.splice(Math.floor(Math.random() * mejores.length), 1)[0]);
    }
    return { fondo: fondo.h, colores };
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
      const b = { c, f, motor: Motor.crear(LADO), cDe: [0, 0, 0], cA: [0, 0, 0], tf: 0, calor: 0 };
      const comb = combinacion();
      b.cDe = b.cA = Motor.aRgb(comb.fondo);
      b.tf = performance.now();
      b.motor.generar(performance.now() - CRUCE, null, comb.colores, MENU);
      baldosas.push(b);
    }
    indice = new Map(baldosas.map(b => [b.c + ',' + b.f, b]));
  }

  const baldosaEn = (px, py) => {
    if (px < 0 || py < 0) return null;
    return indice.get(Math.floor((px - ox) / tam) + ',' + Math.floor((py - oy) / tam)) || null;
  };

  function pintar(ahora) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const lado = tam - AIRE;
    const encima = baldosaEn(raton.x, raton.y);

    // El calor no cae solo en la baldosa de abajo del cursor: se reparte a las
    // vecinas segun la distancia, y por eso el conjunto se levanta como una ola.
    // Sube de golpe y baja despacio, asi un barrido deja estela.
    for (const b of baldosas) {
      let objetivo = 0;
      if (encima) {
        const d = Math.hypot(b.c - encima.c, b.f - encima.f);
        const cerca = Math.max(0, 1 - d / 2.6);
        objetivo = cerca * cerca;                  // caida marcada: el centro manda
      }
      b.calor = objetivo > b.calor
        ? b.calor + (objetivo - b.calor) * 0.30
        : Math.max(objetivo, b.calor - ENFRIA);
    }

    // las mas calientes se dibujan ultimas para que queden arriba de las vecinas
    const orden = baldosas.slice().sort((a, b) => a.calor - b.calor);
    for (const b of orden) {
      const escala = 1 + CRECE * b.calor;
      const l = lado * escala;
      const x = ox + b.c * tam + (lado - l) / 2;
      const y = oy + b.f * tam + (lado - l) / 2;
      const celda = l / (LADO + 2);           // una celda de margen a cada lado
      ctx.fillStyle = Motor.aHex(fondoActual(b, ahora));
      if (b.calor > 0.02) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,' + (0.22 * b.calor).toFixed(3) + ')';
        ctx.shadowBlur = 18 * b.calor;
        ctx.shadowOffsetY = 5 * b.calor;
        ctx.fillRect(x, y, l, l);
        ctx.restore();
      } else {
        ctx.fillRect(x, y, l, l);
      }
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
    // la que estás mirando no se toca: mientras tengas el cursor encima,
    // esa generación se queda quieta
    const libres = baldosas.filter(b => b.calor < 0.75);
    if (!libres.length) return;
    const cuantas = Math.max(1, Math.round(baldosas.length * PORCION));
    const elegidas = new Set();
    while (elegidas.size < Math.min(cuantas, libres.length)) elegidas.add(Math.floor(Math.random() * libres.length));
    // pequeño desfasaje adentro de la tanda: no arrancan todas en el mismo cuadro
    [...elegidas].forEach((i, n) => regenerar(libres[i], ahora + n * 26));
  }

  function iniciar(canvas, elBloque) {
    cv = canvas; bloque = elBloque; vivo = true;
    medir();
    addEventListener('resize', medir);
    cv.addEventListener('pointermove', e => { raton = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerleave', () => { raton = { x: -1, y: -1 }; });
    cv.addEventListener('pointerdown', e => {
      const b = baldosaEn(e.clientX, e.clientY);
      if (b) regenerar(b, performance.now());     // un click, una generación nueva
    });
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
