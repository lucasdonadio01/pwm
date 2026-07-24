# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Los usuarios principales son Lucas (Luke) y Bian, que usan la aplicación juntos para organizar, descubrir y registrar películas, series y libros.
- Cualquier persona que reciba el enlace puede crear su propio perfil. No se busca difusión pública masiva: Lucas comparte el enlace con un grupo reducido.
- También existe un modo Invitado de solo lectura para recorrer el contenido sin crear una cuenta.
- Cada perfil conserva su nombre, foto o GIF animado, color, contraseña, usuario de Letterboxd y actividad propia.

## Product Purpose

PWM y PRB forman una aplicación compartida para descubrir contenido, decidir qué ver o leer, registrar actividad y comparar gustos.

Aunque el producto puede ser usado por más personas, su centro sigue siendo el uso cotidiano de Lucas y Bian: elegir juntos, compartir listas y calendarios, y conservar un historial personal y compartido.

El producto tiene dos áreas conectadas:

- **PWM — Project Watch Movies:** películas y series.
- **PRB — Project Read Books:** libros y seguimiento de lectura.

El éxito significa que los usuarios puedan encontrar qué consumir, organizarlo y registrar su experiencia sin depender de varias aplicaciones separadas.

## Positioning

Una biblioteca privada y colaborativa para un grupo pequeño, que combina películas, series y libros bajo los mismos perfiles.

Su mecanismo distintivo es conectar en un mismo espacio:

- importación de actividad de Letterboxd;
- puntuaciones, reseñas, likes y fechas;
- watchlists y prioridades;
- tier lists personales o compartidas;
- calendarios con invitaciones;
- seguimiento de lectura;
- identidad y sesión compartidas entre PWM y PRB.

## Operating Context

- Lucas comparte manualmente el enlace de GitHub Pages con las personas que quiere invitar.
- Al entrar, una persona puede elegir un perfil existente, usar el modo Invitado o crear un usuario nuevo.
- PWM y PRB comparten las mismas cuentas, fotos, contraseñas y sesión activa.
- Los usuarios alternan entre teléfono y computadora, por lo que la interfaz debe seguir funcionando de forma responsive y táctil.
- La actividad se sincroniza entre dispositivos mediante Supabase y mantiene una copia local para tolerar problemas de conexión.
- Un proceso automático actualiza los datos públicos de Letterboxd y los metadatos externos.

## Capabilities and Constraints

### Identidad y acceso

- Creación de perfiles desde la aplicación.
- Contraseña numérica por perfil.
- Perfil configurable con nombre, foto, color, descripción y usuario de Letterboxd.
- Modo Invitado de solo lectura.
- No existe un registro público tradicional por correo electrónico.

### PWM

- Home cinematográfico con destacados y tendencias.
- Watchlist combinada y ordenable.
- Catálogos de películas y series con filtros y descubrimiento mediante TMDB.
- Puntuaciones de 0.5 a 5 estrellas, reseñas, likes, fecha y lugar de visualización.
- Modo relámpago para puntuar títulos rápidamente.
- Tier lists personales y compartidas con filas configurables.
- Calendarios personales y compartidos, funciones programadas e invitaciones dirigidas a usuarios concretos, con estados pendiente/confirmado.
- Centro de notificaciones compartido para invitaciones, confirmaciones, nuevas reseñas y likes de reseñas.
- Perfiles con estadísticas, actividad y medallas.

### PRB

- Cuentas compartidas con PWM.
- Biblioteca y prioridades de lectura.
- Seguimiento de libros en curso.
- Puntuaciones, reseñas, likes y fechas.
- Likes sobre reseñas ajenas, con notificación para quien la escribió.
- Tier lists personales y compartidas.

### Datos e infraestructura

- GitHub Pages para alojamiento.
- Supabase para cuentas y estado compartido, con `localStorage` como respaldo local.
- Letterboxd como fuente de watchlists, películas vistas, puntuaciones, likes, fechas y reseñas.
- TMDB para búsqueda, películas, series, imágenes y metadatos.
- OMDb para puntuaciones IMDb y Rotten Tomatoes.
- GitHub Actions para actualizar los datos automáticamente.

### Restricciones confirmadas

- El proyecto debe mantenerse con herramientas y servicios gratuitos.
- La interfaz y los textos están en español rioplatense.
- PWM y PRB deben conservar usuarios y sesión compartidos.
- El sitio es accesible mediante enlace; la privacidad depende de compartirlo solo con personas elegidas, no de ocultarlo de Internet.

## Brand Commitments

- Nombres del producto: **PWM — Project Watch Movies** y **PRB — Project Read Books**.
- Voz cercana, informal y rioplatense.
- La aplicación habla directamente al usuario con expresiones como “vos”, “mirá”, “elegí” y “probá”.
- Las identidades personales se distinguen mediante foto, inicial y color elegido por cada usuario.

## Evidence on Hand

- Watchlists y actividad real de Letterboxd de los usuarios conectados.
- Catálogo generado en `js/data.js`.
- Datos de películas y series obtenidos de TMDB y OMDb.
- Cuentas, puntuaciones, reseñas, likes, tiers, calendarios y configuraciones almacenadas en Supabase.
- Código funcional de PWM y PRB dentro del mismo repositorio.
- No hay testimonios públicos, métricas comerciales ni afirmaciones de crecimiento; futuras páginas no deben inventarlos.

## Product Principles

1. **Primero el uso compartido:** las funciones deben ayudar a elegir, organizar y comentar contenido con otras personas.
2. **Una identidad en todo el producto:** el mismo perfil debe funcionar de manera coherente en PWM y PRB.
3. **Privado por intención, sencillo por acceso:** cualquier persona con el enlace puede crear un perfil, sin convertir la experiencia en una plataforma pública compleja.
4. **Los datos personales siguen siendo editables:** los usuarios controlan sus listas, puntuaciones, reseñas, fechas, tiers y calendarios.
5. **Mantenerlo gratuito y sostenible:** cada función debe respetar la infraestructura gratuita existente y funcionar con degradación razonable cuando un servicio externo falla.
