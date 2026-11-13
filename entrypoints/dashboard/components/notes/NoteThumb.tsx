import type { Bookmark } from '@/utils/bookmarks';
import { hostOf, thumbOf } from '../../lib/format';
import { SafeImg } from './SafeImg';

/** Miniatura de la nota: su primera imagen, o la inicial del sitio si no tiene. */
export function NoteThumb({ note, className = 'thumb' }: { note: Bookmark; className?: string }) {
  const src = thumbOf(note);
  if (src) return <SafeImg src={src} className={className} />;
  return <div className={`${className} thumb-fallback`}>{hostOf(note.url).charAt(0).toUpperCase()}</div>;
}
