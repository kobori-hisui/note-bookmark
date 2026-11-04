import { storage } from '#imports';

export interface Bookmark {
  id: string;
  url: string;
  note: string;
  date: string; // ISO: fecha + hora
  image: string | null; // dataURL (JPEG) de la captura anotada
  quote?: string | null; // texto seleccionado en la página al que se refiere la nota (opcional; notas viejas no lo tienen)
}

export const bookmarksItem = storage.defineItem<Bookmark[]>('local:bookmarks', {
  fallback: [],
});

export interface NewBookmark {
  note: string;
  url: string;
  image?: string | null;
  quote?: string | null;
}

export async function addBookmark(input: NewBookmark): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url: input.url,
    note: input.note,
    date: new Date().toISOString(),
    image: input.image ?? null,
    quote: input.quote ?? null,
  };
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue([bookmark, ...list]);
  return bookmark;
}

export async function removeBookmark(id: string) {
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(list.filter((b) => b.id !== id));
}
