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
];

async function coverFor(title, author) {
  try {
    const u = new URL('https://openlibrary.org/search.json');
    u.searchParams.set('title', title);
    u.searchParams.set('author', author);
    u.searchParams.set('fields', 'cover_i,cover_edition_key,title');
    u.searchParams.set('limit', '1');
    const r = await fetch(u, { headers: { 'User-Agent': 'PRB/1.0 (project read books)' } });
    if (!r.ok) return null;
    const d = await r.json();
    const doc = (d.docs || [])[0];
    if (doc && doc.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    if (doc && doc.cover_edition_key) return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-L.jpg`;
    return null;
  } catch { return null; }
}

async function main() {
  console.log('→ Buscando portadas en Open Library…');
  const books = [];
  let i = 0;
  for (const b of SEED) {
    process.stdout.write(`  [${++i}/${SEED.length}] ${b.title}            \r`);
    const cover = await coverFor(b.title, b.author);
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
