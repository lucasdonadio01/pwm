# 002 — Animar la expansión de secciones del perfil

- **Status**: DONE
- **Commit**: e865f9f
- **Severity**: MEDIUM
- **Category**: Interruptibility / missed opportunities
- **Estimated scope**: 2 CSS files, cambio pequeño

## Problem

Las tarjetas estadísticas del perfil usan `<details>` y rotan el indicador, pero el contenido aparece o desaparece de golpe:

```css
/* css/styles.css:1443 — current */
.pdetail__toggle {
  transition: transform .2s var(--ease), color .2s;
}
.pdetail[open] .pdetail__toggle { transform: rotate(180deg); }
```

La relación entre el resumen y su explicación no queda expresada.

## Target

- Mantener `<details>` nativo y accesible.
- Revelar `.pdetail__body` con opacidad y `clip-path: inset(0 0 100% 0) → inset(0)`.
- Duración 220ms, `cubic-bezier(0.23, 1, 0.32, 1)`.
- En movimiento reducido, conservar solo una transición de opacidad de 80ms.

## Repo conventions to follow

- Los paneles del perfil están duplicados visualmente en `css/styles.css` y `prb/css/styles.css`; deben quedar equivalentes.
- Usar el borde y superficies existentes; no cambiar estructura ni copy.

## Steps

1. Agregar una entrada acotada a `.pdetail[open] .pdetail__body` en ambos CSS.
2. Alinear la curva de rotación del indicador con `--ease-out`.
3. Incluir una regla específica dentro de `prefers-reduced-motion`.

## Boundaries

- No convertir `<details>` en un componente JS.
- No animar `height`.
- No cambiar el estado abierto inicial.

## Verification

- **Mechanical**: `git diff --check`.
- **Feel check**: abrir y cerrar varias tarjetas, confirmar que el contenido nace debajo del resumen y que teclado/touch siguen funcionando.
- **Done when**: la expansión se entiende espacialmente sin sentirse lenta.
