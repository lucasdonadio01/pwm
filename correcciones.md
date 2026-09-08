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
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 13. ✅ [Ambos · Reseñas/Perfil] Vista enfocada + navegación entre usuarios
- Al abrir una reseña desde un perfil se muestra la obra y la reseña, sin sinopsis ni campos de edición; en PWM tampoco aparece "Agendar".
- Las reseñas propias muestran **Editar**. Recién al tocarlo aparecen puntaje, texto y los datos opcionales de fecha/lugar o lectura.
- Las reseñas ajenas son de solo lectura y mantienen debajo las opiniones de los demás usuarios.
- Los nombres de usuario visibles en reseñas, perfiles, tiers y calendario llevan al perfil público con sus estadísticas.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 14. ✅ [Ambos · Actividad/Calendario/Cuentas] Invitaciones dirigidas + notificaciones + GIF
- Calendario: cada función permite elegir exactamente a quién invitar; una función también puede quedar sin invitados.
- Al abrir el día, el creador ve quién sigue pendiente, quién no puede y quién **asistirá a la función**. El invitado ve “Invitación de [usuario] pendiente” y puede responder desde ahí.
- Centro de notificaciones compartido en PWM y PRB para invitaciones, confirmaciones, reseñas publicadas/actualizadas y likes de reseñas.
- Likes de reseñas separados de los likes de películas/libros, con aviso para quien escribió la reseña.
- En PRB, la vista enfocada de una reseña ajena muestra solamente esa reseña y el botón de like; la propia mantiene **Editar** y todos sus campos.
- Las cuentas aceptan fotos recortables y GIF animados de hasta 1MB, visibles también en Perfil y “¿Quién sos?”.
- Se eliminó de Supabase la cuenta de prueba `bob` y su única referencia de calendario, sin tocar la función ni datos ajenos.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 15. ✅ [Ambos · Perfil/Motion] Fondo personal + listas completas + transiciones
- Perfil: fondo personalizable por usuario con color, contraste e imagen o GIF ultrawide; se puede aplicar solo a la portada o a toda la vista.
- El fondo se puede subir desde el dispositivo o buscar dentro de la app en GIPHY.
- PWM muestra debajo de las mejores rankeadas la Watchlist del usuario visitado.
- Últimas reseñas y mejores rankeadas permiten **Ver todas / Ver menos** sin abandonar el perfil. PRB conserva el mismo comportamiento para reseñas y libros rankeados.
- Rutas, filtros y cambios lista/grilla ahora mantienen continuidad visual. Se usan View Transitions cuando están disponibles y Web Animations como respaldo, con soporte para `prefers-reduced-motion`.
- Los overlays rutinarios ya no aparecen desde escalas exageradas y las estadísticas desplegables del perfil tienen una apertura breve y legible.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 16. ✅ [Ambos · Inicio/Perfil + PWM · Relámpago/Calendario] Ajustes responsive e interacción
- PWM: Modo relámpago se adapta a celulares chicos sin desborde horizontal; sus acciones se ordenan en dos filas y la altura se ajusta al viewport.
- PWM: el calendario del perfil combina funciones agendadas con títulos vistos. Cada día abre esa fecha en el calendario normal y hay acceso al calendario completo.
- PWM y PRB: el inicio termina con las últimas reseñas ordenadas por fecha disponible; **Ver más reseñas** despliega cuatro adicionales por vez.
- PWM y PRB: las barras de **Cómo puntuás** muestran cantidades y abren un detalle táctil/clickeable con las obras exactas de cada puntaje.
- Perfil: la búsqueda de GIF permite cargar y scrollear más resultados. Los fondos GIF se renderizan como imagen animada tanto en portada como en toda la vista.
- PWM: **Mejor rankeadas** y **Watchlist** crecen hacia abajo en una grilla responsive, sin carrusel lateral.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 17. ✅ [Ambos · Cuentas/Notificaciones] Aviso de usuario nuevo
- Al crear un perfil desde PWM o PRB se genera una sola actividad compartida para todos los usuarios que ya existían.
- El aviso dice **“¡[usuario] se ha unido!”**, no se envía al propio usuario nuevo y al tocarlo abre su perfil.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 18. ✅ [PRB · Perfil] Estructura de escritorio alineada con PWM
- Se restauró la cabecera compacta con identidad, descripción y estadísticas dentro del mismo panel.
- En PC, reseñas y libros rankeados ocupan la columna principal del 70%; calendario, gráficos y medallas quedan ordenados en una columna lateral del 30%.
- Las tarjetas de estadísticas recuperaron jerarquía, espaciado, foco de teclado y animación al desplegarse.
- En mobile, el perfil vuelve a una sola columna, las estadísticas se agrupan de a dos y los libros no generan desborde horizontal.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 19. ✅ [PWM · Perfil/Calendario] Estadísticas persistentes + rankeadas + calendarios personales
- Perfil: **Cómo puntuás** aparece antes de **Últimos 12 meses**. Cómo puntuás, Últimos 12 meses, Tus géneros y Medallas nacen desplegados.
- El estado abierto/cerrado se guarda localmente por usuario y perfil visitado, así que los refrescos de Realtime o el polling ya no vuelven a cerrar los paneles.
- **Mejor rankeadas** muestra dos filas completas y media tercera fila desenfocada, con un botón **Ver más** sobre el recorte; el botón superior **Ver todas / Ver menos** se mantiene.
- En mobile, **Últimas reseñas**, **Mejor rankeadas** y **Watchlist** muestran una fila completa y media segunda fila desenfocada, con **Ver más**; al expandir crecen hacia abajo.
- Calendario: el mes queda centrado entre las flechas en PC y mobile.
- Cada usuario recibe un **Mi calendario** personal. Las funciones nuevas se guardan ahí y las funciones ajenas aparecen solamente después de aceptar su invitación.
- Los calendarios compartidos usan invitación pendiente: la otra persona no obtiene acceso hasta aceptar desde Notificaciones. PRB también reconoce estas notificaciones y abre PWM.
- Los eventos existentes de `cal-main` no se mueven ni se borran; quedan accesibles para sus participantes como **Calendario anterior**.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 20. ✅ [PWM · Watchlist] Lista propia como filtro inicial
- Al entrar en Watchlist se muestra por defecto la lista del usuario activo.
- El selector mantiene **Todos** como primera opción y después permite elegir cualquier usuario, incluso si todavía no tiene títulos.
- Al salir y volver a entrar en Watchlist se recupera nuevamente la lista propia; el modo Invitado empieza en **Todos**.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 21. ✅ [PWM · Modo relámpago] Portadas centradas en mobile
- Las portadas permanecen centradas aunque el título o los metadatos ocupen más ancho que la imagen.
- La corrección aplica a todos los tamaños sin cambiar las dimensiones ni el recorte de la portada.
- Estado: **✅ aprobado por Lucas y publicado en `main`**.

## 22. 🚧 [Ambos · Ruteo] La sección queda en la URL (F5 / Atrás-Adelante)
- `setRoute()` refleja la sección en `location.hash` (`#watchlist`, `#tier`, `#leyendo`, etc.).
- Al recargar (F5) la app arranca en esa sección si hay sesión iniciada; **Atrás/Adelante** del navegador navegan entre secciones.
- `openDeepLink()` ya no borra el `#` de sección al limpiar los `?query=`.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 23. 🚧 [PWM · Home] Chips "quién puntuó" con estrella + teaser desenfocado
- Cada reseña del home muestra un chip por usuario con su fotito, la nota con **⭐** al lado y una marca si dejó reseña escrita.
- Debajo, un teaser con las próximas reseñas **desenfocadas** y el botón **Ver N reseñas más** flotando encima; al tocarlo se despliegan todas.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 24. 🚧 [PWM · Watchlist] Numeración de lista filtrada empieza en 1
- Al filtrar por un usuario (o buscar), la lista se numera 1..n en vez de mostrar la posición global compartida (Luke empezaba en 9).
- Con filtro activo el número queda de solo lectura (el reordenamiento sigue deshabilitado, como ya era).
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 25. 🚧 [PRB · Reseñas] "Me gusta esta reseña" estilado y rojo
- El botón de me gusta de reseña, que estaba sin estilo, ahora es una píldora; al dar like queda **rojo** (los corazones de PRB usan rojo, no el azul del acento).
- Tocar la reseña de otra persona sigue mostrando **solo su reseña** (ya funcionaba).
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 26. 🚧 [PRB · Perfil] Las estadísticas ya no se cierran solas
- El estado abierto/cerrado de los gráficos/stats se guarda por usuario y perfil (localStorage), así que un refresco remoto (Realtime/polling) no los vuelve a cerrar. Paridad con PWM (ítem 19).
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 27. 🚧 [PWM · Home] El desenfoque del teaser se tinta con el fondo de perfil
- El degradado del teaser se funde hacia un tono oscuro similar al color de fondo de perfil del usuario activo; si usa un GIF/imagen de fondo, se funde a oscuro genérico.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 28. 🚧 [Ambos · Animación] Transiciones más suaves
- Los cambios de sección animan un poco más largo y suave (leve blur + desplazamiento).
- Al **cerrar overlays** (la ficha/sheet) el panel y el fondo se animan hacia afuera antes de ocultarse, en vez de desaparecer de golpe. Respeta `prefers-reduced-motion`.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 29. 🚧 [PRB · Leyendo] "Agregar libro" lo pone realmente en Leyendo
- Agregar un libro desde **Leyendo** ahora lo marca como *leyendo* para el usuario activo y aparece al instante (antes solo lo sumaba a la biblioteca sin marcarlo, así que no se veía pero el re-agregado decía "ya está").
- Si el libro ya está en la biblioteca, desde Leyendo se puede elegir igual para ponerlo en curso.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 30. 🚧 [Ambos · Perfil] Reseñas y watchlist con teaser desenfocado, sin "Ver todas"
- En el perfil, **Últimas reseñas** y **Watchlist** ahora usan el mismo recorte desenfocado que **Mejor rankeadas** (media fila extra borrosa + **Ver más** encima). Se portó el sistema a PRB (reseñas y mejor rankeados) para paridad con PWM.
- Se sacó el botón **"Ver todas"** de arriba de cada sección; el **Ver más** del recorte es ahora el único control (se convierte en **Ver menos** al expandir).
- Reseñas muestra **2 y la tercera ya entra en el desenfoque** (media fila).
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 31. 🚧 [Ambos · Entrar] Gate "¿Quién sos?" con users destacados en neón
- Los usuarios reales van arriba, con **glow neón permanente en el color que cada uno eligió**.
- **Invitado** y **Crear usuario** quedan agrupados abajo, en una fila secundaria de la misma jerarquía, separados por una línea.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 32. 🚧 [Ambos · Puntaje] Escribir el puntaje exacto tocando el número
- Las estrellas siguen funcionando igual que siempre: se tocan y puntúan de media en media (3, 3.5, 4…).
- **Tocando el número** se abre un campo para escribir el valor exacto: 3.1, 3.2, 3.8, 4.2. Un decimal.
- Enter confirma, Escape cancela, salir del campo confirma. Dejarlo **vacío borra el puntaje**.
- Acepta coma o punto (`4,2` y `4.2` valen lo mismo) y recorta fuera de rango (`7` queda en 5).
- Un texto que no sea un número **no borra nada**: deja el puntaje como estaba.
- Funciona en los tres lugares donde se puntúa: ficha de peli, Modo relámpago y ficha de libro.
- **Cómo puntuás** agrupa a la media estrella más cercana, así un 3.8 cuenta en la barra del 4 en vez de desaparecer del gráfico; el detalle de cada barra usa el mismo criterio.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 33. 🚧 [Ambos · Marca] Logo propio en la pestaña del navegador
- El favicon deja de ser el círculo rojo / cuadrado azul genéricos y pasa a ser el logotipo de cada app: **PWM en rosa** (`#FF0055`) y **PRB en azul** (`#2764CF`).
- Los SVG van **tal cual los pasó Lucas**, apaisados (540×178, con el borde inclinado), sin recuadre ni relleno. El navegador los encaja en el espacio cuadrado de la pestaña respetando la proporción: se ven como una banda de color con la palabra al medio.
- ⚠️ Decisión tomada por Lucas después de ver la medición: a 16px la palabra ocupa 2px de alto y no se lee. Se eligió el logo íntegro por sobre la legibilidad en la pestaña.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 34. 🚧 [PWM · Letterboxd] Sincronización automática de reseñas nuevas + aviso
- El Action ahora corre un modo liviano **cada 15 minutos** que mira solo el RSS de cada uno (una request por persona, sin TMDB ni watchlists) y trae las reseñas nuevas. El refresco completo sigue igual, una vez por día.
- Cuando entra algo nuevo, llega una **notificación** al centro de siempre que dice *"[usuario] publicó una reseña **desde Letterboxd**"*, con ícono de sincronización para distinguirla de las que se escriben adentro de la página. Se ve tanto en PWM como en PRB.
- **Nunca pisa lo tuyo.** Una reseña escrita en PWM siempre gana; y en el baseline, si ya había una reseña importada, el RSS no la reemplaza (el RSS le come las comillas al texto, la página de reseñas lo trae entero).
- Si la película no la tenía nadie en su watchlist, el sync **también la crea**; si no, la reseña se guardaba pero no se veía en ningún lado hasta el refresco del día siguiente.
- Si no hay novedades no escribe nada: sin commit y sin deploy.
- ⚠️ **1 minuto no es posible:** el cron de GitHub tiene piso de 5 minutos y encima se atrasa seguido. 15' es el equilibrio entre latencia y ruido en el historial; cambiarlo es tocar un número en el workflow.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 35. 🚧 [Ambos · Ruteo] Recargar en el perfil de otro te deja ahí
- Antes la URL decía solo `#perfil`, sin decir de quién: al recargar parado en el perfil de Bian volvías al tuyo.
- Ahora el perfil visitado va en la propia URL (`#perfil/bian`), así que **F5 te deja donde estabas** y Atrás/Adelante también distinguen entre un perfil y otro.
- Si el usuario del link ya no existe (cuenta borrada, link viejo), cae a tu perfil en vez de quedar en blanco.
- Aplica igual en PWM y en PRB.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 36. 🚧 [Ambos · Marca] Logo en el header
- El header deja de mostrar el texto **PWM.** / **PRB.** y pasa a mostrar el logotipo.
- Es el **mismo archivo** que usa la pestaña (`assets/logo-pwm.svg` y `prb/assets/logo-prb.svg`, renombrados desde `favicon-*`): un solo lugar donde cambiar la marca.
- Alto fijo de 1.7rem (unos 27px) y el ancho sale de la proporción del propio SVG, así el header no salta mientras carga.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 37. 🚧 [PWM · Reseñas] "Últimas reseñas" ordenadas por cuándo se publicaron
- Las reseñas que entran desde Letterboxd no tenían ninguna fecha, así que empataban todas en cero y quedaban en el orden en que estaban en el archivo: la última que hizo Bian aparecía tercera.
- Ahora el sync trae la **fecha de publicación** del feed y tanto el perfil como el inicio ordenan por eso, de la más nueva a la más vieja.
- Va en un campo aparte de la fecha en que la vio, a propósito: esa alimenta el timeline y "este año", y mezclarlas rompería esas cuentas.
- Completar las fechas de las reseñas viejas **no genera notificaciones** — si no, la primera corrida avisaría de todas juntas.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 38. 🚧 [Infra] Sello de versión, crons y corridas simultáneas
- El pipeline **dejó de pisar el número de versión**: lo tenía fijo en `1.4` y lo reescribía en cada refresco de datos, así que el pie de PWM se reseteaba solo mientras el de PRB seguía subiendo. Ahora lee el que ya está y solo actualiza la fecha. Las dos apps quedaron en **1.35**.
- **De tres crons a dos.** El de cada 10 minutos solo servía para importar a alguien que se acababa de registrar; eso ahora lo hace el de 15. GitHub estaba descartando ~9 de cada 10 corridas programadas y tener dos seguidas compitiendo lo empeoraba — por eso el refresco diario no corría hacía días, y por eso nadie vio que el token de TMDB estaba roto.
- Se agregó un **candado de simultaneidad**: dos corridas a la vez commitean y pushean el mismo archivo y se pisan.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 39. ✅ [Ambos · GIFs] La búsqueda deja de quedar cargando para siempre
- Las consultas de GIF ahora se cancelan si el proveedor no responde en 5 segundos. Antes una conexión colgada dejaba el selector eternamente en **“Buscando GIFs…”**.
- El arreglo cubre foto de perfil, GIF de reseña y fondo personalizado en PWM y PRB. La primera solución usaba Wikimedia como respaldo; el punto 40 la reemplaza por el proxy de GIPHY para mejorar la relevancia.
- Estado: **✅ resuelto y reemplazado por la implementación del punto 40.**

## 40. 🚧 [Ambos · GIFs] Resultados relevantes desde GIPHY
- Se eliminó Wikimedia Commons como respaldo: encontraba archivos históricos que coincidían con las palabras, pero no GIFs de reacción útiles.
- GIPHY ahora se consulta mediante un Worker propio de Cloudflare, porque `api.giphy.com` queda bloqueado en algunas conexiones. La clave vive como secreto del Worker y ya no aparece en el frontend.
- La búsqueda conserva la frase exacta, pide resultados en español para Argentina, pagina de a 24 y muestra la atribución de GIPHY. Si el proveedor falla, se muestra un error en vez de resultados basura.
- Probado con **“avatar aang”**: devuelve 24 resultados de Avatar: The Last Airbender en la primera página.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 41. 🚧 [Ambos · Reseñas] Fotos en la reseña, visibles solo al abrirla
- En el formulario de la reseña hay un botón **Fotos**: subís hasta **4 imágenes** desde el celular o la compu, con miniaturas y una ✕ para sacar cualquiera. Se guardan solas, no hace falta apretar "Guardar reseña".
- **No se ven en ningún lado hasta abrir la reseña.** Ni en las tarjetas del inicio, ni en "Lo que dijeron los demás". Ahí solo aparece un aviso chiquito (`📷 Tiene fotos — abrí la reseña`) y un iconito en el chip del usuario, para que se sepa que hay algo.
- Con la reseña abierta se muestran en una galería; tocando una se abre a **pantalla completa** con flechas, contador y Escape para salir.
- **Peso:** una foto de 8MB entra reescalada a 1280px y ~170KB (el recorte pasa por el navegador, igual que la foto de perfil). Un GIF de hasta 1MB se guarda animado; uno más pesado se aplana a foto.
- **Cómo se guardan:** una fila propia de `settings` por reseña (`reviewpix:<id>:<usuario>`), que queda **afuera** de la carga inicial — se pide recién cuando abrís esa reseña. Así el arranque de la app no se hace más lento por más fotos que haya. Tampoco se guardan en el navegador (llenarían el almacenamiento local).
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 42. 🚧 [Ambos · Reseñas] Compartir el link de una reseña
- Con la reseña abierta hay un botón **Compartir** arriba a la derecha, al lado de *Editar*. En el celular abre el menú de compartir de siempre (WhatsApp, Telegram, lo que uses); en la compu **copia el link** y avisa con un cartelito.
- Anda con **cualquier** reseña, la tuya o la del otro.
- El que abre el link cae **directo en esa reseña**, con las fotos y todo. Si todavía no eligió perfil, primero entra y la reseña se abre sola apenas pasa.
- Si el link quedó viejo (la peli o el libro ya no está), avisa *"Esa reseña ya no está disponible"* en vez de no hacer nada.
- La dirección queda limpia una vez que abre, así no te llevás los parámetros puestos al navegar.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 43. 🚧 [Ambos · Reseñas] El link abre una tarjeta en el medio, no el panel del costado
- Quien entra por un link de reseña ve una **tarjeta centrada** en la pantalla, con la portada arriba, la reseña, las fotos y el puntaje. El panel lateral queda para cuando navegás adentro de la página: el que llega de afuera viene a leer **esa** reseña, no a recorrer la ficha.
- Abajo tiene los botones: **Ver perfil de [quien la escribió]**, **Ver la ficha** de la peli/libro, y **Cerrar y seguir** (también se cierra con la ✕, tocando afuera o con Escape). Al cerrar quedás en la página, donde estabas.
- El **me gusta** de la reseña está adentro de la tarjeta. Si la reseña es tuya, en vez del corazón aparece **Editar**.
- Las fotos se abren a pantalla completa desde la misma tarjeta, sin cerrarla.
- En el celular la tarjeta entra desde abajo y ocupa el ancho completo.
- De paso: si a `escapeHtml` le llegaba un número (el año, por ejemplo) reventaba el render entero de quien lo llamara. Ahora convierte a texto en vez de romper — era una bomba de tiempo en las dos apps.
- Estado: **🚧 hecho, falta aprobación de Lucas.**

## 44. 🚧 [Musuq Pacha] Generador de símbolos de pueblos originarios
- **Vive en su propio repo**, `github.com/lucasdonadio01/musuq-pacha`, y está publicado en **https://lucasdonadio01.github.io/musuq-pacha/**. Se abre `index.html` y listo: **no necesita internet ni instalar nada**.
- **La portada es un mosaico**: la pantalla entera se llena de baldosas, cada una con su propio símbolo y su color de fondo, y en el medio el bloque negro con **MUSUQ PACHA** y el botón **empezar**. Alrededor del mosaico queda un marco por donde se ve el fondo de píxeles moverse.
- **Las baldosas van cambiando solas**: cada segundo cambia una parte (no todas juntas), y cambian con **el mismo morph que el mini juego** — los píxeles viajan de una figura a la otra — mientras el color de fondo de la baldosa se cruza al nuevo. Nunca queda quieto.
- **Pasando el mouse por el mosaico** la baldosa se agranda, y **las de alrededor también un poco**, así se levanta como una ola. La que tenés debajo del cursor se queda quieta (no se regenera). Si barrés, quedan varias grandes atrás. **Un click en una baldosa le genera un símbolo nuevo.** Las baldosas cambian cada **0,7 segundos** y no salen calaveras.
- Al tocar **empezar**, la pantalla se tapa de píxeles y aparece el generador.
- **Elegís el pueblo** (Omaguaca, Diaguita, Querandí, Comechingón, Guaraní, Mapuche, Tehuelche y Selk'nam) y te propone los colores de su territorio: cada color tiene nombre y sale del bioma o de materiales documentados (ocre de quebrada, urucú, quillango, azul de witral).
- **Abajo de la lista hay un mapa de Argentina hecho con píxeles** y se pinta la zona donde estuvo ese pueblo. El contorno no está dibujado a mano: es Natural Earth rasterizado con la misma proyección del tablero.
- **Generás al azar con el botón o con la tecla G.** Las **flores tienen ocho especies** distintas (margarita, girasol, estrella, trébol, anillos, capullo, doble y espiga) y los **mandalas cinco trazas** (incluida la chakana andina). Entre flores y mandalas sale el **65 %** de las generaciones. El demonio es ahora una **careta de oni japonés** con tres estilos de cuerno, y sale poco. Los abstractos también bajaron.
- **Todas son simétricas, siempre.** El espejo se fuerza al final de la generación, así que ya no puede salir una figura torcida como las que no te gustaban.
- **Cada símbolo tiene su semilla**, que se ve abajo del nombre del pueblo y en la barra de abajo (`semilla 2735-CC9B`). Es la firma única de esa generación: con la misma semilla vuelve a salir el mismo dibujo, y va en el nombre del PNG.
- **El paso de un símbolo al otro es un morph, no un cambio seco:** cada píxel se queda con el lugar más cercano del símbolo nuevo y **viaja hasta ahí** haciendo una curva, achicándose un poco en el medio y cambiando de color en el camino, escalonado desde el centro hacia afuera. Los que sobran se achican hasta desaparecer y los que faltan nacen del centro. Es el efecto de `species-in-pieces.com`.
- **Herramientas con iconos** (Google Material) y atajos: **Q** pincel, **W** borrador, **E** selección, **I** copiar un color del dibujo. Con selección marcás varias celdas y les cambiás el color a todas juntas. Con *espejo al pintar* prendido, pintás de un lado y aparece del otro.
- **Los píxeles tienen una sombra corta** para que se despeguen del fondo.
- **Configurable:** color de fondo (cualquiera, y si es oscuro se invierten los textos solos) y grilla de 7×7 a 13×13, por defecto **11 × 11**.
- El fondo de toda la página es el PixelBlast de reactbits rehecho a mano: cuadrados parejos con dithering, claros vacíos y manchas densas, que reaccionan al mouse y tiran ondas al hacer click y al generar. **Contrasta con cualquier fondo**, incluso un rojo pleno, porque se mezcla hacia el blanco o el negro en vez de sumar un valor fijo.
- **Se baja en PNG** (2000 px) con el fondo animado, el símbolo y las volantas de los costados con el nombre del pueblo, la familia, la generación, la semilla y los colores usados — igual que las referencias que pasaste.
- Estado: **🚧 hecho, falta aprobación de Lucas.**
