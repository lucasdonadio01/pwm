# 001 — Dar continuidad a rutas, filtros y cambios lista↔grilla

- **Status**: DONE
- **Commit**: e865f9f
- **Severity**: HIGH
- **Category**: Missed opportunities / cohesion
- **Estimated scope**: 5 files, cambios medianos

## Problem

PWM y PRB reemplazan el contenido completo de las rutas sin transición:

```js
// js/app.js:430 — current
function setRoute(r, options = {}) {
  route = r;
  // ...
  renderRoute();
}
```

Los cambios lista↔grilla también vacían y reconstruyen el contenedor de golpe:

```js
// js/app.js:945 — current
watchlistView = b.dataset.view;
fillPlist();
```

```js
// prb/js/app.js:644 — current
selectosView = b.dataset.view;
fillPlist();
```

Eso rompe la continuidad espacial aunque el catálogo Movies/Series ya define una dirección correcta con salida breve y entrada suavizada en `js/app.js:876`.

## Target

- Crear un helper compartido en `js/shared.js` basado en `document.startViewTransition`, con fallback inmediato y respeto por `prefers-reduced-motion`.
- Duración de ruta: salida 140ms y entrada 260ms.
- Curva de llegada: `cubic-bezier(0.23, 1, 0.32, 1)`.
- Curva de movimiento compartido lista↔grilla: `cubic-bezier(0.77, 0, 0.175, 1)`, máximo 300ms.
- Los mismos títulos deben conservar un `view-transition-name` estable para que la portada se desplace entre lista y grilla.
- Sin animaciones de layout manuales (`width`, `height`, `top`, `left`) y sin dependencias.

## Repo conventions to follow

- El código común vive en `js/shared.js` y se consume como `APPKIT`.
- El catálogo ya usa opacidad, blur acotado y transform en `css/styles.css:1213`.
- El proyecto ya tiene `prefers-reduced-motion` en `css/styles.css:916`.

## Steps

1. Agregar `APPKIT.motion` en `js/shared.js` con `run(update, options)`, `tag(element, id)` y detección de movimiento reducido.
2. Agregar tokens `--ease-out` y `--ease-in-out` y estilos de View Transitions a `css/styles.css` y `prb/css/styles.css`.
3. Envolver los cambios de ruta en `js/app.js` y `prb/js/app.js` con `APPKIT.motion.run`.
4. Envolver lista↔grilla de Watchlist/Selectos/Leídos/Leyendo con el helper y etiquetar las tarjetas por id.
5. Aplicar la misma continuidad breve a filtros que reconstruyen grillas, sin animar cada tecla del buscador.

## Boundaries

- No modificar datos ni Supabase.
- No animar escritura en buscadores.
- No agregar dependencias.
- No demorar acciones frecuentes más de 300ms.

## Verification

- **Mechanical**: `node --check js/shared.js`, `node --check js/app.js`, `node --check prb/js/app.js` y `git diff --check`.
- **Feel check**:
  - cambiar Watchlist y Selectos entre lista y grilla: las mismas portadas se mueven hacia su nueva posición;
  - cambiar de ruta: la salida es más rápida que la entrada y no hay doble exposición;
  - alternar rápidamente no reinicia desde cero de forma brusca;
  - con `prefers-reduced-motion: reduce`, el contenido cambia sin desplazamiento.
- **Done when**: rutas, filtros y cambios lista↔grilla ya no “teletransportan” el contenido y siguen respondiendo al instante.
