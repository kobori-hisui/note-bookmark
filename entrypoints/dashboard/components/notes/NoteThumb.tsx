import type { Bookmark } from '@/utils/bookmarks';
import { hostOf, thumbOf } from '../../lib/format';
import { SafeImg } from './SafeImg';

/** Miniatura de la nota: su primera imagen, o la inicial del sitio si no tiene. Con `onView`, un clic abre el visor. */
export function NoteThumb({
  note,
  className = 'thumb',
  onView,
}: {
  note: Bookmark;
  className?: string;
  onView?: (id: string, n?: number) => void;
}) {
  const src = thumbOf(note);
  if (src)
    return (
      <SafeImg
        src={src}
        className={onView ? `${className} thumb-clickable` : className}
        onClick={
          onView
            ? (e) => {
                e.stopPropagation(); // no abrir el panel de detalle
                onView(note.id, 0);
              }
            : undefined
        }
      />
    );
  return <div className={`${className} thumb-fallback`}>{hostOf(note.url).charAt(0).toUpperCase()}</div>;
}
