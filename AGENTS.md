# AGENTS.md — léeme antes de tocar nada

Repo trabajado por varios asistentes (Claude Code y ChatGPT/cowork) + Lucas.
**Mantené este archivo corto.** Se lee en cada sesión: si crece, cuesta tokens a todos.

## Qué es
Dos apps hermanas, sitio estático vanilla (**sin build**), un repo:
- **PWM** (pelis/series) → `index.html`, `js/`
- **PRB** (libros) → `prb/index.html`, `prb/js/`

En vivo: `lucasdonadio01.github.io/pwm/` y `/pwm/prb/` (Pages, se publica al pushear a `main`).

## Reglas de oro
1. **Código común → `js/shared.js` (`APPKIT`)**, que cargan las dos apps (cuentas+PIN, cropper, filas de tier, export de imagen, toast). No dupliques.
2. **Datos nuevos → blobs JSON en la tabla `settings`.** No se cambia el esquema. Claves: `reading`, `watchmeta`, `tierlists`, `tierdata`, `tierrows`, `calendars`, `calevents`, `accounts`, `extra_films`, `extra_books`, `order`.
3. **Hay datos REALES en Supabase.** Nunca borres en masa. Si escribís probando, limpialo.
4. **Cache-bust:** tocaste JS/CSS → subí `?v=N` en **los dos** `index.html`. (Si no, se sirve lo viejo: ya rompió el layout de "Leyendo".)
5. **Versión del footer:** `WM.build`/`PRB.build` en `js/data.js` y `prb/js/data.js`.
6. **Todo gratis**, sin build ni npm en runtime. UI en **español rioplatense**.

## Handoff
**Al terminar:** commiteá (no dejes trabajo a medias sin commitear) · marcá estado en `correcciones.md` (✅/🚧/⛔) · **reemplazá** la entrada de la Bitácora · si Lucas debe hacer algo a mano, anotalo abajo (el otro no ve tu chat).
**Al empezar:** leé este archivo · `git log --oneline -10` + `git status` · si hay cambios sin commitear que no son tuyos, **no los toques**, preguntá.

## Pendiente de Lucas
- (nada)

## Bitácora — SOLO la última entrada. Reemplazala, no acumules (el historial está en `git log`).

### 2026-07-23 · Claude
- Me puse al día con `522e4e8` (ChatGPT): los 11 puntos de `correcciones.md` están implementados y verificados en código.
- Nuevo módulo compartido `js/shared.js` (`APPKIT`). El export de tier es **canvas dibujado a mano**, no html2canvas. Sync en vivo por **Supabase Realtime** con polling de 20s de respaldo. Action pasó a **diario**.
- Lucas ya corrió el `alter publication supabase_realtime add table settings, reviews;` ✅
- Creé `AGENTS.md` + `CLAUDE.md`. `correcciones.md` sigue **sin marcar** qué quedó hecho.
- Quedaban sin commitear (de otra sesión): `PRODUCT.md`, `css/styles.css`.
