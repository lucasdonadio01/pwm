/* MUSUQ PACHA · Símbolos — codificador GIF89a.
   Escrito a mano para no depender de gif.js ni de ningun worker externo:
   la pagina tiene que poder abrirse offline desde el .html de la entrega.
   Corte mediano para la paleta global + LZW estandar. */

const GIF = (() => {

  /* ---------- paleta por corte mediano ---------- */
  function paletaGlobal(cuadros, maxColores, objetivo) {
    // el muestreo se acota a un total fijo: con 30 cuadros grandes, tomar uno
    // de cada nueve pixeles daba medio millon de muestras y el corte mediano
    // se comia decenas de segundos
    const total = cuadros.reduce((a, c) => a + c.length / 4, 0);
    const salto = Math.max(1, Math.floor(total / objetivo));
    let caja = [];
    for (const datos of cuadros) {
      for (let i = 0; i < datos.length; i += 4 * salto) {
        caja.push([datos[i], datos[i + 1], datos[i + 2]]);
      }
    }
    let cajas = [caja];
    while (cajas.length < maxColores) {
      let mejor = -1, mayor = -1, canal = 0;
      cajas.forEach((c, i) => {
        if (c.length < 2) return;
        for (let k = 0; k < 3; k++) {
          let min = 255, max = 0;
          for (const p of c) { if (p[k] < min) min = p[k]; if (p[k] > max) max = p[k]; }
          const r = (max - min) * (k === 1 ? 1.2 : 1);      // el verde pesa mas al ojo
          if (r > mayor) { mayor = r; mejor = i; canal = k; }
        }
      });
      if (mejor < 0 || mayor <= 0) break;
      const c = cajas[mejor];
      c.sort((a, b) => a[canal] - b[canal]);
      const m = c.length >> 1;
      cajas.splice(mejor, 1, c.slice(0, m), c.slice(m));
    }
    return cajas.filter(c => c.length).map(c => {
      const s = c.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
      return s.map(v => Math.round(v / c.length));
    });
  }

  /* ---------- indexado con cache de 15 bits ---------- */
  function indexador(paleta) {
    const cache = new Int16Array(32768).fill(-1);
    return (r, g, b) => {
      const k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
      let i = cache[k];
      if (i >= 0) return i;
      let mejor = 0, dist = Infinity;
      for (let j = 0; j < paleta.length; j++) {
        const p = paleta[j];
        const d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) * 1.4 + (p[2] - b) * (p[2] - b);
        if (d < dist) { dist = d; mejor = j; }
      }
      cache[k] = mejor;
      return mejor;
    };
  }

  /* ---------- LZW segun la especificacion GIF ---------- */
  function lzw(indices, minCodigo) {
    const limpiar = 1 << minCodigo, fin = limpiar + 1;
    let bits = minCodigo + 1, siguiente = fin + 1;
    let dicc = new Map(), acum = 0, cuenta = 0;
    const salida = [];

    const emitir = codigo => {
      acum |= codigo << cuenta;
      cuenta += bits;
      while (cuenta >= 8) { salida.push(acum & 255); acum >>>= 8; cuenta -= 8; }
    };

    emitir(limpiar);
    let prefijo = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], llave = prefijo * 4096 + k;
      if (dicc.has(llave)) { prefijo = dicc.get(llave); continue; }
      emitir(prefijo);
      dicc.set(llave, siguiente++);
      if (siguiente === 4096) {
        emitir(limpiar);
        dicc = new Map(); siguiente = fin + 1; bits = minCodigo + 1;
      } else if (siguiente > (1 << bits) - 1 && bits < 12) {
        bits++;
      }
      prefijo = k;
    }
    emitir(prefijo);
    emitir(fin);
    if (cuenta > 0) salida.push(acum & 255);
    return salida;
  }

  /* ---------- armado del archivo ---------- */
  const corto = (a, v) => { a.push(v & 255, (v >> 8) & 255); };

  function subBloques(salida, bytes) {
    for (let i = 0; i < bytes.length; i += 255) {
      const trozo = bytes.slice(i, i + 255);
      salida.push(trozo.length);
      for (const b of trozo) salida.push(b);
    }
    salida.push(0);
  }

  const respirar = () => new Promise(r => setTimeout(r, 0));

  /* cuadros: array de Uint8ClampedArray RGBA. retardo en centesimas de segundo. */
  async function codificar({ cuadros, ancho, alto, retardo = 6, colores = 128, alProgreso }) {
    const avisar = (p, q) => alProgreso && alProgreso(p, q);
    avisar(0.02, 'armando la paleta');
    await respirar();

    const paleta = paletaGlobal(cuadros, colores, 24000);
    const indice = indexador(paleta);
    const bytes = [];

    for (const c of 'GIF89a') bytes.push(c.charCodeAt(0));
    corto(bytes, ancho); corto(bytes, alto);
    bytes.push(0xF7, 0, 0);                                  // tabla global de 256, sin fondo
    for (let i = 0; i < 256; i++) {
      const p = paleta[i] || [0, 0, 0];
      bytes.push(p[0], p[1], p[2]);
    }
    bytes.push(0x21, 0xFF, 0x0B);                            // extension NETSCAPE2.0: bucle infinito
    for (const c of 'NETSCAPE2.0') bytes.push(c.charCodeAt(0));
    bytes.push(3, 1, 0, 0, 0);

    const pixeles = new Uint8Array(ancho * alto);
    for (let n = 0; n < cuadros.length; n++) {
      const datos = cuadros[n];
      for (let i = 0, j = 0; i < pixeles.length; i++, j += 4) {
        pixeles[i] = indice(datos[j], datos[j + 1], datos[j + 2]);
      }
      bytes.push(0x21, 0xF9, 0x04, 0x04);                    // control grafico: sin transparencia
      corto(bytes, retardo);
      bytes.push(0, 0);
      bytes.push(0x2C);                                      // descriptor de imagen
      corto(bytes, 0); corto(bytes, 0);
      corto(bytes, ancho); corto(bytes, alto);
      bytes.push(0, 8);
      subBloques(bytes, lzw(pixeles, 8));
      avisar(0.05 + 0.95 * (n + 1) / cuadros.length, 'cuadro ' + (n + 1) + ' de ' + cuadros.length);
      await respirar();
    }
    bytes.push(0x3B);
    return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  }

  return { codificar };
})();
