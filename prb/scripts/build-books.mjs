/* PRB — Project Read Books — data pipeline
 * Curated catalog (dystopian sci-fi heavy + philosophy + novels). Synopses authored in Spanish.
 * Covers fetched from Open Library (free, no key). Writes ../js/data.js.
 *
 * Run:  node prb/scripts/build-books.mjs
 */
import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'js', 'data.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// slug helper
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Curated seed — feat = show in the home hero.
const SEED = [
  { title: '1984', author: 'George Orwell', year: 1949, genres: ['Distopía', 'Ciencia ficción', 'Clásico'], feat: true, synopsis: 'Winston Smith vive bajo la vigilancia total del Gran Hermano y empieza a soñar con la libertad de pensar. La distopía definitiva sobre el poder y la verdad.' },
  { title: 'Brave New World', author: 'Aldous Huxley', year: 1932, genres: ['Distopía', 'Ciencia ficción', 'Clásico'], feat: true, synopsis: 'Un mundo “feliz” de castas diseñadas, placer químico y libertad abolida. La cara amable —y más inquietante— del totalitarismo.' },
  { title: 'Fahrenheit 451', author: 'Ray Bradbury', year: 1953, genres: ['Distopía', 'Ciencia ficción', 'Clásico'], feat: true, synopsis: 'Un bombero cuya misión es quemar libros empieza a cuestionar el mundo sin memoria que ayuda a sostener.' },
  { title: 'We', author: 'Yevgueni Zamiatin', year: 1924, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'En el Estado Único todos son números y la razón lo ordena todo, hasta que el amor irrumpe. La abuela de todas las distopías.' },
  { title: 'The Handmaid’s Tale', author: 'Margaret Atwood', year: 1985, genres: ['Distopía', 'Ciencia ficción'], feat: true, synopsis: 'En la teocracia de Gilead las mujeres fértiles son propiedad del Estado. El relato de Offred, entre el terror y la resistencia.' },
  { title: 'Do Androids Dream of Electric Sheep?', author: 'Philip K. Dick', year: 1968, genres: ['Ciencia ficción', 'Distopía'], feat: true, synopsis: 'Un cazarrecompensas persigue androides indistinguibles de humanos y se pregunta qué nos hace, en el fondo, reales.' },
  { title: 'Neuromancer', author: 'William Gibson', year: 1984, genres: ['Ciencia ficción', 'Cyberpunk'], feat: true, synopsis: 'Un hacker quemado recibe un último trabajo imposible en el ciberespacio. El libro que fundó el cyberpunk.' },
  { title: 'Snow Crash', author: 'Neal Stephenson', year: 1992, genres: ['Ciencia ficción', 'Cyberpunk'], feat: false, synopsis: 'Un repartidor de pizzas y hacker persigue un virus que ataca tanto a las computadoras como a las mentes en el Metaverso.' },
  { title: 'The Dispossessed', author: 'Ursula K. Le Guin', year: 1974, genres: ['Ciencia ficción', 'Filosofía'], feat: false, synopsis: 'Un físico viaja entre un mundo anarquista y otro capitalista buscando una teoría que los una. Utopía ambigua y brillante.' },
  { title: 'A Clockwork Orange', author: 'Anthony Burgess', year: 1962, genres: ['Distopía', 'Clásico'], feat: false, synopsis: 'Alex y su ultraviolencia, y el Estado que quiere “curarlo”. ¿Puede haber bondad sin libertad de elegir el mal?' },
  { title: 'The Road', author: 'Cormac McCarthy', year: 2006, genres: ['Distopía', 'Novela'], feat: true, synopsis: 'Un padre y su hijo cruzan una tierra arrasada por la ceniza, cargando el fuego de la esperanza. Devastador y luminoso.' },
  { title: 'Never Let Me Go', author: 'Kazuo Ishiguro', year: 2005, genres: ['Ciencia ficción', 'Novela'], feat: false, synopsis: 'Tres jóvenes en un internado inglés descubren de a poco el propósito terrible para el que fueron criados.' },
  { title: 'The Man in the High Castle', author: 'Philip K. Dick', year: 1962, genres: ['Ciencia ficción', 'Distopía'], feat: false, synopsis: 'Una ucronía donde el Eje ganó la guerra, y un libro prohibido insinúa que la realidad podría ser otra.' },
  { title: 'Parable of the Sower', author: 'Octavia E. Butler', year: 1993, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'En una California colapsada, una joven con hiperempatía funda una nueva fe para sobrevivir al derrumbe.' },
  { title: 'Oryx and Crake', author: 'Margaret Atwood', year: 2003, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'El último humano recuerda cómo la ingeniería genética y la codicia llevaron al fin del mundo.' },
  { title: 'Station Eleven', author: 'Emily St. John Mandel', year: 2014, genres: ['Distopía', 'Novela'], feat: true, synopsis: 'Tras una pandemia que borra la civilización, una troupe itinerante lleva a Shakespeare por los pueblos que quedan.' },
  { title: 'The Children of Men', author: 'P. D. James', year: 1992, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'La humanidad dejó de tener hijos y se apaga sin futuro, hasta que un embarazo lo cambia todo.' },
  { title: 'Slaughterhouse-Five', author: 'Kurt Vonnegut', year: 1969, genres: ['Ciencia ficción', 'Clásico', 'Novela'], feat: false, synopsis: 'Billy Pilgrim quedó “desanclado” en el tiempo y revive el bombardeo de Dresde y su abducción alienígena. Así son las cosas.' },
  { title: 'Solaris', author: 'Stanisław Lem', year: 1961, genres: ['Ciencia ficción', 'Filosofía'], feat: false, synopsis: 'Un océano-planeta consciente materializa los recuerdos más dolorosos de los científicos que lo estudian.' },
  { title: 'Dune', author: 'Frank Herbert', year: 1965, genres: ['Ciencia ficción', 'Aventura', 'Clásico'], feat: true, synopsis: 'En el planeta desértico Arrakis, el joven Paul Atreides se convierte en el eje de una guerra por la especia y el destino.' },
  { title: 'Foundation', author: 'Isaac Asimov', year: 1951, genres: ['Ciencia ficción', 'Clásico'], feat: false, synopsis: 'Hari Seldon predice la caída del Imperio Galáctico y crea una Fundación para acortar la edad oscura que viene.' },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', year: 1969, genres: ['Ciencia ficción', 'Filosofía'], feat: false, synopsis: 'Un enviado llega a un mundo helado donde el género no existe, y debe aprender a ver de nuevo lo humano.' },
  { title: 'Meditaciones', author: 'Marco Aurelio', year: 180, genres: ['Filosofía', 'Clásico'], feat: true, synopsis: 'Los apuntes privados de un emperador estoico consigo mismo: cómo vivir con serenidad, deber y aceptación.' },
  { title: 'Así habló Zaratustra', author: 'Friedrich Nietzsche', year: 1883, genres: ['Filosofía', 'Clásico'], feat: false, synopsis: 'El profeta Zaratustra baja de la montaña a anunciar el superhombre, la muerte de Dios y el eterno retorno.' },
  { title: 'El mito de Sísifo', author: 'Albert Camus', year: 1942, genres: ['Filosofía'], feat: false, synopsis: 'Si la vida es absurda, ¿por qué seguir? Camus responde con la rebeldía lúcida de Sísifo, feliz con su roca.' },
  { title: 'El extranjero', author: 'Albert Camus', year: 1942, genres: ['Filosofía', 'Novela', 'Clásico'], feat: false, synopsis: 'Meursault mata a un hombre bajo el sol y enfrenta a una sociedad que lo condena más por no fingir emociones.' },
  { title: 'El hombre en busca de sentido', author: 'Viktor Frankl', year: 1946, genres: ['Filosofía'], feat: false, synopsis: 'Un psiquiatra sobreviviente de los campos nazis explica cómo el sentido puede sostenernos en el peor sufrimiento.' },
  { title: 'Crimen y castigo', author: 'Fiódor Dostoievski', year: 1866, genres: ['Novela', 'Filosofía', 'Clásico'], feat: true, synopsis: 'Raskólnikov comete un asesinato para probar una teoría, y la culpa lo persigue más que cualquier ley.' },
  { title: 'Cien años de soledad', author: 'Gabriel García Márquez', year: 1967, genres: ['Novela', 'Clásico'], feat: true, synopsis: 'La saga de los Buendía en Macondo, donde lo mágico y lo real conviven a lo largo de siete generaciones.' },
  { title: 'El maestro y Margarita', author: 'Mijaíl Bulgákov', year: 1967, genres: ['Novela', 'Fantasía', 'Clásico'], feat: false, synopsis: 'El diablo visita la Moscú soviética con un séquito disparatado, mientras se cruza una historia de amor y de fe.' },
  { title: 'Un mundo feliz revisitado', author: 'Aldous Huxley', year: 1958, genres: ['Filosofía', 'Ensayo'], feat: false, synopsis: 'Huxley vuelve sobre su distopía para ver cuánto de ella ya llegó: propaganda, consumo y control blando.' },
  { title: 'Roadside Picnic', author: 'Arkady y Boris Strugatsky', year: 1972, genres: ['Ciencia ficción'], feat: false, synopsis: 'Tras una visita alienígena quedan “Zonas” con objetos imposibles; los stalkers arriesgan la vida por rescatarlos.' },

  // ── Futuros distópicos & sci-fi (tanda 2) ─────────────────────────
  { title: 'Los juegos del hambre', author: 'Suzanne Collins', year: 2008, genres: ['Distopía', 'Ciencia ficción', 'Aventura'], feat: true, synopsis: 'En Panem, cada año dos jóvenes de cada distrito pelean a muerte por TV. Katniss se ofrece en lugar de su hermana y enciende una rebelión.' },
  { title: 'En llamas', author: 'Suzanne Collins', year: 2009, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'Katniss se volvió símbolo de la rebelión y el Capitolio responde con un Vasallaje que reúne a los vencedores en la arena.' },
  { title: 'Sinsajo', author: 'Suzanne Collins', year: 2010, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'La guerra abierta contra el Capitolio convierte a Katniss en el rostro de una revolución que también tiene su costado oscuro.' },
  { title: 'Divergente', author: 'Veronica Roth', year: 2011, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'Una sociedad dividida en facciones por virtudes; Tris no encaja en ninguna y ese secreto la vuelve un peligro.' },
  { title: 'El corredor del laberinto', author: 'James Dashner', year: 2009, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'Thomas despierta sin memoria en un claro rodeado por un laberinto mortal que cambia cada noche.' },
  { title: 'Ready Player One', author: 'Ernest Cline', year: 2011, genres: ['Ciencia ficción', 'Cyberpunk', 'Aventura'], feat: true, synopsis: 'En un futuro que vive dentro del OASIS, un cazatesoros nerd persigue el huevo de pascua que hereda un imperio virtual.' },
  { title: 'El marciano', author: 'Andy Weir', year: 2011, genres: ['Ciencia ficción'], feat: true, synopsis: 'Un astronauta queda varado y dado por muerto en Marte y usa ciencia, humor y papas para sobrevivir.' },
  { title: 'Proyecto Hail Mary', author: 'Andy Weir', year: 2021, genres: ['Ciencia ficción'], feat: true, synopsis: 'Un hombre despierta solo en una nave sin recordar quién es, y descubre que carga la última esperanza de la Tierra.' },
  { title: 'El problema de los tres cuerpos', author: 'Liu Cixin', year: 2008, genres: ['Ciencia ficción'], feat: true, synopsis: 'Un videojuego imposible y una señal del espacio revelan un primer contacto que pone en jaque a toda la humanidad.' },
  { title: 'El juego de Ender', author: 'Orson Scott Card', year: 1985, genres: ['Ciencia ficción', 'Clásico'], feat: false, synopsis: 'Un niño prodigio es entrenado en una escuela de guerra orbital para liderar a la humanidad contra una raza alienígena.' },
  { title: 'Hyperion', author: 'Dan Simmons', year: 1989, genres: ['Ciencia ficción'], feat: false, synopsis: 'Siete peregrinos viajan hacia las Tumbas del Tiempo y la criatura Alcaudón, contando cada uno su historia como en Canterbury.' },
  { title: 'Carbono modificado', author: 'Richard K. Morgan', year: 2002, genres: ['Ciencia ficción', 'Cyberpunk'], feat: false, synopsis: 'En un futuro donde la mente se descarga en cuerpos intercambiables, un ex soldado investiga la “muerte” de un millonario.' },
  { title: 'Amanecer rojo', author: 'Pierce Brown', year: 2014, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'En una Marte de castas de colores, un minero de la casta más baja se infiltra entre los Dorados para derribar el sistema.' },
  { title: 'Siega', author: 'Neal Shusterman', year: 2016, genres: ['Distopía', 'Ciencia ficción'], feat: false, synopsis: 'En un mundo sin muerte natural, unos “segadores” deciden quién muere; dos aprendices cuestionan ese poder absoluto.' },
  { title: 'Klara y el Sol', author: 'Kazuo Ishiguro', year: 2021, genres: ['Ciencia ficción', 'Novela'], feat: false, synopsis: 'Klara, una amiga artificial que adora al Sol, observa el amor y la soledad humanas desde la vidriera de una tienda.' },
  { title: 'Materia oscura', author: 'Blake Crouch', year: 2016, genres: ['Ciencia ficción'], feat: false, synopsis: 'Un físico es secuestrado por una versión de sí mismo y arrojado a un multiverso donde debe encontrar el camino a su vida.' },
  { title: 'Recursión', author: 'Blake Crouch', year: 2019, genres: ['Ciencia ficción'], feat: false, synopsis: 'Una tecnología para revivir recuerdos empieza a reescribir la realidad y la memoria colectiva colapsa.' },
  { title: 'Ubik', author: 'Philip K. Dick', year: 1969, genres: ['Ciencia ficción'], feat: false, synopsis: 'Tras una explosión, un equipo de anti-psíquicos ve el mundo degradarse y el tiempo retroceder. ¿Quién está vivo?' },
  { title: 'El fin de la infancia', author: 'Arthur C. Clarke', year: 1953, genres: ['Ciencia ficción', 'Clásico'], feat: false, synopsis: 'Unos “Superseñores” traen paz a la Tierra, pero el precio es el destino final de la especie humana.' },
  { title: '2001: Una odisea espacial', author: 'Arthur C. Clarke', year: 1968, genres: ['Ciencia ficción', 'Clásico'], feat: true, synopsis: 'De un monolito en la prehistoria a HAL 9000 y más allá de Júpiter: el salto evolutivo de la humanidad.' },
  { title: 'La máquina del tiempo', author: 'H. G. Wells', year: 1895, genres: ['Ciencia ficción', 'Clásico'], feat: false, synopsis: 'Un viajero llega a un futuro lejano donde la humanidad se dividió en dos especies, y descubre el fin de la Tierra.' },

  // ── Mangas (sci-fi / distópicos, + Haikyuu) ───────────────────────
  { title: 'Akira', author: 'Katsuhiro Otomo', year: 1982, genres: ['Manga', 'Ciencia ficción', 'Cyberpunk', 'Distopía'], feat: true, synopsis: 'En Neo-Tokio, poderes psíquicos y una moto roja desatan el caos. La obra cumbre del manga cyberpunk.' },
  { title: 'Ghost in the Shell', author: 'Masamune Shirow', year: 1989, genres: ['Manga', 'Ciencia ficción', 'Cyberpunk'], feat: false, synopsis: 'La mayor Kusanagi, cuerpo cibernético y mente humana, persigue a un hacker que borra la línea entre alma y máquina.' },
  { title: 'Nausicaä del Valle del Viento', author: 'Hayao Miyazaki', year: 1982, genres: ['Manga', 'Ciencia ficción', 'Distopía', 'Fantasía'], feat: true, synopsis: 'En una Tierra arrasada por un bosque tóxico, una princesa busca la armonía entre humanos y naturaleza.' },
  { title: 'Alita: Ángel de combate', author: 'Yukito Kishiro', year: 1990, genres: ['Manga', 'Ciencia ficción', 'Cyberpunk'], feat: false, synopsis: 'Una ciborg amnésica rescatada de un basural busca su identidad en una ciudad chatarra brutal.' },
  { title: '20th Century Boys', author: 'Naoki Urasawa', year: 1999, genres: ['Manga', 'Ciencia ficción', 'Suspense'], feat: false, synopsis: 'Un grupo de amigos descubre que un culto está cumpliendo, punto por punto, la profecía apocalíptica que inventaron de chicos.' },
  { title: 'Pluto', author: 'Naoki Urasawa', year: 2003, genres: ['Manga', 'Ciencia ficción'], feat: false, synopsis: 'Un detective robot investiga el asesinato de los robots más avanzados del mundo, en un thriller sobre qué nos hace humanos.' },
  { title: 'Your Name', author: 'Makoto Shinkai', year: 2016, genres: ['Novela', 'Fantasía', 'Manga'], feat: true, synopsis: 'Dos adolescentes que no se conocen empiezan a intercambiar cuerpos, y una catástrofe los une a través del tiempo.' },
  { title: 'Haikyu!!', author: 'Haruichi Furudate', year: 2012, genres: ['Manga', 'Deporte'], feat: false, synopsis: 'Un chico bajito con un salto imposible sueña con conquistar el vóley junto a un armador genial y rival.' },
];

async function openLibraryCover(title, author, lang) {
  try {
    const u = new URL('https://openlibrary.org/search.json');
    u.searchParams.set('title', title);
    u.searchParams.set('author', author);
    if (lang) u.searchParams.set('language', lang);
    u.searchParams.set('fields', 'cover_i,cover_edition_key');
    u.searchParams.set('limit', '1');
    const r = await fetch(u, { headers: { 'User-Agent': 'PRB/1.0 (project read books)' } });
    if (!r.ok) return null;
    const doc = ((await r.json()).docs || [])[0];
    if (doc && doc.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    if (doc && doc.cover_edition_key) return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-L.jpg`;
    return null;
  } catch { return null; }
}
async function googleBooksCover(title, author, lang) {
  try {
    const u = new URL('https://www.googleapis.com/books/v1/volumes');
    u.searchParams.set('q', `${title} ${author}`); // fuzzy query matches Spanish titles well
    u.searchParams.set('maxResults', '6');
    if (lang) u.searchParams.set('langRestrict', lang);
    const r = await fetch(u);
    if (!r.ok) return null;
    for (const it of ((await r.json()).items || [])) {
      const img = it.volumeInfo && it.volumeInfo.imageLinks;
      if (img && (img.thumbnail || img.smallThumbnail)) return (img.thumbnail || img.smallThumbnail).replace('http://', 'https://').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=2');
    }
    return null;
  } catch { return null; }
}
// English titles for Open Library matching (OL indexes by English work title).
const EN = {
  'Meditaciones': 'Meditations', 'Así habló Zaratustra': 'Thus Spoke Zarathustra',
  'El mito de Sísifo': 'The Myth of Sisyphus', 'El extranjero': 'The Stranger',
  'El hombre en busca de sentido': "Man's Search for Meaning", 'Crimen y castigo': 'Crime and Punishment',
  'Cien años de soledad': 'One Hundred Years of Solitude', 'El maestro y Margarita': 'The Master and Margarita',
  'Un mundo feliz revisitado': 'Brave New World Revisited', 'Los juegos del hambre': 'The Hunger Games',
  'En llamas': 'Catching Fire', 'Sinsajo': 'Mockingjay', 'Divergente': 'Divergent',
  'El corredor del laberinto': 'The Maze Runner', 'El marciano': 'The Martian',
  'Proyecto Hail Mary': 'Project Hail Mary', 'El problema de los tres cuerpos': 'The Three-Body Problem',
  'El juego de Ender': "Ender's Game", 'Carbono modificado': 'Altered Carbon', 'Amanecer rojo': 'Red Rising',
  'Siega': 'Scythe', 'Klara y el Sol': 'Klara and the Sun', 'Materia oscura': 'Dark Matter',
  'Recursión': 'Recursion', 'El fin de la infancia': "Childhood's End",
  '2001: Una odisea espacial': '2001: A Space Odyssey', 'La máquina del tiempo': 'The Time Machine',
  'Nausicaä del Valle del Viento': 'Nausicaa of the Valley of the Wind', 'Alita: Ángel de combate': 'Battle Angel Alita',
  'Haikyu!!': 'Haikyu', 'Un mundo feliz': 'Brave New World',
};
// Spanish cover first (OL by English title + language=spa), then broaden across sources.
async function coverFor(displayTitle, author, enTitle) {
  const au = (author || '').split(/ y | & |,|;/)[0].trim();
  const t = enTitle || displayTitle;
  return (await openLibraryCover(t, au, 'spa'))
    || (await googleBooksCover(displayTitle, au, 'es'))
    || (await openLibraryCover(t, au, null))
    || (await googleBooksCover(t, au, null));
}

async function main() {
  console.log('→ Buscando portadas en Open Library…');
  const books = [];
  let i = 0;
  for (const b of SEED) {
    process.stdout.write(`  [${++i}/${SEED.length}] ${b.title}            \r`);
    const cover = await coverFor(b.title, b.author, EN[b.title]);
    if (!cover) console.warn(`\n  ✗ sin portada: ${b.title}`);
    books.push({
      id: slug(`${b.title}-${b.author}`),
      title: b.title, author: b.author, year: b.year,
      genres: b.genres, synopsis: b.synopsis,
      cover, featured: !!b.feat && !!cover,
    });
    await sleep(120);
  }
  console.log(`\n  ${books.filter((x) => x.cover).length}/${books.length} con portada`);

  const header = `/* PRB — AUTO-GENERATED by prb/scripts/build-books.mjs on ${new Date().toISOString()} */\n`;
  const body =
    `window.PRB = window.PRB || {};\n\n` +
    `PRB.users = {\n` +
    `  bian: { id: 'bian', name: 'Bian', handle: 'bianvepelis',    color: '#22D3EE', initial: 'B' },\n` +
    `  luke: { id: 'luke', name: 'Luke', handle: 'LukeLookMovies', color: '#3D7BFF', initial: 'L' },\n` +
    `};\n\n` +
    `PRB.books = ${JSON.stringify(books, null, 2)};\n\n` +
    `PRB.build = ${JSON.stringify({ version: '1.0', built: new Date().toISOString() })};\n`;
  await writeFile(OUT, header + body, 'utf8');
  console.log(`✓ Wrote ${OUT}`);

  // cache-bust prb/index.html
  try {
    const idxPath = join(__dirname, '..', 'index.html');
    let idx = await readFile(idxPath, 'utf8');
    const v = Date.now();
    idx = idx.replace(/(src|href)="((?:js|css)\/[^"?]+?)(?:\?v=\d+)?"/g, `$1="$2?v=${v}"`);
    await writeFile(idxPath, idx, 'utf8');
    console.log('✓ Cache-busted prb/index.html');
  } catch (e) { console.warn('cache-bust skipped:', e.message); }
}

main().catch((e) => { console.error(e); process.exit(1); });
