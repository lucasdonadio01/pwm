# PWM — Project Watch Movies

Cine privado para dos: **Bian** (`bianvepelis`) y **Luke** (`LukeLookMovies`). Un "Letterboxd propio"
con hero cinematográfico, puntajes con medias estrellas, reseñas, likes, tier list y recomendador.

Sitio estático (HTML/CSS/JS, sin build). Se sirve tal cual desde GitHub Pages.

## Cómo se arman los datos
`scripts/build-data.mjs` genera `js/data.js`:
- **Watchlists** de Letterboxd (las dos) → películas del hero / watchlist.
- **Vistas** (rating + reseña) desde el **RSS** de cada usuario → tier list + "Ya vimos".
- **TMDB** → backdrops/pósters HD + sinopsis (es) + trailers + géneros.
- **OMDb** → puntajes de IMDb + Rotten Tomatoes.
- **TMDB trending** → sección "del momento".

Correr localmente:
```bash
TMDB_TOKEN=<token v4 read> OMDB_KEY=<key> node scripts/build-data.mjs
```

## Actualización semanal automática (opcional)
Hay un workflow listo en `.github/_workflows/update-data.yml`. Para activarlo (una vez):
```bash
gh auth refresh -s workflow            # habilita el scope de workflows
git mv .github/_workflows .github/workflows
git commit -am "ci: activar update semanal" && git push
```
Necesita los secrets `TMDB_TOKEN` y `OMDB_KEY` en el repo (Settings › Secrets › Actions).

## Notas
- Estado (rankings/reseñas/likes/tier hechos en la app) se guarda por ahora en `localStorage`.
  Los datos de Letterboxd sí son compartidos (van en `js/data.js`). Sincronización en la nube (Supabase) = próximo paso.
- `js/config.js` lleva keys de solo lectura de TMDB/OMDb para el buscador "Agregar peli". Son rotables.
