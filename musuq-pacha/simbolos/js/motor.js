/* MUSUQ PACHA · Símbolos — motor de figura y morph.
   Una instancia por figura: el mini juego usa una, y la portada usa una por
   cada baldosa del mosaico. Todo lo que se comparte vive acá — las familias de
   patrones, la semilla y el morph de pixeles que viajan — para que la portada y
   el juego no puedan quedar con dos efectos distintos. */

const Motor = (() => {
  const VIAJE = 920;        // ms de viaje de cada pixel
  const ESCALON = 340;      // ms entre el primer pixel que sale y el ultimo
  const POP = 300;          // ms del pintado a mano

  const aRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const aHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mezcla = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const oscurecer = (h, f) => aHex(aRgb(h).map(v => v * (1 - f)));
  const luz = h => { const c = aRgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };

  /* Tono y saturación, para poder pedir complementarios. Un color casi gris no
     tiene tono útil: eso lo marca la saturación baja y quien decide se maneja
     solo con la luminancia. */
  function tono(hex) {
    const [r, g, b] = aRgb(hex).map(v => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return { h: 0, s: 0 };
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: d / max };
  }

  /* Distancia de tono en grados, 0 a 180: 180 es el complementario exacto */
  function distanciaTono(a, b) {
    const d = Math.abs(tono(a).h - tono(b).h);
    return d > 180 ? 360 - d : d;
  }

  /* easeInOutQuart: salida y llegada muy suaves, es lo que da el morph largo */
  const suave = t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

  const clave = (x, y) => x + ',' + y;

  const espejar = (celdas, N) => {
    const s = new Set();
    for (const k of celdas) {
      const [x, y] = k.split(',').map(Number);
      s.add(clave(x, y));
      s.add(clave(N - 1 - x, y));
    }
    return s;
  };

  /* mulberry32: la semilla hace que un simbolo se pueda volver a generar igual,
     y es lo que se muestra abajo del nombre del pueblo como firma unica */
  function dado(semilla) {
    let a = semilla >>> 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const firma = n => {
    const h = (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
    return h.slice(0, 4) + '-' + h.slice(4);
  };

  /* ---------- familias de patrones ----------
     Todas reciben (R, N) y devuelven un Set de "x,y". Al no depender de
     ninguna variable de instancia, sirven igual para el lienzo de 11 del juego
     y para las baldosas de 7 de la portada. */

  function organico(R, N) {
    const mitad = (N + 1) >> 1, media = new Set();
    const enMedia = (x, y) => x >= 0 && x < mitad && y >= 0 && y < N;
    const alto = 3 + Math.floor(R() * (N - 3));
    const desde = Math.max(0, Math.floor((N - alto) / 2));
    for (let y = desde; y < Math.min(N, desde + alto); y++) media.add(clave(mitad - 1, y));

    const meta = Math.max(6, Math.round(mitad * N * 0.45));
    const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let vueltas = 0;
    while (media.size < meta && vueltas++ < 900) {
      const lista = [...media];
      const [cx, cy] = lista[Math.floor(R() * lista.length)].split(',').map(Number);
      const [dx, dy] = vecinos[Math.floor(R() * 4)];
      if (enMedia(cx + dx, cy + dy)) media.add(clave(cx + dx, cy + dy));
    }
    for (let i = 0, brazos = 1 + Math.floor(R() * 2); i < brazos; i++) {
      const y = Math.floor(R() * N), largo = 2 + Math.floor(R() * (mitad - 1));
      for (let x = mitad - largo; x < mitad; x++) if (enMedia(x, y)) media.add(clave(x, y));
    }
    for (let i = 0, huecos = Math.floor(R() * 4); i < huecos; i++) {
      const rodeados = [...media].filter(k => {
        const [x, y] = k.split(',').map(Number);
        return vecinos.every(([dx, dy]) => media.has(clave(x + dx, y + dy)));
      });
      if (rodeados.length) media.delete(rodeados[Math.floor(R() * rodeados.length)]);
    }
    const s = new Set();
    for (const k of media) {
      const [x, y] = k.split(',').map(Number);
      s.add(clave(x, y)); s.add(clave(N - 1 - x, y));
    }
    return s;
  }

  /* Un lienzo con las primitivas que usan las flores y los mandalas: poner una
     celda redondeando, tirar un rayo desde el centro, un disco y un anillo. */
  function lienzo(N) {
    const s = new Set(), c = (N - 1) / 2;
    const poner = (x, y) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && y >= 0 && x < N && y < N) s.add(clave(x, y));
    };
    const rayo = (ang, desde, hasta, cx, cy) => {
      for (let r = desde; r <= hasta; r += 0.45)
        poner((cx == null ? c : cx) + Math.cos(ang) * r, (cy == null ? c : cy) + Math.sin(ang) * r);
    };
    const disco = (cx, cy, rad) => {
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
        for (let x = Math.floor(cx - rad); x <= cx + rad; x++)
          if (Math.hypot(x - cx, y - cy) <= rad + 0.15) poner(x, y);
    };
    const anillo = (rad, paso) => {
      for (let a = 0; a < Math.PI * 2; a += paso) poner(c + Math.cos(a) * rad, c + Math.sin(a) * rad);
    };
    return { s, c, poner, rayo, disco, anillo };
  }

  /* ---------- flores ----------
     Ocho especies. Es la familia que mas sale, asi que la variedad tiene que
     estar acá adentro y no depender del sorteo de familias. */

  function margarita(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const petalos = [5, 6, 8, 10][Math.floor(R() * 4)];
    const nucleo = R() < 0.5 ? 0.9 : 1.5;
    L.disco(L.c, L.c, nucleo);
    for (let i = 0; i < petalos; i++)
      L.rayo(-Math.PI / 2 + i * 2 * Math.PI / petalos, nucleo + 0.8, radio);
    return L.s;
  }

  function girasol(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const centro = Math.max(1, radio - 2 + (R() < 0.5 ? 0 : 1));
    L.disco(L.c, L.c, centro);
    const petalos = 8 + Math.floor(R() * 5);
    for (let i = 0; i < petalos; i++)
      L.rayo(-Math.PI / 2 + i * 2 * Math.PI / petalos, centro + 0.6, radio);
    return L.s;
  }

  function estrella(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const puntas = [4, 5, 6, 8][Math.floor(R() * 4)];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - L.c, dy = y - L.c, r = Math.hypot(dx, dy);
      if (r > radio + 0.3) continue;
      const punta = Math.max(0, Math.cos((Math.atan2(dy, dx) + Math.PI / 2) * puntas));
      if (r <= radio * (0.32 + 0.68 * Math.pow(punta, 0.55)) + 0.25) L.poner(x, y);
    }
    return L.s;
  }

  function trebol(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const hojas = [3, 4, 6][Math.floor(R() * 3)];
    const rad = Math.max(1, Math.round(radio * 0.46));
    const dist = radio - rad + 0.15;
    for (let i = 0; i < hojas; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / hojas;
      L.disco(L.c + Math.cos(a) * dist, L.c + Math.sin(a) * dist, rad);
    }
    if (R() < 0.6) L.disco(L.c, L.c, 0.9);
    return L.s;
  }

  function anillos(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    L.disco(L.c, L.c, R() < 0.5 ? 0.6 : 1.4);
    const salto = R() < 0.5 ? 1 : 2;
    for (let r = 2; r <= radio; r += salto) {
      // el anillo punteado solo en grillas grandes: a 7 celdas queda salpicado
      const cortado = N >= 9 && R() < 0.25;
      L.anillo(r, Math.PI / (r * (cortado ? 1.8 : 4)));
    }
    return L.s;
  }

  function capullo(R, N) {
    const L = lienzo(N), c = L.c;
    const alto = Math.max(2, Math.round(N * 0.34));
    const ancho = Math.max(1, Math.round(N * 0.27));
    for (let y = c - alto; y <= c + 1; y++)
      for (let x = c - ancho; x <= c + ancho; x++) {
        const dy = (y - c) / alto, dx = (x - c) / ancho;
        if (dx * dx + dy * dy <= 1.06) L.poner(x, y);
      }
    if (R() < 0.6) L.s.delete(clave(c, c - alto));      // la muesca de arriba
    for (let y = c + 2; y < N; y++) L.poner(c, y);       // tallo
    const hoja = c + 3;
    if (hoja < N) { L.poner(c - 1, hoja); L.poner(c - 2, hoja); L.poner(c + 1, hoja); L.poner(c + 2, hoja); }
    return L.s;
  }

  function doble(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const k = [4, 6][Math.floor(R() * 2)];
    L.disco(L.c, L.c, 1);
    for (let i = 0; i < k; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / k;
      L.disco(L.c + Math.cos(a) * radio * 0.55, L.c + Math.sin(a) * radio * 0.55, Math.max(0.9, radio * 0.28));
    }
    for (let i = 0; i < k; i++)
      L.rayo(-Math.PI / 2 + (i + 0.5) * 2 * Math.PI / k, radio * 0.5, radio);
    return L.s;
  }

  function espiga(R, N) {
    const L = lienzo(N), c = L.c;
    const radio = Math.max(1, Math.round(N * 0.28));
    const cy = Math.max(radio, Math.round(N * 0.32));
    const petalos = [4, 5, 6][Math.floor(R() * 3)];
    L.disco(c, cy, 1);
    for (let i = 0; i < petalos; i++)
      L.rayo(-Math.PI / 2 + i * 2 * Math.PI / petalos, 1.4, radio, c, cy);
    for (let y = cy + radio; y < N; y++) L.poner(c, y);
    const hoja = Math.min(N - 1, cy + radio + 2);
    L.poner(c - 1, hoja); L.poner(c - 2, hoja - 1);
    L.poner(c + 1, hoja); L.poner(c + 2, hoja - 1);
    return L.s;
  }

  const ESPECIES = [margarita, girasol, estrella, trebol, anillos, capullo, doble, espiga];
  const flor = (R, N) => ESPECIES[Math.floor(R() * ESPECIES.length)](R, N);

  /* ---------- mandalas ----------
     Cinco trazas distintas, todas de simetria radial. */

  function octante(R, N) {
    const L = lienzo(N), c = L.c;
    const ocho = (dx, dy) => [[dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy], [dy, dx], [-dy, dx], [dy, -dx], [-dy, -dx]]
      .forEach(([a, b]) => L.poner(c + a, c + b));
    ocho(0, 0);
    const tope = Math.floor(c);
    for (let dx = 1; dx <= tope; dx++) for (let dy = 0; dy <= dx; dy++) if (R() < 0.45) ocho(dx, dy);
    const aro = 1 + Math.floor(R() * tope);
    for (let dy = 0; dy <= aro; dy++) ocho(aro, dy);
    return L.s;
  }

  /* Cruz escalonada, la chakana andina: bloque central y cuatro brazos */
  function chakana(R, N) {
    const L = lienzo(N), c = L.c;
    const lado = Math.max(0, Math.floor(N / 7));
    const bloque = (cx, cy, l) => {
      for (let y = cy - l; y <= cy + l; y++) for (let x = cx - l; x <= cx + l; x++) L.poner(x, y);
    };
    bloque(c, c, lado);
    const d = 2 * lado + 1;
    bloque(c - d, c, lado); bloque(c + d, c, lado);
    bloque(c, c - d, lado); bloque(c, c + d, lado);
    if (R() < 0.5 && lado >= 1) {
      bloque(c - d, c - d, lado - 1); bloque(c + d, c - d, lado - 1);
      bloque(c - d, c + d, lado - 1); bloque(c + d, c + d, lado - 1);
    }
    if (R() < 0.7) L.s.delete(clave(c, c));
    return L.s;
  }

  function rombos(R, N) {
    const L = lienzo(N), c = L.c, radio = Math.floor(N / 2);
    const salto = R() < 0.5 ? 2 : 3;
    const desfase = Math.floor(R() * salto);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.abs(x - c) + Math.abs(y - c);
      if (d <= radio && (d + desfase) % salto === 0) L.poner(x, y);
    }
    return L.s;
  }

  function radios(R, N) {
    const L = lienzo(N), radio = Math.floor(N / 2);
    const k = [4, 6, 8, 12][Math.floor(R() * 4)];
    for (let i = 0; i < k; i++) L.rayo(-Math.PI / 2 + i * 2 * Math.PI / k, 1, radio);
    L.disco(L.c, L.c, R() < 0.5 ? 0.6 : 1.4);
    const aro = 1 + Math.floor(R() * Math.max(1, radio - 1));
    L.anillo(aro, Math.PI / (aro * 4));
    return L.s;
  }

  function dameroRadial(R, N) {
    const L = lienzo(N), c = L.c, radio = Math.floor(N / 2);
    const sectores = 4 + 2 * Math.floor(R() * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
      if (r > radio + 0.3) continue;
      const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * sectores);
      if ((sector + Math.floor(r)) % 2 === 0) L.poner(x, y);
    }
    return L.s;
  }

  const TRAZAS = [octante, chakana, rombos, radios, dameroRadial];
  const mandala = (R, N) => TRAZAS[Math.floor(R() * TRAZAS.length)](R, N);

  function calavera(R, N) {
    const s = new Set(), c = (N - 1) / 2;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
    const ancho = Math.max(2, Math.round(N * 0.30));
    const alto = Math.max(2, Math.round(N * 0.28));
    const tope = Math.max(0, c - alto - 1);
    for (let y = tope; y <= c + 1; y++)
      for (let x = c - ancho; x <= c + ancho; x++)
        if (dentro(x, y) && !(y === tope && Math.abs(x - c) === ancho)) s.add(clave(x, y));

    const grueso = N >= 11 ? 2 : 1;
    const ojoY = Math.max(tope + 1, c - Math.max(1, Math.round(alto * 0.4)));
    const ojoX = Math.max(1, Math.round(ancho * 0.55));
    for (let dy = 0; dy < grueso; dy++) for (let dx = 0; dx < grueso; dx++) {
      s.delete(clave(c - ojoX - dx, ojoY + dy));
      s.delete(clave(c + ojoX + dx, ojoY + dy));
    }
    s.delete(clave(c, c));
    if (R() < 0.5) s.delete(clave(c, c - 1));

    const quijada = c + 2;
    for (let x = c - ancho + 1; x <= c + ancho - 1; x++) if (dentro(x, quijada)) s.add(clave(x, quijada));
    for (let x = c - ancho + 2; x <= c + ancho - 2; x += 2) s.delete(clave(x, quijada));
    return s;
  }

  /* Careta de oni: cara ancha de barbilla angosta, cuernos, cejas gruesas
     inclinadas hacia adentro, ojos rasgados y boca con colmillos. La variedad
     sale del estilo de cuerno, del ancho de la boca y del tamaño de los ojos:
     antes todos los demonios salian practicamente iguales. */
  function demonio(R, N) {
    const L = lienzo(N), c = L.c;
    const ancho = Math.max(2, Math.round(N * 0.34));
    const alto = Math.max(2, Math.round(N * 0.30));
    const tope = Math.max(1, c - alto);
    const menton = Math.min(N - 1, c + alto);

    for (let y = tope; y <= menton; y++) {
      const angosta = y > c ? Math.min(ancho - 1, y - c) : 0;
      for (let x = c - ancho + angosta; x <= c + ancho - angosta; x++) L.poner(x, y);
    }

    const estilo = Math.floor(R() * 3);
    const largo = Math.max(2, Math.round(N / 3.4));
    for (let i = 0; i < largo; i++) {
      const y = tope - 1 - i;
      if (y < 0) break;
      let x;
      if (estilo === 0) x = c - ancho + 1;                              // rectos
      else if (estilo === 1) x = c - ancho + 1 - Math.floor(i / 2);     // abiertos
      else x = c - Math.max(1, Math.round(ancho * 0.55));               // juntos
      L.poner(x, y); L.poner(2 * c - x, y);
      if (estilo === 2 && i === largo - 1) { L.poner(x - 1, y); L.poner(2 * c - x + 1, y); }
    }

    // ojos rasgados: bajan hacia afuera, que es lo que arma el ceño
    const ojoY = tope + Math.max(1, Math.round(alto * 0.6));
    const ojoX = Math.max(1, Math.round(ancho * 0.55));
    const grueso = N >= 11 ? 2 : 1;
    for (let d = 0; d < grueso; d++) {
      L.s.delete(clave(c - ojoX - d, ojoY + d));
      L.s.delete(clave(c + ojoX + d, ojoY + d));
      if (N >= 13) { L.s.delete(clave(c - ojoX - d, ojoY + d + 1)); L.s.delete(clave(c + ojoX + d, ojoY + d + 1)); }
    }

    // boca ancha, con los colmillos que quedan en pie
    const bocaY = Math.min(menton - 1, c + Math.max(1, Math.round(alto * 0.45)));
    const bocaAncho = Math.max(1, Math.round(ancho * (0.5 + R() * 0.4)));
    for (let x = c - bocaAncho; x <= c + bocaAncho; x++) L.s.delete(clave(x, bocaY));
    L.poner(c - bocaAncho, bocaY); L.poner(c + bocaAncho, bocaY);       // colmillos
    if (R() < 0.5) L.poner(c, bocaY);
    if (R() < 0.4) L.s.delete(clave(c, c));                             // tabique
    return L.s;
  }

  /* Emblema abstracto: barras y columnas simetricas, sin azar sucio. Es la
     familia que reemplaza al crecimiento libre cuando se quiere algo que lea
     como signo y no como mancha. */
  function abstracto(R, N) {
    const s = new Set(), c = (N - 1) / 2;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

    for (let i = 0, barras = 2 + Math.floor(R() * 3); i < barras; i++) {
      const y = Math.floor(R() * N);
      const grueso = 1 + Math.floor(R() * 2);
      const medio = 1 + Math.floor(R() * (c + 1));
      for (let dy = 0; dy < grueso; dy++)
        for (let x = c - medio; x <= c + medio; x++)
          if (dentro(x, y + dy)) s.add(clave(x, y + dy));
    }

    for (let i = 0, cols = 1 + Math.floor(R() * 2); i < cols; i++) {
      const col = Math.floor(R() * (c + 1));
      const y0 = Math.floor(R() * (N / 2));
      const y1 = y0 + 2 + Math.floor(R() * (N - y0 - 2));
      for (let y = y0; y < Math.min(N, y1); y++) {
        if (dentro(c - col, y)) s.add(clave(c - col, y));
        if (dentro(c + col, y)) s.add(clave(c + col, y));
      }
    }

    for (let i = 0, muescas = Math.floor(R() * 3); i < muescas; i++) {
      const x = Math.floor(R() * (c + 1)), y = Math.floor(R() * N);
      s.delete(clave(x, y)); s.delete(clave(N - 1 - x, y));
    }
    return s;
  }

  function animal(R, N) {
    const s = new Set(), c = (N - 1) / 2;
    const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
    const cuerpo = 1 + Math.floor(R() * Math.max(1, Math.floor(c)));
    const y0 = c, y1 = Math.min(N - 2, c + 1 + Math.floor(R() * 2));
    for (let y = y0; y <= y1; y++) for (let x = c - cuerpo; x <= c + cuerpo; x++) if (dentro(x, y)) s.add(clave(x, y));

    const cabeza = Math.max(1, cuerpo - 1), cy = y0 - 2;
    for (let y = Math.max(0, cy - 1); y <= cy; y++)
      for (let x = c - cabeza; x <= c + cabeza; x++) if (dentro(x, y)) s.add(clave(x, y));
    if (dentro(c, y0 - 1)) s.add(clave(c, y0 - 1));

    const orejas = Math.max(0, cy - 2);
    if (dentro(c - cabeza, orejas)) { s.add(clave(c - cabeza, orejas)); s.add(clave(c + cabeza, orejas)); }
    if (R() < 0.5 && dentro(c - cabeza - 1, orejas)) { s.add(clave(c - cabeza - 1, orejas)); s.add(clave(c + cabeza + 1, orejas)); }

    for (const px of [c - cuerpo, c + cuerpo])
      for (let y = y1 + 1; y < Math.min(N, y1 + 3); y++) if (dentro(px, y)) s.add(clave(px, y));
    return s;
  }

  /* Trama textil: rombos y cruces repetidos, que es lo que se ve de lejos en
     las baldosas chicas de la portada */
  function trama(R, N) {
    const s = new Set(), c = (N - 1) / 2;
    const tipo = Math.floor(R() * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = Math.abs(x - c), dy = Math.abs(y - c);
      let on = false;
      if (tipo === 0) on = (x + y) % 2 === 0 && (x % 3 !== 2 || y % 3 !== 2);   // damero calado
      else if (tipo === 1) on = Math.abs(dx - dy) <= 0 || dx + dy === c + 1;    // aspa y rombo
      else on = (x % 2 === 0 && y % 2 === 0) || dx + dy <= 1;                   // punteado con nucleo
      if (on) s.add(clave(x, y));
    }
    return s;
  }

  const FAMILIAS = {
    organico: { nombre: 'orgánico', armar: organico },
    flor: { nombre: 'flor', armar: flor },
    mandala: { nombre: 'mandala', armar: mandala },
    calavera: { nombre: 'calavera', armar: calavera },
    demonio: { nombre: 'demonio', armar: demonio },
    animal: { nombre: 'animal', armar: animal },
    trama: { nombre: 'trama', armar: trama },
    abstracto: { nombre: 'abstracto', armar: abstracto }
  };
  const NOMBRES = Object.keys(FAMILIAS);

  /* Menu con pesos: las repeticiones son la probabilidad. Las flores y
     los mandalas se llevan la mitad del sorteo: son los que mejor leen como
     simbolo y los que mas variantes internas tienen. */
  const MENU = ['flor', 'flor', 'flor', 'flor', 'flor', 'flor',
                'mandala', 'mandala', 'mandala', 'mandala', 'mandala',
                'trama', 'trama', 'demonio', 'abstracto', 'calavera',
                'animal', 'organico'];

  /* ---------- una figura ---------- */
  function crear(lado) {
    let N = lado;
    let grilla = new Map();           // "gx,gy" -> hex
    let pixeles = [];                 // objetos animados
    let semilla = 0, familia = 'organico', quieto = false;

    function generarGrilla(sem, paleta, familias) {
      const R = dado(sem);
      const menu = familias && familias.length ? familias : MENU;
      familia = menu[Math.floor(R() * menu.length)];
      let celdas = FAMILIAS[familia].armar(R, N);
      // piso de llenado: sin esto algunas variantes caen en una figura de tres
      // celdas que en una baldosa chica se lee como un error
      if (celdas.size < Math.max(6, N * N * 0.11)) { familia = 'flor'; celdas = flor(R, N); }
      // el espejo se fuerza acá y no en cada familia: así ninguna puede
      // devolver una figura torcida, por mas que se agregue una nueva despues
      celdas = espejar(celdas, N);

      // color en manchas, resuelto con min(x, N-1-x) para que el espejo lo copie
      const dominante = Math.floor(R() * Math.min(3, paleta.length));
      const corrimiento = R() * 999;
      const nueva = new Map();
      for (const k of celdas) {
        const [x, y] = k.split(',').map(Number);
        const ex = Math.min(x, N - 1 - x);
        const r = Math.abs(Math.sin(Math.floor(ex / 2) * 7.13 + Math.floor(y / 2) * 3.71 + corrimiento) * 43758.5453) % 1;
        const idx = r > 0.55 ? Math.floor(r * paleta.length) % paleta.length : dominante;
        nueva.set(k, paleta[idx].h || paleta[idx]);
      }
      return nueva;
    }

    /* ---------- el corazon del morph ----------
       Cada pixel encendido conserva su identidad: se empareja por cercania con
       una celda del simbolo nuevo y viaja hasta ahi. El que ya estaba en su
       lugar casi no se mueve, y eso es lo que hace que la figura se lea como
       que se reacomoda en vez de borrarse y volver a dibujarse. */
    function morphA(nueva, ahora) {
      const destinos = [...nueva].map(([k, hex]) => {
        const [gx, gy] = k.split(',').map(Number);
        return { gx, gy, hex, tomado: false };
      });

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
          nuevos.push(Object.assign(base, {
            gx: p.gx, gy: p.gy, hex: p.hex,
            bx: p.bx + (p.bx - c) * 0.3, by: p.by + (p.by - c) * 0.3,
            cA: e.color, sA: 0, dur: VIAJE * 0.7, delay: Math.random() * 120
          }));
        }
      });

      destinos.filter(d => !d.tomado).forEach(d => {
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
    }

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

    /* Dibuja solo los pixeles, con el origen y el tamaño de celda que le pasen.
       Devuelve true si todavia hay algo animando. */
    function dibujar(ctx, x0, y0, celda, ahora, opc) {
      const o = opc || {};
      let animando = false;
      ctx.save();
      if (o.sombra) {
        // sombra corta: despega el pixel del fondo sin que se note como sombra
        ctx.shadowColor = 'rgba(0,0,0,0.24)';
        ctx.shadowBlur = celda * 0.14;
        ctx.shadowOffsetY = celda * 0.05;
      }
      for (const p of pixeles) {
        const e = leer(p, ahora);
        if (e.u < 1) animando = true;
        if (e.s <= 0.001) continue;
        const l = celda * e.s;
        const cx = x0 + (e.x + 0.5) * celda, cy = y0 + (e.y + 0.5) * celda;
        if (e.rot && e.u < 1) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(e.rot * (1 - e.u));
          ctx.fillStyle = aHex(e.color);
          ctx.fillRect(-l / 2, -l / 2, l + 0.5, l + 0.5);
          ctx.restore();
        } else {
          ctx.fillStyle = aHex(e.color);
          ctx.fillRect(cx - l / 2, cy - l / 2, l + 0.5, l + 0.5);
        }
      }
      ctx.restore();
      if (!animando) pixeles = pixeles.filter(p => p.sA > 0);
      return animando;
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
      const idas = [];
      for (const [x, y] of espejadas(gx, gy, espejo)) {
        const p = pixelEn(x, y);
        if (!p) continue;
        const e = leer(p, ahora);
        Object.assign(p, {
          cDe: e.color, cA: e.color, sDe: e.s, sA: 0,
          ax: e.x, ay: e.y, bx: x, by: y, delay: 0, dur: 240, t0: ahora, arco: 0, giro: 0
        });
        grilla.delete(clave(x, y));
        idas.push(clave(x, y));
      }
      return idas;
    }

    return {
      generar(ahora, sem, paleta, familias) {
        semilla = sem == null ? (Math.random() * 0xFFFFFFFF) >>> 0 : sem >>> 0;
        morphA(generarGrilla(semilla, paleta, familias), ahora);
      },
      limpiar(ahora) { morphA(new Map(), ahora); },
      dibujar, pintar, borrar, pixelEn,
      get grilla() { return grilla; },
      get semilla() { return semilla; },
      get firmaSemilla() { return firma(semilla); },
      get familia() { return FAMILIAS[familia].nombre; },
      get lado() { return N; },
      set lado(v) { N = v; },
      set quieto(q) { quieto = q; }
    };
  }

  return { crear, aRgb, aHex, mezcla, oscurecer, luz, tono, distanciaTono, suave, firma, dado, FAMILIAS, NOMBRES, MENU };
})();
