/* MUSUQ PACHA · Símbolos — pueblos, biomas y paletas.
   Los colores no son decorativos: salen del bioma del territorio y de los
   materiales documentados de cada pueblo (tierras, minerales, tintes, lanas).
   Los hex de bioma vienen de musuq-pacha/assets/README.md, sección "Biomas". */

const PUEBLOS = [
  {
    id: 'omaguaca',
    nombre: 'Omaguaca',
    region: 'NOA · Quebrada',
    bioma: 'Quebrada de Humahuaca',
    fondo: '#F2EDE5',
    nota: 'Tierras del cerro y verde de cardón',
    colores: [
      { h: '#B5654A', n: 'ocre de quebrada' },
      { h: '#D9A88A', n: 'arcilla rosada' },
      { h: '#D4B078', n: 'amarillo de puna' },
      { h: '#6E7F5C', n: 'verde de cardón' },
      { h: '#2E2A28', n: 'negro de horno' },
      { h: '#E7DFD3', n: 'tiza de cerro' }
    ]
  },
  {
    id: 'diaguita',
    nombre: 'Diaguita',
    region: 'NOA · Valles',
    bioma: 'Valles calchaquíes',
    fondo: '#F1ECE2',
    nota: 'Cerámica santamariana: negro sobre crema',
    colores: [
      { h: '#A63D2F', n: 'rojo santamariano' },
      { h: '#E3D3B4', n: 'crema de urna' },
      { h: '#211E1C', n: 'negro de pintura' },
      { h: '#C08A4E', n: 'ocre calchaquí' },
      { h: '#6B7A4F', n: 'verde de algarrobo' },
      { h: '#8C5A4A', n: 'tierra de valle' }
    ]
  },
  {
    id: 'querandi',
    nombre: 'Querandí',
    region: 'Buenos Aires · Pampa',
    bioma: 'Pampa',
    fondo: '#EEF0E8',
    nota: 'Pasto seco, cuero y barranca de río',
    colores: [
      { h: '#A8B472', n: 'pasto seco' },
      { h: '#9C7B4F', n: 'cuero de venado' },
      { h: '#8E9AA0', n: 'gris de barranca' },
      { h: '#C9AE7E', n: 'ocre de pampa' },
      { h: '#262523', n: 'negro de carbón' },
      { h: '#E4E0D2', n: 'pluma de ñandú' }
    ]
  },
  {
    id: 'comechingon',
    nombre: 'Comechingón',
    region: 'Sierras centrales',
    bioma: 'Monte y sierra',
    fondo: '#F2EEE8',
    nota: 'Pinturas rupestres de Cerro Colorado',
    colores: [
      { h: '#A8402F', n: 'rojo de Cerro Colorado' },
      { h: '#EDE6DA', n: 'blanco de cal' },
      { h: '#2B2724', n: 'negro de manganeso' },
      { h: '#6F7F5A', n: 'verde de sierra' },
      { h: '#C08F53', n: 'ocre serrano' },
      { h: '#8A6A57', n: 'madera de tala' }
    ]
  },
  {
    id: 'guarani',
    nombre: 'Guaraní',
    region: 'Litoral',
    bioma: 'Selva paranaense',
    fondo: '#ECEFE8',
    nota: 'Tierra colorada, urucú y genipa',
    colores: [
      { h: '#9E4B2C', n: 'tierra colorada' },
      { h: '#2F5E3A', n: 'verde de selva' },
      { h: '#5E8C4A', n: 'verde de yerba' },
      { h: '#C8492B', n: 'urucú' },
      { h: '#2A3340', n: 'genipa' },
      { h: '#DCD3BC', n: 'fibra de caraguatá' }
    ]
  },
  {
    id: 'mapuche',
    nombre: 'Mapuche',
    region: 'Patagonia norte',
    bioma: 'Bosque andino',
    fondo: '#ECEEF1',
    nota: 'Tintes del witral mapuche',
    colores: [
      { h: '#2C4A6E', n: 'azul de witral' },
      { h: '#8E2F2A', n: 'rojo kelü' },
      { h: '#22201F', n: 'negro kurü' },
      { h: '#E8E2D6', n: 'blanco lig' },
      { h: '#5C6B45', n: 'verde de ñire' },
      { h: '#B08A4E', n: 'amarillo de michay' }
    ]
  },
  {
    id: 'tehuelche',
    nombre: 'Tehuelche',
    region: 'Patagonia · Estepa',
    bioma: 'Estepa patagónica',
    fondo: '#F0EEE9',
    nota: 'Quillango de guanaco pintado',
    colores: [
      { h: '#B08A5E', n: 'ocre de quillango' },
      { h: '#B0A894', n: 'gris de estepa' },
      { h: '#96412F', n: 'rojo de hematita' },
      { h: '#232120', n: 'negro de carbón' },
      { h: '#E6DCCB', n: 'blanco de guanaco' },
      { h: '#7A8B7E', n: 'verde de coirón' }
    ]
  },
  {
    id: 'selknam',
    nombre: "Selk'nam",
    region: 'Tierra del Fuego',
    bioma: 'Estepa fueguina',
    fondo: '#EEEFF0',
    nota: 'Los tres colores del Hain',
    colores: [
      { h: '#A33B2E', n: 'rojo de ocre' },
      { h: '#EFE9DE', n: 'blanco de tiza' },
      { h: '#1D1B1A', n: 'negro de carbón' },
      { h: '#7E8A8C', n: 'gris de canal' },
      { h: '#B98A55', n: 'ocre fueguino' },
      { h: '#4C5B5E', n: 'azul de témpano' }
    ]
  }
];

/* Paleta viva: los colores de marca del proyecto. No reemplazan a las paletas
   de los pueblos —esas son el argumento de la tesis y se usan en el juego—
   sino que se suman a ellas en el mosaico de la portada, donde lo que importa
   es que las combinaciones sean brillantes y salten a la vista. */
const PALETA_VIVA = [
  { h: '#1D7AA9', n: 'azul' },
  { h: '#B2E139', n: 'lima' },
  { h: '#6B8703', n: 'oliva' },
  { h: '#F47ADD', n: 'rosa' },
  { h: '#FFB33F', n: 'ámbar' },
  { h: '#9C3A01', n: 'tierra quemada' },
  { h: '#D92F1B', n: 'rojo' },
  { h: '#F66227', n: 'naranja' }
];
