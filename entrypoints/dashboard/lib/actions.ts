import { bookmarksItem, replaceBookmarks, type Bookmark } from '@/utils/bookmarks';
import { cleanFolderPath, folderDepth, MAX_FOLDER_DEPTH, rebasePath } from '@/utils/folders';

/**
 * Operaciones de datos (sin React). Cada una hace UNA sola escritura al storage, así que son
 * rápidas en lote y fáciles de deshacer. La UI las usa a través de useActions().
 */

export const cleanFolder = cleanFolderPath;

/** Borra notas y devuelve las borradas (para poder deshacer). */
export async function removeMany(ids: Iterable<string>): Promise<Bookmark[]> {
  const rm = new Set(ids);
  const list = await bookmarksItem.getValue();
  const removed = list.filter((b) => rm.has(b.id));
  if (removed.length) await bookmarksItem.setValue(list.filter((b) => !rm.has(b.id)));
  return removed;
}

export const restoreMany = (removed: Bookmark[]) => replaceBookmarks([], removed);

/** Asigna (o quita con null) la carpeta manual de varias notas. Devuelve la función que lo deshace. */
export async function setFolder(ids: Iterable<string>, folder: string | null): Promise<() => Promise<void>> {
  const target = new Set(ids);
  const value = cleanFolder(folder);
  const prev = new Map<string, string | null>();
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(
    list.map((b) => {
      if (!target.has(b.id)) return b;
      prev.set(b.id, b.folder ?? null);
      return { ...b, folder: value };
    }),
  );
  return async () => {
    const cur = await bookmarksItem.getValue();
    await bookmarksItem.setValue(cur.map((b) => (prev.has(b.id) ? { ...b, folder: prev.get(b.id) ?? null } : b)));
  };
}

/**
 * Renombra o mueve una carpeta manual CON todo su contenido: cambia el prefijo `from` por `to` en la ruta de cada
 * nota que esté en ella o en sus hijas ("a/x" -> "b/x"). Si `to` ya existe, se fusionan. Una sola escritura.
 * Devuelve el deshacer, o un texto de error (p. ej. si la ruta resultante pasa del máximo de niveles).
 */
export async function renameFolderTree(from: string, to: string): Promise<{ undo: () => Promise<void>; moved: number } | string> {
  const target = cleanFolderPath(to);
  if (!target) return 'El nombre no puede estar vacío.';
  const list = await bookmarksItem.getValue();
  const prev = new Map<string, string | null>();
  const next = list.map((b) => {
    const path = cleanFolderPath(b.folder);
    const moved = path ? rebasePath(path, from, target) : null;
    if (moved === null) return b;
    if (folderDepth(moved) >= MAX_FOLDER_DEPTH) return null; // no cabe: se aborta todo
    prev.set(b.id, b.folder ?? null);
    return { ...b, folder: moved };
  });
  if (next.includes(null)) return `Solo se permiten ${MAX_FOLDER_DEPTH} niveles de carpetas.`;
  await bookmarksItem.setValue(next as Bookmark[]);
  return {
    moved: prev.size,
    undo: async () => {
      const cur = await bookmarksItem.getValue();
      await bookmarksItem.setValue(cur.map((b) => (prev.has(b.id) ? { ...b, folder: prev.get(b.id) ?? null } : b)));
    },
  };
}

/** Abre la nota en su página y la marca (lo resuelve el background + content script). */
export const openNoteInPage = (id: string) => browser.runtime.sendMessage({ type: 'open-note', id });
