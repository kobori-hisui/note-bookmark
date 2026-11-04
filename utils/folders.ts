import type { Bookmark } from './bookmarks';

/**
 * Agrupado en "carpetas" por sitio/ruta parcial.
 *
 * IMPORTANTE: nada de esto se guarda. Las notas siguen con su URL completa y la
 * carpeta se CALCULA al mostrar el historial. Si cambias una regla, las carpetas se
 * recalculan solas y no hay migraciones ni datos que se puedan corromper.
 */

/** Cuántas notas hacen falta para que un grupo se vuelva carpeta (3 o más). */
export const MIN_NOTES_FOR_FOLDER = 3;

const OTHER = 'otros';

export interface Folder {
  key: string;
  items: Bookmark[]; // más recientes primero
  latest: number; // timestamp de la nota más reciente
}
export interface Grouped {
  folders: Folder[];
  loose: Bookmark[];
}

// ---- reglas para decidir si un segmento de ruta es "una página concreta" (hoja) ----

// Solo extensiones conocidas: así "next.js" o "vue.js" NO se toman por archivo.
const FILE_EXT =
  /\.(html?|php\d?|aspx?|jsp|jpe?g|png|gif|webp|avif|svg|bmp|ico|pdf|mp[34]|webm|mov|txt|json|xml|md|zip)$/i;
const NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// hex largo CON al menos un dígito (evita confundir palabras como "defaced")
const LONG_HEX = /^(?=[0-9a-f]*\d)[0-9a-f]{12,}$/i;
const HASH_SUFFIX = /[-_](?=[0-9a-f]*\d)[0-9a-f]{8,}$/i; // medium: log-driven-development-e4846484bc14
const LOCALE = /^(en|es|pt|fr|de|it|ja|ko|zh|ru)([-_][a-z]{2,4})?$/i;

function isLeaf(seg: string, isLast: boolean): boolean {
  if (FILE_EXT.test(seg)) return true;
  if (NUMERIC.test(seg)) return true;
  if (UUID.test(seg)) return true;
  if (LONG_HEX.test(seg)) return true;
  if (HASH_SUFFIX.test(seg)) return true;
  // slug largo como único/último segmento = título de un artículo
  if (isLast && seg.split(/[-_]/).filter(Boolean).length >= 4) return true;
  return false;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

interface Parsed {
  host: string;
  segs: string[];
  params: URLSearchParams;
}

function parse(url: string): Parsed | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return {
      host: u.host.toLowerCase().replace(/^www\./, ''),
      segs: u.pathname.split('/').filter(Boolean).map(safeDecode),
      params: u.searchParams,
    };
  } catch {
    return null;
  }
}

/** Único caso donde un query param define la "sección": búsqueda de Google (imágenes = udm=2). */
function qualifier(p: Parsed, first: string): string {
  if (/^google\.[a-z.]+$/.test(p.host) && first === 'search') {
    const udm = p.params.get('udm');
    if (udm && /^\d{1,3}$/.test(udm)) return `?udm=${udm}`;
  }
  return '';
}

/**
 * specific = host + primera sección de la ruta (sin query ni hash)
 * host     = solo el dominio (respaldo cuando las secciones están muy repartidas)
 */
export function folderKeys(url: string): { specific: string; host: string } {
  const p = parse(url);
  if (!p) return { specific: OTHER, host: OTHER };

  const segs = [...p.segs];
  if (segs.length > 1 && LOCALE.test(segs[0])) segs.shift(); // /en/docs/x -> docs

  let specific = p.host;
  const first = segs[0];
  if (first !== undefined && !isLeaf(first, segs.length === 1)) {
    specific += '/' + first + qualifier(p, first);
  }
  return { specific, host: p.host };
}

export function folderLabel(key: string): string {
  return key.replace(/\?udm=2$/, ' · imágenes').replace(/\?udm=(\d+)$/, ' · udm $1');
}

// ---- agrupado ----

const time = (b: Bookmark) => Date.parse(b.date) || 0;
const newestFirst = (a: Bookmark, b: Bookmark) => time(b) - time(a);

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export function groupBookmarks(items: Bookmark[], min = MIN_NOTES_FOR_FOLDER): Grouped {
  const keyed = items.map((b) => ({ b, ...folderKeys(b.url) }));

  // 1) carpeta específica (host + sección) si alcanza el mínimo
  const specificCount = new Map<string, number>();
  for (const k of keyed) specificCount.set(k.specific, (specificCount.get(k.specific) ?? 0) + 1);

  const assigned = new Map<string, Bookmark[]>();
  const leftovers: typeof keyed = [];
  for (const k of keyed) {
    if ((specificCount.get(k.specific) ?? 0) >= min) push(assigned, k.specific, k.b);
    else leftovers.push(k);
  }

  // 2) lo que sobró se junta por dominio; si ese conjunto alcanza el mínimo -> carpeta del dominio
  const hostCount = new Map<string, number>();
  for (const k of leftovers) hostCount.set(k.host, (hostCount.get(k.host) ?? 0) + 1);

  const loose: Bookmark[] = [];
  for (const k of leftovers) {
    if ((hostCount.get(k.host) ?? 0) >= min) push(assigned, k.host, k.b);
    else loose.push(k.b);
  }

  const folders: Folder[] = [...assigned.entries()].map(([key, arr]) => {
    arr.sort(newestFirst);
    return { key, items: arr, latest: time(arr[0]) };
  });
  folders.sort((a, b) => b.latest - a.latest);
  loose.sort(newestFirst);

  return { folders, loose };
}
