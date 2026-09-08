# MUSUQ PACHA · Generador de símbolos

Minijuego web donde se arma el **símbolo de un pueblo originario** sobre una grilla:
se genera al azar o se pinta píxel por píxel, y se baja como PNG.

Abrir `index.html`. **No hay build, no hay npm, no hay pedidos externos:** ni Google
Fonts, ni CDN, ni three.js. Todo lo que necesita está en esta carpeta, que es lo que
pide la entrega offline del TP2.

## Qué hay adentro

| Archivo | Qué resuelve |
|---|---|
| `js/pueblos.js` | Los 8 pueblos, su bioma y su paleta. Los colores salen del territorio y de materiales documentados (tierras, minerales, tintes, lanas), no de gusto |
| `js/mapa.js` | Argentina rasterizada a 22 × 50 píxeles, con la zona de cada pueblo marcada. Sale de Natural Earth 110m con la misma proyección Albers del tablero |
| `js/fondo.js` | El **PixelBlast** de reactbits porteado a WebGL crudo: un fragment shader, sin three.js ni postprocessing |
| `js/pixelswap.js` | El **Pixel Swap** de reactbits: grilla de celdas que tapa la pantalla, cambia lo de abajo y se retira. Es el barrido que entra al generador |
| `js/simbolo.js` | La grilla, las familias de patrones, la semilla y el **morph** entre generaciones |
| `js/app.js` | La interfaz y la descarga |

## Las cuatro decisiones que importan

**El morph, que es lo de `species-in-pieces.com`.** Cuando pasás de una generación a
otra, ningún píxel se apaga y se vuelve a prender: cada píxel encendido **conserva su
identidad**. Se emparejan por cercanía (voraz, sobre todos los pares ordenados por
distancia) los píxeles de ahora con las celdas del símbolo nuevo, y cada uno **viaja**
hasta su destino con arco, escalonado por distancia al centro, `easeInOutQuart` de
920 ms, achicándose un 16 % en el medio del vuelo e interpolando su color en el camino.
Los que sobran se van hacia afuera achicándose a cero; los que faltan nacen del centro.
El que ya estaba en su lugar casi no se mueve, que es lo que hace que se lea como una
figura que se reacomoda y no como una que se borra.

**Seis familias de patrones, una semilla.** `organico` crece por vecindad sobre media
grilla y espeja; `flor` recorta pétalos con `cos(ángulo · n)`; `mandala` sortea un
octante y lo replica ocho veces; `calavera`, `demonio` y `animal` son plantillas con
variación. Todo sale de un `mulberry32` sembrado, así que **la semilla que se muestra
abajo del nombre del pueblo reproduce el símbolo exacto** — `Simbolo.generar(t, 0x2735CC9B)`
devuelve el mismo dibujo. Es la firma única de cada generación.

**El fondo es dithering ordenado, no ruido.** El campo de ruido pasa por un `smoothstep`
que aplasta a cero todo lo que está por debajo del piso, y después se compara contra una
matriz de Bayer 4×4. Eso da lo del referente: claros de verdad vacíos, núcleos macizos y
un fleco deshilachado en el borde. Sin el `smoothstep` el ruido tramaba la pantalla
entera de forma pareja, que no es el efecto.

**Todo se compone en un solo lugar.** `Simbolo.componer()` dibuja la grilla de puntos,
los píxeles con su sombra y las volantas de los costados, y la usan por igual la pantalla
y el PNG. Lo que ves es exactamente lo que baja.

## Controles

- **Pueblo:** cambia la paleta, el fondo sugerido, la zona marcada en el mapa y genera
- **`Q`** pincel · **`W`** borrador · **`E`** selección · **`I`** copiar color · **`G`** generar · `Esc` limpia la selección
- Con **selección** marcás las celdas que querés y después tocás un color para cambiarlas todas juntas
- **Fondo:** cualquier color. La tinta se invierte sola si el fondo es oscuro, y los puntos
  del PixelBlast se mezclan hacia el blanco o el negro (nunca con un delta: sobre un rojo
  pleno sumar unidades no cambia nada y desaparecían)
- **Grilla** 7 / 9 / 11 / 13, por defecto 11 · **espejo al pintar**

## Pendiente

- **`file://` no está verificado.** Anda servido por HTTP (probado). Como no hay módulos
  ES ni imágenes externas, en Chrome debería abrir con doble clic, pero conviene
  confirmarlo antes de mandarlo a la cátedra
- Los símbolos son **generativos, no reproducciones** de iconografía real de cada pueblo.
  Si van al informe, hay que decirlo así
- Las zonas del mapa son **aproximaciones por latitud y longitud**, no territorios
  citables. Mismo problema que los biomas del tablero (ver `assets/README.md`)
- El codificador GIF se sacó a pedido de Lucas. Está en el historial de git si vuelve a hacer falta
