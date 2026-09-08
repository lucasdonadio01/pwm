/* MUSUQ PACHA · Símbolos — pixel swap.
   Version propia del efecto de reactbits: una grilla de celdas tapa el
   contenido en orden aleatorio, se cambia lo que hay abajo, y la grilla se
   retira en otro orden. Se usa para el titulo de la portada y para el
   barrido de pantalla completa que entra al generador. */

const PixelSwap = (() => {
  const PASO = 60;                  // ms que tarda una celda en aparecer: casi de golpe
  const TANDA = 400;                // ms entre la primera celda y la ultima
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const revolver = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function tapa(destino, { celda = 22, color = '#1B1A19', colores = null, fijo = false } = {}) {
    const caja = fijo ? { width: innerWidth, height: innerHeight } : destino.getBoundingClientRect();
    const cols = Math.max(1, Math.ceil(caja.width / celda));
    const filas = Math.max(1, Math.ceil(caja.height / celda));
    const capa = document.createElement('div');
    capa.className = 'pxswap' + (fijo ? ' pxswap--fijo' : '');
    capa.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    capa.style.gridTemplateRows = 'repeat(' + filas + ', 1fr)';
    const celdas = [];
    for (let i = 0; i < cols * filas; i++) {
      const d = document.createElement('i');
      // cada celda toma su propio color: tapado con un solo color la pantalla
      // se iba a negro un instante y se leía como un corte, no como transición
      d.style.background = colores && colores.length
        ? colores[Math.floor(Math.random() * colores.length)]
        : color;
      capa.appendChild(d);
      celdas.push(d);
    }
    (fijo ? document.body : destino).appendChild(capa);

    // Las celdas no crecen de a poco: aparecen enteras, escalonadas dentro de
    // la tanda. Es lo que hace que se lea como pixel y no como un fundido.
    const mover = escala => {
      const orden = revolver(celdas.map((_, i) => i));
      const disp = TANDA / Math.max(1, celdas.length - 1);
      orden.forEach((idx, rango) => {
        celdas[idx].style.transitionDelay = (rango * disp) + 'ms';
        celdas[idx].style.transform = 'scale(' + escala + ')';
      });
      return esperar(PASO + TANDA + 40);
    };
    return {
      capa,
      cubrir: () => mover(1.04),
      descubrir: () => mover(0),
      quitar: () => capa.remove()
    };
  }

  /* Cambia el texto de un elemento detras de la grilla */
  async function texto(el, nuevo, opc) {
    if (reduce()) { el.textContent = nuevo; return; }
    const t = tapa(el, opc);
    await t.cubrir();
    el.dataset.texto = nuevo;
    el.firstElementChild.textContent = nuevo;
    await esperar(90);
    await t.descubrir();
    t.quitar();
  }

  /* Barrido de pantalla completa: tapa todo, corre el cambio, se retira */
  async function pantalla(cambio, opc) {
    if (reduce()) { await cambio(); return; }
    // 12 columnas de ancho: bloques grandes, como la grilla de 8 del referente
    const gruesa = Math.round(innerWidth / 12);
    const t = tapa(document.body, Object.assign({ celda: gruesa, fijo: true }, opc));
    await t.cubrir();
    await cambio();
    await esperar(120);
    await t.descubrir();
    t.quitar();
  }

  return { texto, pantalla, tapa };
})();
