import type { Bookmark } from '@/utils/bookmarks';

/** Una imagen del visor, con la nota a la que pertenece. */
export interface Slide {
  src: string;
  noteId: string;
  /** Posición de la imagen dentro de su nota (0 = la primera). */
  n: number;
  /** Cuántas imágenes tiene esa nota. */
  of: number;
}

/** Imágenes de una nota en el orden en que se muestran: la captura anotada primero y luego las guardadas con clic derecho. */
export const imagesOf = (b: Bookmark): string[] => [b.image, ...(b.images ?? [])].filter((s): s is string => !!s);

/** Aplana las imágenes de varias notas en una sola lista navegable (las notas sin imágenes se saltan). */
export function buildSlides(notes: Bookmark[]): Slide[] {
  const out: Slide[] = [];
  for (const b of notes) {
    const imgs = imagesOf(b);
    imgs.forEach((src, n) => out.push({ src, noteId: b.id, n, of: imgs.length }));
  }
  return out;
}

/** Índice del slide (nota, posición) dentro de la lista aplanada; 0 si no existe. */
export const slideIndex = (slides: Slide[], noteId: string, n = 0): number =>
  Math.max(0, slides.findIndex((s) => s.noteId === noteId && s.n === n));
