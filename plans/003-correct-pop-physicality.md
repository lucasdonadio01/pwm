# 003 — Corregir la escala excesiva de overlays

- **Status**: DONE
- **Commit**: e865f9f
- **Severity**: HIGH
- **Category**: Physicality
- **Estimated scope**: 2 CSS files, cambio pequeño

## Problem

El keyframe global `pop` aparece desde `scale(.7)` y rebota hasta `1.18`, por lo que modales, picker y feedback parecen materializarse desde cero:

```css
/* css/styles.css:685 — current */
@keyframes pop {
  0% { transform: scale(0.7); }
  55% { transform: scale(1.18); }
  100% { transform: scale(1); }
}
```

La misma definición existe en `prb/css/styles.css:644`.

## Target

- Entrada de overlays desde `opacity: 0; transform: scale(.96) translateY(6px)`.
- Llegada a `opacity: 1; transform: scale(1) translateY(0)`.
- Duración heredada por cada componente, curva `cubic-bezier(0.23, 1, 0.32, 1)`.
- Mantener un keyframe separado para el corazón si necesita feedback expresivo; no usar el keyframe de overlays.

## Repo conventions to follow

- Los overlays ya combinan scrim y panel; el panel debe seguir centrado.
- El botón Like puede conservar un pulso sutil de feedback.

## Steps

1. Separar `overlayIn` de `likePop` en ambos CSS.
2. Cambiar modales, cropper y pickers a `overlayIn`.
3. Mantener Like con escala mínima `.92 → 1.06 → 1`, máximo 220ms.
4. En movimiento reducido, usar solo opacidad.

## Boundaries

- No cambiar z-index, geometría ni estructura de overlays.
- No agregar rebote a interacciones rutinarias.
- No agregar dependencias.

## Verification

- **Mechanical**: `git diff --check`.
- **Feel check**: abrir hoja, confirmación, picker y dar Like; los overlays se sienten físicos y el corazón conserva feedback sin rebote exagerado.
- **Done when**: ningún overlay entra desde `scale(.7)` y el feedback de Like sigue siendo visible.
