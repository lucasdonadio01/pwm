/* MUSUQ PACHA · Símbolos — grilla, generacion y morph.
   El morph es el de species-in-pieces llevado a una grilla: cada pixel
   encendido conserva su identidad, se le asigna el destino mas cercano del
   simbolo nuevo y viaja hasta ahi con arco, escalonado y color interpolado.
   Los que sobran se achican a cero; los que faltan nacen del centro. */

const Simbolo = (() => {
  const VIAJE = 920;        // ms de viaje de cada pixel
  const ESCALON = 340;      // ms entre el primer pixel que sale y el ultimo
  const POP = 300;          // ms del pintado a mano

  let N = 9;                        // celdas por lado (impar)
  let grilla = new Map();           // "gx,gy" -> hex
  let pixeles = [];                 // objetos animados
  let t0 = 0, generacion = 0;
  let pueblo = PUEBLOS[0];
  let densidad = 0.45;
  let seleccion = new Set();
  let hover = null;
  let quieto = false;
  let geo = { celda: 40, x0: 0, y0: 0, W: 0, H: 0 };

  const aRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const aHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const oscurecer = (h, f) => aHex(aRgb(h).map(v => v * (1 - f)));

  /* easeInOutQuart: salida y llegada muy suaves, es lo que da el morph largo */
  const suave = t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

  const clave = (x, y) => x + ',' + y;
  const azar = a => a[Math.floor(Math.random() * a.length)];

  /* ---------- generacion con simetria espejo ---------- */
  function generarGrilla() {
    const mitad = (N + 1) >> 1;              // columnas 0..mitad-1, el resto se espeja
    const media = new Set();
    const dentro = (x, y) => x >= 0 && x < mitad && y >= 0 && y < N;

    // 1. tallo vertical sobre la columna central
    const alto = 3 + Math.floor(Math.random() * (N - 3));
    const desde = Math.max(0, Math.floor((N - alto) / 2) + (Math.random() < 0.5 ? 0 : 1));
    for (let y = desde; y < Math.min(N, desde + alto); y++) media.add(clave(mitad - 1, y));

    // 2. crecimiento por vecindad
    const meta = Math.max(6, Math.round(mitad * N * densidad));
    const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let vueltas = 0;
    while (media.size < meta && vueltas++ < 900) {
      const [cx, cy] = azar([...media]).split(',').map(Number);
      const [dx, dy] = azar(vecinos);
      if (dentro(cx + dx, cy + dy)) media.add(clave(cx + dx, cy + dy));
    }

    // 3. brazos horizontales: le dan la lectura de emblema
    for (let i = 0, brazos = 1 + Math.floor(Math.random() * 2); i < brazos; i++) {
      const y = Math.floor(Math.random() * N);
      const largo = 2 + Math.floor(Math.random() * (mitad - 1));
      for (let x = mitad - largo; x < mitad; x++) if (dentro(x, y)) media.add(clave(x, y));
    }

    // 4. huecos: el negativo tambien dibuja
    for (let i = 0, huecos = Math.floor(Math.random() * 4); i < huecos; i++) {
      const rodeados = [...media].filter(k => {
        const [x, y] = k.split(',').map(Number);
        return vecinos.every(([dx, dy]) => media.has(clave(x + dx, y + dy)));
      });
      if (rodeados.length) media.delete(azar(rodeados));
    }

    // 5. color en manchas de 2x2, resuelto sobre la media grilla para que el espejo lo copie
    const paleta = pueblo.colores;
    const dominante = Math.floor(Math.random() * Math.min(3, paleta.length));
    const semilla = Math.random() * 999;
    const nueva = new Map();
    for (const k of media) {
      const [x, y] = k.split(',').map(Number);
      const r = Math.abs(Math.sin(Math.floor(x / 2) * 7.13 + Math.floor(y / 2) * 3.71 + semilla) * 43758.5453) % 1;
      const idx = r > 0.55 ? Math.floor(r * paleta.length) % paleta.length : dominante;
      nueva.set(clave(x, y), paleta[idx].h);
      nueva.set(clave(N - 1 - x, y), paleta[idx].h);            // espejo
    }
    return nueva;
  }

  /* ---------- asignacion de destinos: el corazon del morph ---------- */
  function morphA(nueva, ahora) {
    const destinos = [...nueva].map(([k, hex]) => {
      const [gx, gy] = k.split(',').map(Number);
      return { gx, gy, hex, tomado: false };
    });

    // emparejado voraz por cercania: cada pixel vivo se queda con el destino
    // libre mas cercano, asi el que ya estaba en su lugar casi no se mueve
    const vivos = pixeles.filter(p => p.sA > 0);
    const pares = [];
    vivos.forEach((p, i) => destinos.forEach((d, j) => {
      pares.push([Math.hypot(p.bx - d.gx, p.by - d.gy), i, j]);
    }));
    pares.sort((a, b) => a[0] - b[0]);

    const usadoP = new Set(), usadoD = new Set(), asign = new Map();
    for (const [, i, j] of pares) {
      if (usadoP.has(i) || usadoD.has(j)) continue;
      usadoP.add(i); usadoD.add(j); asign.set(i, j);
      if (usadoP.size === vivos.length || usadoD.size === destinos.length) break;
    }

    const c = (N - 1) / 2;
    const maxDist = Math.hypot(c, c) || 1;
    const nuevos = [];

    vivos.forEach((p, i) => {
      const e = leer(p, ahora);
      const base = {
        ax: e.x, ay: e.y, cDe: e.color, sDe: e.s, t0: ahora,
        dur: VIAJE, giro: (Math.random() - 0.5) * 0.5, arco: (Math.random() - 0.5) * 0.9
      };
      if (asign.has(i)) {
        const d = destinos[asign.get(i)];
        d.tomado = true;
        nuevos.push(Object.assign(base, {
          gx: d.gx, gy: d.gy, bx: d.gx, by: d.gy, hex: d.hex,
          cA: aRgb(d.hex), sA: 1,
          delay: (Math.hypot(d.gx - c, d.gy - c) / maxDist) * ESCALON + Math.random() * 60
        }));
      } else {
        // sin destino: se va hacia afuera achicandose
        nuevos.push(Object.assign(base, {
          gx: p.gx, gy: p.gy, hex: p.hex,
          bx: p.bx + (p.bx - c) * 0.3, by: p.by + (p.by - c) * 0.3,
          cA: e.color, sA: 0, dur: VIAJE * 0.7, delay: Math.random() * 120
        }));
      }
    });

    destinos.filter(d => !d.tomado).forEach(d => {
      // sin origen: nace desde el centro de la grilla
      const dist = Math.hypot(d.gx - c, d.gy - c);
      nuevos.push({
        gx: d.gx, gy: d.gy, hex: d.hex, t0: ahora,
        ax: c + (d.gx - c) * 0.35, ay: c + (d.gy - c) * 0.35, bx: d.gx, by: d.gy,
        cDe: aRgb(d.hex), cA: aRgb(d.hex), sDe: 0, sA: 1,
        delay: (dist / maxDist) * ESCALON + 90 + Math.random() * 80,
        dur: VIAJE, arco: (Math.random() - 0.5) * 0.6, giro: (Math.random() - 0.5) * 0.6
      });
    });

    pixeles = nuevos;
    grilla = nueva;
    t0 = ahora;
    seleccion.clear();
  }

  /* ---------- estado animado de un pixel ---------- */
  function leer(p, ahora) {
    let u = quieto ? 1 : (ahora - p.t0 - p.delay) / p.dur;
    u = Math.max(0, Math.min(1, u));
    const e = suave(u);
    const dx = p.bx - p.ax, dy = p.by - p.ay;
    const largo = Math.hypot(dx, dy) || 1;
    const curva = Math.sin(Math.PI * u) * p.arco;
    return {
      x: p.ax + dx * e + (-dy / largo) * curva,
      y: p.ay + dy * e + (dx / largo) * curva,
      s: (p.sDe + (p.sA - p.sDe) * e) * (1 - 0.16 * Math.sin(Math.PI * u)),
      rot: p.giro * Math.sin(Math.PI * u),
      color: mezcla(p.cDe, p.cA, e),
      u
    };
  }

  /* ---------- pintado a mano ---------- */
  const pixelEn = (gx, gy) => pixeles.find(p => p.gx === gx && p.gy === gy && p.sA > 0);

  const espejadas = (gx, gy, espejo) =>
    espejo && gx !== N - 1 - gx ? [[gx, gy], [N - 1 - gx, gy]] : [[gx, gy]];

  function pintar(gx, gy, hex, espejo) {
    const ahora = performance.now();
    for (const [x, y] of espejadas(gx, gy, espejo)) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const p = pixelEn(x, y);
      if (!p) {
        pixeles.push({
          gx: x, gy: y, hex, ax: x, ay: y, bx: x, by: y,
          cDe: aRgb(hex), cA: aRgb(hex), sDe: 0, sA: 1,
          delay: 0, dur: POP, arco: 0, giro: 0, t0: ahora
        });
      } else if (p.hex !== hex) {
        const e = leer(p, ahora);
        Object.assign(p, {
          hex, cDe: e.color, cA: aRgb(hex), sDe: e.s, sA: 1,
          ax: e.x, ay: e.y, bx: x, by: y, delay: 0, dur: 260, t0: ahora, arco: 0, giro: 0
        });
      }
      grilla.set(clave(x, y), hex);
    }
  }

  function borrar(gx, gy, espejo) {
    const ahora = performance.now();
    for (const [x, y] of espejadas(gx, gy, espejo)) {
      const p = pixelEn(x, y);
      if (!p) continue;
      const e = leer(p, ahora);
      Object.assign(p, {
        cDe: e.color, cA: e.color, sDe: e.s, sA: 0,
        ax: e.x, ay: e.y, bx: x, by: y, delay: 0, dur: 240, t0: ahora, arco: 0, giro: 0
      });
      grilla.delete(clave(x, y));
      seleccion.delete(clave(x, y));
    }
  }

  /* ---------- dibujo ---------- */
  function medirGeo(W, H) {
    const celda = Math.min(W * 0.38, H * 0.66) / N;
    geo = { celda, x0: W / 2 - N * celda / 2, y0: H / 2 - N * celda / 2, W, H };
    return geo;
  }

  function envolver(ctx, texto, ancho) {
    const lineas = [];
    let linea = '';
    for (const palabra of texto.split(' ')) {
      const prueba = linea ? linea + ' ' + palabra : palabra;
      if (ctx.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = palabra; }
      else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas;
  }

  /* Dibuja la composicion entera: la misma funcion sirve para la pantalla,
     para el PNG y para cada cuadro del GIF. Devuelve true si algo sigue animando. */
  function componer(ctx, W, H, ahora, opc) {
    const o = opc || {};
    const g = medirGeo(W, H);
    const tinta = o.tinta || '#1B1A19';

    if (o.fondo) { ctx.fillStyle = o.fondo; ctx.fillRect(0, 0, W, H); }

    // 1. la grilla de puntos: el campo de pixeles posibles
    if (o.puntos !== false) {
      ctx.fillStyle = 'rgba(' + aRgb(tinta).join(',') + ',0.17)';
      const r = Math.max(0.9, g.celda * 0.028);
      const dx = ((g.x0 + g.celda / 2) % g.celda + g.celda) % g.celda;
      const dy = ((g.y0 + g.celda / 2) % g.celda + g.celda) % g.celda;
      for (let x = dx; x < W; x += g.celda) {
        for (let y = dy; y < H; y += g.celda) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    // 2. los pixeles del simbolo
    let animando = false;
    for (const p of pixeles) {
      const e = leer(p, ahora);
      if (e.u < 1) animando = true;
      if (e.s <= 0.001) continue;
      const lado = g.celda * e.s;
      ctx.save();
      ctx.translate(g.x0 + (e.x + 0.5) * g.celda, g.y0 + (e.y + 0.5) * g.celda);
      if (e.rot) ctx.rotate(e.rot * (1 - e.u));
      ctx.fillStyle = aHex(e.color);
      ctx.fillRect(-lado / 2, -lado / 2, lado + 0.5, lado + 0.5);
      ctx.restore();
    }
    if (!animando) pixeles = pixeles.filter(p => p.sA > 0);

    // 3. seleccion y cursor, solo en pantalla
    if (o.interfaz) {
      ctx.lineWidth = Math.max(1.5, g.celda * 0.05);
      ctx.strokeStyle = tinta;
      for (const k of seleccion) {
        const [x, y] = k.split(',').map(Number);
        ctx.strokeRect(g.x0 + x * g.celda + 2, g.y0 + y * g.celda + 2, g.celda - 4, g.celda - 4);
      }
      if (hover) {
        ctx.strokeStyle = 'rgba(' + aRgb(tinta).join(',') + ',0.34)';
        ctx.lineWidth = 1;
        ctx.strokeRect(g.x0 + hover[0] * g.celda + 0.5, g.y0 + hover[1] * g.celda + 0.5, g.celda - 1, g.celda - 1);
      }
    }

    // 4. las volantas, como en las referencias
    if (o.textos !== false) {
      const cuerpo = Math.max(11, W * 0.0145);
      const salto = cuerpo * 1.5;
      ctx.fillStyle = tinta;
      ctx.textBaseline = 'alphabetic';

      ctx.textAlign = 'left';
      ctx.font = '500 ' + cuerpo + 'px "Space Grotesk", system-ui, sans-serif';
      ctx.fillText(pueblo.nombre, W * 0.06, H / 2 - salto * 0.2);
      ctx.font = '300 ' + cuerpo + 'px "Space Grotesk", system-ui, sans-serif';
      ctx.globalAlpha = 0.6;
      ctx.fillText(pueblo.region, W * 0.06, H / 2 + salto * 0.8);
      ctx.fillText('generación ' + String(generacion).padStart(2, '0'), W * 0.06, H / 2 + salto * 1.8);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'right';
      const usados = [...new Set(grilla.values())]
        .map(h => (pueblo.colores.find(c => c.h.toLowerCase() === h.toLowerCase()) || {}).n || h)
        .slice(0, 6);
      const texto = pueblo.nota + ': ' + (usados.join(', ') || 'lienzo vacío');
      const lineas = envolver(ctx, texto, W * 0.21);
      const inicio = H / 2 - ((lineas.length - 1) * salto) / 2;
      lineas.forEach((l, i) => ctx.fillText(l, W * 0.94, inicio + i * salto));
    }

    return animando;
  }

  function celdaEn(px, py) {
    const gx = Math.floor((px - geo.x0) / geo.celda);
    const gy = Math.floor((py - geo.y0) / geo.celda);
    return (gx >= 0 && gy >= 0 && gx < N && gy < N) ? [gx, gy] : null;
  }

  return {
    generar(ahora) { generacion++; morphA(generarGrilla(), ahora); },
    limpiar(ahora) { morphA(new Map(), ahora); },
    componer, celdaEn, pintar, borrar, pixelEn, oscurecer, aRgb, aHex,
    recolorear(hex) {
      for (const k of [...seleccion]) {
        const [x, y] = k.split(',').map(Number);
        if (grilla.has(k)) pintar(x, y, hex, false);
      }
    },
    alternarSeleccion(gx, gy, espejo) {
      for (const [x, y] of espejadas(gx, gy, espejo)) {
        const k = clave(x, y);
        if (!grilla.has(k)) continue;
        seleccion.has(k) ? seleccion.delete(k) : seleccion.add(k);
      }
    },
    seleccionar(gx, gy, espejo) {
      for (const [x, y] of espejadas(gx, gy, espejo)) {
        if (grilla.has(clave(x, y))) seleccion.add(clave(x, y));
      }
    },
    get lado() { return N; },
    set lado(v) { N = v; },
    get pueblo() { return pueblo; },
    set pueblo(p) { pueblo = p; },
    get densidad() { return densidad; },
    set densidad(v) { densidad = v; },
    get generacion() { return generacion; },
    get grilla() { return grilla; },
    get seleccion() { return seleccion; },
    get geo() { return geo; },
    get hover() { return hover; },
    set hover(h) { hover = h; },
    set quieto(q) { quieto = q; }
  };
})();
