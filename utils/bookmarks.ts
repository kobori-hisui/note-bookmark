import { storage } from '#imports';

export interface Bookmark {
  id: string;
  url: string;
  note: string;
  date: string; // ISO: fecha + hora
  image: string | null; // luego: dataURL de la captura
}

export const bookmarksItem = storage.defineItem<Bookmark[]>('local:bookmarks', {
  fallback: [],
});

export async function addBookmark(note: string, url: string): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url,
    note,
    date: new Date().toISOString(),
    image: null,
  };
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue([bookmark, ...list]);
  return bookmark;
}

export async function removeBookmark(id: string) {
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(list.filter((b) => b.id !== id));
}
