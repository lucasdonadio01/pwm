# MUSUQ PACHA · Generador de símbolos

Minijuego web donde se arma el **símbolo de un pueblo originario** sobre una grilla:
se genera al azar o se pinta píxel por píxel, y se baja como **PNG** o como **GIF**
animado (el fondo se mueve, así que el GIF tiene sentido).

Abrir `index.html`. **No hay build, no hay npm, no hay pedidos externos:** ni Google
Fonts, ni CDN, ni three.js. Todo lo que necesita está en esta carpeta, que es lo que
pide la entrega offline del TP2.

## Qué hay adentro

| Archivo | Qué resuelve |
|---|---|
| `js/pueblos.js` | Los 8 pueblos, su bioma y su paleta. Los colores salen del territorio y de materiales documentados (tierras, minerales, tintes, lanas), no de gusto |
| `js/fondo.js` | El **PixelBlast** de reactbits porteado a WebGL crudo: un fragment shader, sin three.js ni postprocessing |
| `js/pixelswap.js` | El **Pixel Swap** de reactbits: grilla de celdas que tapa, cambia lo de abajo y se retira. Se usa en el título de la portada y en el barrido que entra al generador |
| `js/simbolo.js` | La grilla, la generación con simetría espejo y el **morph** entre generaciones |
| `js/gif.js` | Codificador GIF89a propio: corte mediano para la paleta + LZW |
| `js/app.js` | La interfaz y las descargas |

## Las tres decisiones que importan

**El morph, que es lo de `species-in-pieces.com`.** Cuando pasás de una generación a
otra, ningún píxel se apaga y se vuelve a prender: cada píxel encendido **conserva su
identidad**. Se emparejan por cercanía (voraz, sobre todos los pares ordenados por
distancia) los píxeles de ahora con las celdas del símbolo nuevo, y cada uno **viaja**
hasta su destino con arco, escalonado por distancia al centro, `easeInOutQuart` de
920 ms, achicándose un 16 % en el medio del vuelo e interpolando su color en el camino.
Los que sobran se van hacia afuera achicándose a cero; los que faltan nacen del centro.
El que ya estaba en su lugar casi no se mueve, que es lo que hace que se lea como una
figura que se reacomoda y no como una que se borra.

**Simetría espejo.** La generación trabaja sobre **media grilla** (tallo central,
crecimiento por vecindad, brazos horizontales, algún hueco) y espeja columna y color.
Por eso siempre lee como emblema. El espejo también se puede dejar prendido para pintar:
pintás de un lado y aparece del otro.

**Todo se compone en un solo lugar.** `Simbolo.componer()` dibuja la grilla de puntos,
los píxeles y las volantas de los costados, y la usan por igual la pantalla, el PNG y
cada cuadro del GIF. Lo que ves es exactamente lo que baja.

## Controles

- **Pueblo:** cambia la paleta recomendada, el fondo sugerido y genera un símbolo nuevo
- **Pincel / borrador / selección:** con selección marcás las celdas que querés y después
  tocás un color de la paleta para cambiarlas todas juntas
- **Fondo:** cualquier color. La tinta se invierte sola si el fondo es oscuro, y los
  puntos del PixelBlast se corren 22 unidades del fondo para contrastar sin pesar
- **Grilla** 7 / 9 / 11 / 13 · **densidad** · **espejo al pintar**
- `G` genera · `Escape` limpia la selección

## Medido

- GIF de 560 × 449, 30 cuadros: **2 s de captura + 0,4 s de codificación, 732 KB**
- PNG a 2000 px de ancho
- La fuente va empotrada en base64 (30 KB) en `css/fuente.css`. El `.woff2` original
  queda en `fuentes/` por si hay que reemplazarla

## Pendiente

- **`file://` no está verificado.** Anda servido por HTTP (probado). Como no hay módulos
  ES ni imágenes externas, en Chrome debería abrir con doble clic, pero conviene
  confirmarlo antes de mandarlo a la cátedra
- Los símbolos son **generativos, no reproducciones** de iconografía real de cada pueblo.
  Si van al informe, hay que decirlo así
