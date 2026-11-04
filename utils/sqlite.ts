import type { SqlJsStatic } from 'sql.js';
import type { Bookmark } from './bookmarks';

/**
 * Exporta las notas a un archivo SQLite (.db) que abre cualquier gestor
 * (DB Browser for SQLite, DBeaver, TablePlus, DataGrip, el CLI `sqlite3`, Python, etc.).
 *
 * Columnas: las del modelo (id, url, note, date, image) + extras útiles para consultar.
 *   image      -> BLOB con los bytes reales del JPEG (los gestores la previsualizan)
 *   image_mime -> p. ej. image/jpeg
 *   quote      -> texto citado de la página (o NULL)
 *   host       -> dominio de la URL (sin www)
 *   folder     -> carpeta que muestra el popup (o NULL si va "sin carpeta")
 */
export const SCHEMA = `
CREATE TABLE bookmarks (
  id         TEXT PRIMARY KEY NOT NULL,
  url        TEXT NOT NULL,
  note       TEXT NOT NULL,
  date       TEXT NOT NULL,
  image      BLOB,
  image_mime TEXT,
  quote      TEXT,
  host       TEXT,
  folder     TEXT
);
CREATE INDEX idx_bookmarks_date ON bookmarks(date);
CREATE INDEX idx_bookmarks_host ON bookmarks(host);
PRAGMA user_version = 1;
`;

/** dataURL (data:image/jpeg;base64,...) -> bytes + mime. null si no es una imagen base64 válida. */
export function dataUrlToImage(dataUrl: string | null | undefined): { bytes: Uint8Array; mime: string } | null {
  if (!dataUrl) return null;
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const m = /^data:(image\/[a-z0-9.+-]+);base64$/i.exec(dataUrl.slice(0, comma));
    if (!m) return null;
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime: m[1].toLowerCase() };
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null; // chrome://, file://, etc. no tienen dominio
    return u.host.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Construye la base en memoria y devuelve los bytes del archivo .db. */
export function buildDb(
  SQL: SqlJsStatic,
  items: Bookmark[],
  folderById: ReadonlyMap<string, string> = new Map(),
): Uint8Array {
  const db = new SQL.Database();
  try {
    db.run(SCHEMA);
    db.run('BEGIN');
    const stmt = db.prepare(
      'INSERT INTO bookmarks (id, url, note, date, image, image_mime, quote, host, folder) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    try {
      for (const b of items) {
        const img = dataUrlToImage(b.image);
        // siempre con parámetros enlazados: el contenido de las notas nunca se interpreta como SQL
        stmt.run([
          b.id,
          b.url,
          b.note,
          b.date,
          img ? img.bytes : null,
          img ? img.mime : null,
          b.quote ?? null,
          hostOf(b.url),
          folderById.get(b.id) ?? null,
        ]);
      }
    } finally {
      stmt.free();
    }
    db.run('COMMIT');
    return db.export();
  } finally {
    db.close();
  }
}

// ---- carga de sql.js (solo se descarga/instancia al exportar) ----

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const [mod, wasm] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
      const initSqlJs = ((mod as { default?: unknown }).default ?? mod) as (cfg: {
        wasmBinary: ArrayBuffer;
      }) => Promise<SqlJsStatic>;
      const res = await fetch(wasm.default);
      if (!res.ok) throw new Error(`No se pudo leer sql-wasm.wasm (${res.status})`);
      return initSqlJs({ wasmBinary: await res.arrayBuffer() });
    })().catch((e) => {
      sqlPromise = null; // permite reintentar
      throw e;
    });
  }
  return sqlPromise;
}
