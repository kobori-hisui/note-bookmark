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

/** Prefijo de la clave de las carpetas elegidas a mano (las automáticas son host o host/sección). */
export const CUSTOM_PREFIX = 'custom:';

// ---- rutas de carpetas manuales: "notes-init/case-use" ----
// La ruta completa vive en el campo `folder` de la nota (sin migración: una carpeta vieja es una ruta de 1 nivel).
// El árbol se CALCULA al mostrar, igual que el resto de las carpetas.

/** Niveles máximos de una ruta (a/b/c/d/e). */
export const MAX_FOLDER_DEPTH = 5;
/** Largo máximo de cada nivel. */
export const MAX_FOLDER_SEGMENT = 60;
/** Largo máximo de la ruta completa (para los `maxLength` de los campos de texto). */
export const MAX_FOLDER_PATH = MAX_FOLDER_DEPTH * (MAX_FOLDER_SEGMENT + 1);

/** Normaliza una ruta: recorta cada nivel, quita niveles vacíos ("a//b/" -> "a/b") y limita la profundidad. null si queda vacía. */
export function cleanFolderPath(s: string | null | undefined): string | null {
  if (!s) return null;
  const segs = s
    .split('/')
    .map((x) => x.trim().slice(0, MAX_FOLDER_SEGMENT).trim())
    .filter(Boolean)
    .slice(0, MAX_FOLDER_DEPTH);
  return segs.length ? segs.join('/') : null;
}

export const folderDepth = (path: string) => path.split('/').length - 1;
/** Último nivel de la ruta: "a/b/c" -> "c". */
export const folderName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
/** Ruta del padre: "a/b/c" -> "a/b"; null si es de primer nivel. */
export const parentPath = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null);
/** Clave de una carpeta manual ("Tesis/Cap1" y "tesis/cap1" son la misma). */
export const folderKey = (path: string) => CUSTOM_PREFIX + path.toLowerCase();

/**
 * Si `path` es `from` o está dentro de `from`, devuelve la ruta con ese prefijo cambiado por `to`
 * (sin distinguir mayúsculas). Si no, null. Sirve para renombrar / mover una carpeta con todo su contenido.
 */
export function rebasePath(path: string, from: string, to: string): string | null {
  const p = path.toLowerCase();
  const f = from.toLowerCase();
  if (p === f) return to;
  if (p.startsWith(f + '/')) return to + path.slice(from.length);
  return null;
}

/** Cuántas notas de UNA misma página hacen falta para que sea subcarpeta dentro de su carpeta. */
export const MIN_NOTES_FOR_SUBFOLDER = 2;

export interface SubFolder {
  key: string; // identidad de la página (ver pageId)
  label: string; // p. ej. "/evil-angel-drops-vince-karters-miami-vixens" (respaldo si no hay título)
  title: string | null; // título de la página, si alguna nota lo guardó
  items: Bookmark[]; // más recientes primero
  latest: number;
}
export interface Folder {
  key: string;
  label?: string; // ruta de una carpeta manual, p. ej. "notes-init/case-use" (las automáticas se muestran con folderLabel)
  custom?: boolean; // true = carpeta creada/elegida por el usuario
  items: Bookmark[]; // TODAS las notas de la carpeta, incluidas las de sus carpetas hijas y páginas, más recientes primero
  own: Bookmark[]; // solo las notas guardadas directamente en esta carpeta (sin las de las hijas)
  parent: string | null; // clave de la carpeta padre (solo las manuales anidadas)
  depth: number; // 0 = primer nivel
  children: Folder[]; // carpetas hijas, más recientes primero
  subfolders: SubFolder[]; // páginas con varias notas (calculadas sobre `own`)
  rest: Bookmark[]; // notas propias que no están en ninguna página-subcarpeta
  latest: number; // timestamp de la nota más reciente (incluye hijas)
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
  if (key.startsWith(CUSTOM_PREFIX)) return key.slice(CUSTOM_PREFIX.length);
  return key.replace(/\?udm=2$/, ' · imágenes').replace(/\?udm=(\d+)$/, ' · udm $1');
}

// ---- agrupado ----

const time = (b: Bookmark) => Date.parse(b.date) || 0;
const newestFirst = (a: Bookmark, b: Bookmark) => time(b) - time(a);

function push<K, V>(m: Map<K, V[]>, k: K, ...v: V[]) {
  let arr = m.get(k);
  if (!arr) m.set(k, (arr = []));
  for (const x of v) arr.push(x); // sin spread: con decenas de miles de notas reventaría los argumentos
}

// ---- subcarpetas: una página concreta (artículo) con varias notas ----

// parámetros de seguimiento: no cambian la página, así que no cuentan como "otra página"
const TRACKING = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_ga|_gl)$/i;

/** Query normalizada: sin seguimiento y ordenada (así ?v=1&t=2 y ?t=2&v=1 son lo mismo). */
function cleanQuery(p: Parsed): string {
  const kept: [string, string][] = [];
  p.params.forEach((v, k) => {
    if (!TRACKING.test(k)) kept.push([k, v]);
  });
  kept.sort(([a], [b]) => a.localeCompare(b));
  return kept.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/**
 * Identidad de una página: host + ruta + query sin seguimiento. Ignora hash, "www.",
 * "/" final y http/https. null si no es una URL web. Sirve para saber "¿ya anoté esta página?".
 */
export function pageId(url: string): string | null {
  const p = parse(url);
  if (!p) return null;
  const q = cleanQuery(p);
  return `${p.host}/${p.segs.join('/')}${q ? '?' + q : ''}`;
}

/** Notas guardadas para la página `url`, más recientes primero. */
export function notesForPage(items: Bookmark[], url: string): Bookmark[] {
  const id = pageId(url);
  if (!id) return [];
  return items.filter((b) => pageId(b.url) === id).sort(newestFirst);
}

/** Clave y etiqueta de subcarpeta. null si es la portada del sitio (sin ruta). */
export function pageKey(url: string): { key: string; label: string } | null {
  const p = parse(url);
  if (!p || !p.segs.length) return null;
  const q = cleanQuery(p);
  // etiqueta: el último segmento que no sea solo un número (el slug del artículo)
  const slug = [...p.segs].reverse().find((s) => !NUMERIC.test(s)) ?? p.segs[p.segs.length - 1];
  return { key: pageId(url)!, label: '/' + slug + (q ? '?' + q : '') };
}

function splitSubfolders(sorted: Bookmark[], min = MIN_NOTES_FOR_SUBFOLDER) {
  const byPage = new Map<string, { label: string; items: Bookmark[] }>();
  for (const b of sorted) {
    const pk = pageKey(b.url);
    if (!pk) continue;
    const g = byPage.get(pk.key);
    if (g) g.items.push(b);
    else byPage.set(pk.key, { label: pk.label, items: [b] });
  }

  const subfolders: SubFolder[] = [];
  const inSub = new Set<string>();
  for (const [key, g] of byPage) {
    if (g.items.length < min) continue;
    g.items.forEach((b) => inSub.add(b.id));
    const title = g.items.find((b) => b.title)?.title ?? null; // la más reciente que tenga título
    subfolders.push({ key, label: g.label, title, items: g.items, latest: time(g.items[0]) });
  }
  subfolders.sort((a, b) => b.latest - a.latest);
  return { subfolders, rest: sorted.filter((b) => !inSub.has(b.id)) };
}

export function groupBookmarks(all: Bookmark[], min = MIN_NOTES_FOR_FOLDER): Grouped {
  // carpetas elegidas a mano: mandan sobre el agrupado automático (aunque tengan una sola nota)
  const manual = new Map<string, { label: string; arr: Bookmark[] }>();
  const items: Bookmark[] = [];
  for (const b of [...all].sort(newestFirst)) {
    const path = cleanFolderPath(b.folder);
    if (!path) {
      items.push(b);
      continue;
    }
    const key = folderKey(path); // "Tesis" y "tesis" son la misma carpeta
    const g = manual.get(key);
    if (g) g.arr.push(b);
    else manual.set(key, { label: path, arr: [b] }); // el nombre lo da la nota más reciente
  }

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
    const { subfolders, rest } = splitSubfolders(arr);
    return { key, items: arr, own: arr, parent: null, depth: 0, children: [], subfolders, rest, latest: time(arr[0]) };
  });

  // carpetas manuales como árbol: las rutas "a/b/c" crean también "a" y "a/b" aunque no tengan notas propias
  const nodes = new Map<string, { label: string; own: Bookmark[]; parent: string | null; depth: number }>();
  for (const [, g] of manual) {
    const segs = g.label.split('/');
    for (let i = 1; i <= segs.length; i++) {
      const path = segs.slice(0, i).join('/');
      const key = folderKey(path);
      let n = nodes.get(key);
      if (!n) {
        n = { label: path, own: [], parent: i > 1 ? folderKey(segs.slice(0, i - 1).join('/')) : null, depth: i - 1 };
        nodes.set(key, n);
      }
      if (i === segs.length) {
        n.own = g.arr;
        n.label = g.label; // con notas propias manda el nombre de la nota más reciente de ESA carpeta
      }
    }
  }
  // cada carpeta acumula sus notas propias y las de todos sus descendientes
  const total = new Map<string, Bookmark[]>();
  for (const [key, n] of nodes) {
    for (let k: string | null = key; k; k = nodes.get(k)?.parent ?? null) push(total, k, ...n.own);
  }
  const built = new Map<string, Folder>();
  for (const [key, n] of nodes) {
    const everything = (total.get(key) ?? []).sort(newestFirst);
    const { subfolders, rest } = splitSubfolders(n.own);
    const f: Folder = {
      key,
      label: n.label,
      custom: true,
      items: everything,
      own: n.own,
      parent: n.parent,
      depth: n.depth,
      children: [],
      subfolders,
      rest,
      latest: time(everything[0]),
    };
    built.set(key, f);
    folders.push(f);
  }
  for (const f of built.values()) if (f.parent) built.get(f.parent)?.children.push(f);
  for (const f of built.values()) f.children.sort((a, b) => b.latest - a.latest);

  folders.sort((a, b) => b.latest - a.latest);
  loose.sort(newestFirst);

  return { folders, loose };
}
