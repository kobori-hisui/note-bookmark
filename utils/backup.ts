import type { Bookmark } from './bookmarks';

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'file:', 'ftp:']);

/** true si la URL es utilizable (protocolo seguro). Evita javascript:, data:, etc. */
export function isSafeUrl(url: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

const webUrl = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  try {
    const p = new URL(s).protocol;
    return p === 'http:' || p === 'https:' ? s : null;
  } catch {
    return null;
  }
};

/** Valida/normaliza un elemento importado. Devuelve null si no es utilizable. */
export function normalizeBookmark(x: unknown): Bookmark | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (typeof o.note !== 'string' || typeof o.date !== 'string') return null;
  if (typeof o.url !== 'string' || !isSafeUrl(o.url)) return null;
  return {
    id: o.id,
    url: o.url,
    note: o.note,
    date: o.date,
    image: typeof o.image === 'string' && o.image.startsWith('data:image/') ? o.image : null,
    quote: typeof o.quote === 'string' && o.quote ? o.quote : null,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null,
    favicon: webUrl(o.favicon),
  };
}

export type ParseResult =
  | { ok: true; items: Bookmark[]; skipped: number }
  | { ok: false; error: string };

/** Acepta el formato { bookmarks: [...] } o directamente un arreglo. */
export function parseBackup(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  const arr = Array.isArray(data) ? data : (data as { bookmarks?: unknown } | null)?.bookmarks;
  if (!Array.isArray(arr)) return { ok: false, error: 'No encontré una lista de notas en el archivo.' };

  const items: Bookmark[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const b = normalizeBookmark(x);
    if (b && !seen.has(b.id)) {
      seen.add(b.id);
      items.push(b);
    }
  }
  return { ok: true, items, skipped: arr.length - items.length };
}

/** Suma lo importado a lo existente SIN pisar nada (mismo id = se ignora). Más recientes primero. */
export function mergeBookmarks(current: Bookmark[], incoming: Bookmark[]) {
  const ids = new Set(current.map((b) => b.id));
  const added = incoming.filter((b) => !ids.has(b.id));
  const t = (b: Bookmark) => Date.parse(b.date) || 0;
  const merged = [...current, ...added].sort((a, b) => t(b) - t(a));
  return { merged, added: added.length, duplicates: incoming.length - added.length };
}

export function exportJson(items: Bookmark[]): string {
  return JSON.stringify({ app: 'note-bookmarks', version: 1, exportedAt: new Date().toISOString(), bookmarks: items }, null, 2);
}