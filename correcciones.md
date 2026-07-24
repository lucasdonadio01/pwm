# Correcciones PWM + PRB — lote 3

> ## ✅ LOTE CERRADO — no rehacer
> Los **11 puntos** de este archivo fueron implementados en el commit `522e4e8` (ChatGPT) y **verificados en código** (Claude, 2026-07-23).
> Cambios respecto del spec: el export de tier se hizo con **canvas dibujado a mano**, no `html2canvas`. El sync en vivo usa **Supabase Realtime + polling de 20s** de respaldo.
> Este archivo queda como **referencia histórica**. Las correcciones nuevas van en un **lote 4** abajo (o en un archivo nuevo).

MODO sugerido: implementá el lote completo y probá 1 sola vez al final (browser). PWM = raíz (`js/`), PRB = `prb/`. Datos nuevos van en blobs JSON de `settings` (sincronizan por Supabase, no tocar el esquema). Al final: bump `?v=` en los dos `index.html` + subir `version`/`built` en `js/data.js` y `prb/js/data.js`.

Leyenda de tamaño: 🟢 chico · 🟡 medio · 🔴 grande/decisión.

---

## 1. 🟢 [PWM · Header] Sacar "Calendario" del nav
Ya está el ícono de calendario al lado del ⚡. Quitar el ítem `{ id: 'calendario', label: 'Calendario' }` del array `NAV` (dejar el ícono `#hdr-cal`). _Dónde:_ `js/app.js` → `NAV` + `renderRoute` (el route sigue existiendo, solo se saca del nav).

## 2. 🔴 [Ambos · Tier] Filas de tier personalizables + botón Compartir (screenshot)
- Hoy `TIERS` es una constante fija (PRIME/Muy bueno/Buena/Ni fu ni fa/Basura). Pasar a **config por lista**: cada tier list guarda su propio arreglo de filas `{label, color}`. Poder: renombrar cada fila, **agregar/quitar filas** (arriba o abajo), color automático por posición (gradiente arriba→abajo) con **override manual** (color-picker).
- Guardar la config de filas en `settings` (ej. `tierrows[listId]` o dentro del objeto de la lista). Los tiers default de cada usuario también deberían poder personalizarse (o dejar un default y permitir editar).
- **Botón "Compartir"** en la vista de tier: genera una **imagen/screenshot** del board y la baja / Web Share API.
- _Dónde:_ `js/app.js` y `prb/js/app.js` → `TIERS`, `renderTier`, `fillTier`, `openTierlistModal`, store `tierdata`/`tierlists`.
- _Decisión (definida):_ usar **`html2canvas` vendorizado** (un JS local, gratis) para convertir el board a imagen → bajar / Web Share API.
- _Look del export (definido):_ **estético para redes sociales, cool y minimal**. Que se vean bien los tiers y las portadas y listo (sin recargar; fondo/branding sutil, formato tipo cuadrado/story).

## 3. 🔴 [PWM · Calendario] Bugs + mejoras + notificaciones
- **Bug:** al tocar "Agregar función" no se cierra el overlay del día y se **apila** otro overlay. Arreglar el stacking (cerrar/omitir el sheet del día o montar el modal por encima bien).
- El selector de peli debe ser un **buscador con portada + título** (como `openAddFilm`/los otros buscadores), no un `<select>` plano.
- La función puesta en un día debe verse como **póster horizontal (backdrop) que ocupa todo el casillero** de ese día (usar `f.backdrop`).
- El **"cómo/dónde"** de la función pasa a ser una opción elegible: **IMAX / Cine / Casa / Discord** (Discord = verla juntos online). Reemplaza/complementa el `place` de texto libre en el evento (`{filmId, time, mode, place?}`).
- **Notificaciones de invitación:**
  - Si hay función(es) nueva(s) que el usuario destinatario aún no vio → badge **+N** en el ícono de calendario del header.
  - Cuando entra, ve los horarios y **confirma que asistirá** → se limpia el +N.
  - **Diseño de la invitación (overlay):** *"¡Felicidades! Fuiste invitado/a a la premier de **[película]**"* + **póster de la peli** + **cuándo** (fecha/hora) y **cómo** (IMAX / Casa / Discord). Con botones para **Aceptar** o descartar.
  - Al confirmar/aceptar, al **usuario que invitó** le llega: "*[usuario] aceptó la invitación a la premier*", como **overlay dentro de la sección Calendario**, que se puede **descartar**.
- _Dónde:_ `js/app.js` → `renderCalendario`, `renderCalGrid`, `openCalDay`, `openCalEventModal`; store `getCalEvents/saveCalEvents`. Notis: nuevo blob `settings` (ej. `calnotifs`), badge en `renderHeader` (`#hdr-cal`).
- _Decisión (definida):_ **notis en vivo con Supabase Realtime (opción c)** → casi instantáneo, gratis. Suscribirse a cambios de la tabla `settings`/`reviews` (o una tabla `notifs`) y refrescar + mostrar el overlay de aceptación al vuelo. Fallback: el refresh en `focus` que ya existe (`store.refresh()`) si Realtime no está disponible. Buen momento para hacer que TODO el sync sea live, no solo las notis.

## 4. 🟢 [PWM · Modo relámpago] Fecha opcional
En el swiper, dejar agregar (si querés) la **fecha en que la viste** al puntuar. _Dónde:_ `js/app.js` → `renderSwiper` / `mountSwiperStars`; store `setWatchMeta({date})`.

## 5. 🟡 [PWM · Búsqueda] Buscar en inglés / español / japonés
La búsqueda de pelis/series debe encontrar por título en **inglés, español o japonés** (para los animes). _Dónde:_ `js/config.js` → `WM.api.search` (probar varios `language`/`region`, o quitar el filtro de idioma y unir resultados; TMDB `search/multi` ya trae varios, sumar `include_adult:false`).

## 6. 🟡 [PRB · Leídos] Filtro por usuario + vista grilla
- Filtro para ver **solo los leídos de un usuario** (Bian / Luke / Todos), default Todos.
- Toggle **grilla**: solo **tapa del libro + puntaje**. _Dónde:_ `prb/js/app.js` → `buildRead` / `readCard`.

## 7. 🟡 [PRB · Tier] No compartir los leídos en tiers personales
En PRB, el tier **personal** debe usar **solo los libros del usuario dueño** (no juntar los de ambos). Compartir solo pasa en un tier **compartido** (igual que PWM). _Dónde:_ `prb/js/app.js` → `boardEligible` (rama personal debe filtrar por `B.owner`).

## 8. 🔴 [Ambos · Cuenta/Perfil] Login real + sección Perfil (cuenta única PWM+PRB)
- Pantalla "¿Quién sos?": agregar **"Acceder como invitado"** y **"Crear usuario"**.
- Crear usuario: elegir **foto de perfil** (de la galería), poner **usuario de Letterboxd** para linkear reseñas/likes/estrellas/watchlist/vistas.
- Cada usuario puede **cambiar su contraseña**.
- **La cuenta es única para ambas páginas** (PWM y PRB).
- Al tocar la **fotito del header** → menú de 3 opciones con íconos: **Perfil** (icon user), **Configuraciones** (icon tuerca), **Cerrar sesión** (rojo, icon logout).
- **Sección "Perfil":** stats piolas — total de pelis vistas, cuántas este año, cuántas series, **mini-calendario**, **medallas/logros** con objetivos, **descripción editable**, foto de perfil cambiable, **últimas reseñas** y **mejor rankeadas**, y stats extra con **gráficos minimalistas**.
- _Dónde:_ `showGate`, `WM.users` (hoy usuarios hardcodeados), `renderHeader` (user-chip → `openConfirm`, reemplazar por menú), nuevo route `perfil`, store para el modelo de usuarios.
- _Decisión (importante):_ hoy no hay auth real (usuarios fijos + PIN 1234). Cuentas creables + invitado + cambio de contraseña + Perfil es el cambio **más grande**: necesita tabla/almacén de usuarios (Supabase) y unificar el usuario activo entre PWM/PRB. Arrancar con un plan aparte.
- _Import de Letterboxd (definido):_ **se puede, igual que Bian/Luke, pero NO en vivo desde el browser** (CORS + anti-scraping). El fetch lo hace el **pipeline** `scripts/build-data.mjs` (Node/Action) con headers de browser + Referer + reintentos (`lbFetch`). **Escalable a ~10 users de forma simple:** generalizar el pipeline para que lea una **lista de handles** (de un config/tabla Supabase que el signup va poblando) en vez de tener Bian/Luke fijos; el Action **importa a todos automáticamente**. **Cambiar la cadencia del Action de semanal a diario / cada 24h** (cron en `.github/workflows/update-data.yml`, hoy lunes 09:00 UTC → pasar a diario). Los datos de un user nuevo aparecen en la **próxima corrida** (≤24h) o al disparar el Action manual, NO instantáneo en el signup. (Instantáneo-al-signup = upgrade opcional con función serverless proxy; fuera de alcance ahora.)
- _Aclaraciones a definir:_
  - **Perfil vs Configuraciones:** propuesta → *Perfil* = stats + bio + foto + medallas + últimas reseñas/mejor rankeadas (vista lucida); *Configuraciones* = ajustes de cuenta (cambiar contraseña, usuario de Letterboxd, ¿tema?, cerrar sesión también acá). Confirmar el reparto.
  - **Foto de perfil "de la galería" (definido):** NO hay servidor que procese (sitio estático + Supabase solo guarda). Se comprime **en el navegador**. Flujo: subir (hasta **10MB**) → **recortador con paneo + zoom** (el user elige qué parte y cuánto zoom, marco cuadrado) → exportar a ~400×400 JPEG → guardar ese base64 chico (pocos KB). NUNCA guardar los 10MB crudos en el blob de `settings`. (Cropper a mano con canvas, sin lib; full-res opcional: Supabase Storage.)
  - **Invitado:** definir qué puede hacer (solo mirar / usuario temporal local que no sincroniza / etc.).
  - **Medallas/logros:** definir la lista inicial (ej. "10 vistas", "primera reseña", "racha semanal", "completó una tier", "5 pelis en un mes"…). Se derivan de los datos del store.
  - **Cuenta única PWM+PRB:** hoy el usuario activo se guarda separado (`wm.activeUser` / `prb.activeUser`). Unificar a una sola clave/almacén compartido.

## 9. 🟢 [PWM · Ficha de peli] Botón "Agendar"
Al lado de "Ver trailer", botón **"Agendar"** → lleva al Calendario y abre el flujo de agregar función **precargado con esa peli**, preguntando el día/horario/lugar. _Dónde:_ `js/app.js` → `openSheet` (botón junto a `#sheet-trailer`) → llamar a `openCalEventModal`/route calendario con la peli.

## 10. 🟡 [PWM · Movies y Series] Toggle Watchlist / Descubrir nuevos
Al lado del título de Movies/Series, opción **"Watchlist" vs "Descubrir nuevos"**: con "Descubrir", mostrar pelis/series nuevas de TMDB según los **filtros de género activos** de esa pantalla. _Dónde:_ `js/app.js` → `renderCatalog`; reutilizar `WM.api.discover` (extender a series con `/discover/tv`).

## 11. 🟢 [PWM · Watchlist] Filtro por usuario
Filtro para ver la watchlist de **tal usuario** (Bian / Luke / Todas), default **Todas** (como está hoy). _Dónde:_ `js/app.js` → `renderWatchlist` / `orderedWatchlist` (filtrar por `f.owner`).

---

### Orden sugerido de ataque
1. Rápidas primero (bajo riesgo): #1, #4, #9, #11, #6, #10, #7.
2. Medias: #5, #2 (sin el screenshot), #3 (bug + buscador + póster, sin notis).
3. Grandes/decisión: #8 (cuenta/perfil), #3 (notis), #2 (screenshot). Confirmar decisiones antes.

---

# Correcciones PWM + PRB — lote 4

## 12. ✅ [Ambos · Perfil/Tier] Perfil 70/30 + export con portadas
- Perfil: descripción y estadísticas compactas dentro del panel superior.
- Debajo: últimas reseñas y mejores rankeadas en la columna principal (70%); calendario, gráficos explicados y medallas desplegables en la columna lateral (30%).
- Adaptación móvil en una sola columna, sin desborde horizontal.
- Tier: la imagen exportada conserva las portadas remotas y usa exactamente el nombre de la tier como título.
- Estado: **implementado y probado localmente; pendiente de aprobación de Lucas y push**.
