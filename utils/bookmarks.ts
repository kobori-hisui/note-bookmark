import { storage } from '#imports';
import { cleanFolderPath, pageId } from './folders';

/** Dónde estaba lo guardado en la página: y = px desde arriba, h = alto total del documento (para escalar si cambia). */
export interface Anchor {
  y: number;
  h: number;
}

export interface Bookmark {
  id: string;
  url: string;
  note: string;
  date: string; // ISO: fecha + hora
  image: string | null; // dataURL (JPEG) de la captura anotada
  quote?: string | null; // texto seleccionado en la página al que se refiere la nota (opcional; notas viejas no lo tienen)
  title?: string | null; // document.title al guardar (opcional; notas viejas no lo tienen)
  favicon?: string | null; // URL del ícono del sitio (opcional)
  images?: string[] | null; // imágenes de la página guardadas con clic derecho: dataURL JPEG (offline) o URL http(s) (solo enlace)
  fragment?: string | null; // directiva del text fragment (#:~:text=...) calculada al seleccionar la cita (opcional)
  imageSrcs?: string[] | null; // URL original de cada imagen de `images` ('' si no es http); sirve para ubicarlas en la página
  anchor?: Anchor | null; // posición en la página al guardar; respaldo para volver a ubicar la nota
  folder?: string | null; // carpeta elegida a mano (opcional; sin ella la carpeta se calcula sola por el sitio)
}

export const bookmarksItem = storage.defineItem<Bookmark[]>('local:bookmarks', {
  fallback: [],
});

export interface NewBookmark {
  note: string;
  url: string;
  image?: string | null;
  quote?: string | null;
  title?: string | null;
  favicon?: string | null;
  images?: string[] | null;
  fragment?: string | null;
  imageSrcs?: string[] | null;
  anchor?: Anchor | null;
  folder?: string | null;
}

const time = (b: Bookmark) => Date.parse(b.date) || 0;
const sortNewest = (list: Bookmark[]) => [...list].sort((a, b) => time(b) - time(a));

export async function addBookmark(input: NewBookmark): Promise<Bookmark> {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    url: input.url,
    note: input.note,
    date: new Date().toISOString(),
    image: input.image ?? null,
    quote: input.quote ?? null,
    title: input.title?.trim() || null,
    favicon: input.favicon ?? null,
    images: input.images?.length ? input.images : null,
    fragment: input.quote ? (input.fragment ?? null) : null,
    imageSrcs: input.images?.length ? (input.imageSrcs ?? null) : null,
    anchor: input.anchor ?? null,
    folder: cleanFolderPath(input.folder),
  };
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue([bookmark, ...list]);
  return bookmark;
}

/** Borra una nota y devuelve la nota borrada (para poder deshacer). */
export async function removeBookmark(id: string): Promise<Bookmark | undefined> {
  const list = await bookmarksItem.getValue();
  const removed = list.find((b) => b.id === id);
  await bookmarksItem.setValue(list.filter((b) => b.id !== id));
  return removed;
}

/** Quita unas notas y agrega otras en una sola escritura (deshacer borrado, fusionar, deshacer fusión). */
export async function replaceBookmarks(removeIds: string[], add: Bookmark[]) {
  const rm = new Set(removeIds);
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(sortNewest([...list.filter((b) => !rm.has(b.id)), ...add]));
}

/** Cambia solo las imágenes de varias notas en una sola escritura (descargar / liberar espacio). */
export async function applyImagePatches(patches: Record<string, string[]>) {
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(list.map((b) => (patches[b.id] ? { ...b, images: patches[b.id] } : b)));
}

export type BookmarkPatch = Partial<Pick<Bookmark, 'note' | 'url' | 'title' | 'folder'>>;

/** Edita texto / título / URL. Cambiar la URL equivale a "mover" la nota a otra carpeta o subcarpeta. */
export async function updateBookmark(id: string, patch: BookmarkPatch) {
  const list = await bookmarksItem.getValue();
  await bookmarksItem.setValue(list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
}

/**
 * Une varias notas de la MISMA página en una sola (texto en orden cronológico).
 * Devuelve un texto de error si no se puede.
 */
export function combineBookmarks(parts: Bookmark[]): Bookmark | string {
  if (parts.length < 2) return 'Elige al menos 2 notas.';
  const ids = new Set(parts.map((b) => pageId(b.url) ?? b.url));
  if (ids.size > 1) return 'Solo se pueden fusionar notas de la misma página.';

  const sorted = [...parts].sort((a, b) => time(a) - time(b)); // la más antigua primero
  const withImage = sorted.filter((b) => b.image);
  if (withImage.length > 1) return 'Solo una de las notas puede tener imagen.';

  // la primera cita queda como cita de la nota; las demás pasan al texto como "> cita"
  const mainQuote = sorted.find((b) => b.quote)?.quote ?? null;
  const chunks = sorted
    .map((b) => {
      const lines: string[] = [];
      if (b.quote && b.quote !== mainQuote) lines.push(`> ${b.quote}`);
      if (b.note) lines.push(b.note);
      return lines.join('\n');
    })
    .filter(Boolean);

  const allImages = sorted.flatMap((b) => b.images ?? []);
  const allSrcs = sorted.flatMap((b) => (b.images ?? []).map((_, i) => b.imageSrcs?.[i] ?? ''));

  const first = sorted[0];
  return {
    id: first.id,
    url: first.url,
    note: chunks.join('\n\n'),
    date: first.date,
    image: withImage[0]?.image ?? null,
    quote: mainQuote,
    title: sorted.find((b) => b.title)?.title ?? null,
    favicon: sorted.find((b) => b.favicon)?.favicon ?? null,
    images: allImages.length ? allImages : null,
    fragment: mainQuote ? (sorted.find((b) => b.quote)?.fragment ?? null) : null,
    imageSrcs: allImages.length ? allSrcs : null,
    anchor: sorted.find((b) => b.anchor)?.anchor ?? null,
    folder: sorted.find((b) => b.folder)?.folder ?? null,
  };
}