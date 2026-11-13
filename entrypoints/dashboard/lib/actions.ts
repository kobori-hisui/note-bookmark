import { bookmarksItem, replaceBookmarks, type Bookmark } from '@/utils/bookmarks';

/**
 * Operaciones de datos (sin React). Cada una hace UNA sola escritura al storage, así que son
 * rápidas en lote y fáciles de deshacer. La UI las usa a través de useActions().
 */

export const cleanFolder = (s: string | null | undefined) => s?.trim().slice(0, 60) || null;

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

/** Abre la nota en su página y la marca (lo resuelve el background + content script). */
export const openNoteInPage = (id: string) => browser.runtime.sendMessage({ type: 'open-note', id });
