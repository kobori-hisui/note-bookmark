import { useCallback, useEffect, useState } from 'react';
import { fmtDateTime, hostOf, titleOf } from '../../lib/format';
import type { Slide } from '../../lib/gallery';
import { useBookmarks } from '../../store/bookmarks';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';

interface Props {
  slides: Slide[];
  start?: number;
  onClose: () => void;
  /** Cierra el visor y abre el detalle de la nota de la imagen actual. */
  onOpenNote?: (id: string) => void;
}

/**
 * Visor a pantalla completa sobre TODAS las imágenes de la lista (de varias notas).
 * ← → imagen anterior/siguiente · ↑ ↓ nota anterior/siguiente · Esc o clic fuera cierran.
 */
export function Lightbox({ slides, start = 0, onClose, onOpenNote }: Props) {
  const { byId, folderOf } = useBookmarks();
  const [i, setI] = useState(start);
  const [showNote, setShowNote] = useState(false);
  const closeNote = useCallback(() => setShowNote(false), []);
  const total = slides.length;
  const cur = slides[i];

  const step = useCallback((d: number) => setI((x) => (x + d + total) % total), [total]);

  /** Salta a la primera imagen de la nota anterior/siguiente. */
  const stepNote = useCallback(
    (d: 1 | -1) =>
      setI((x) => {
        const id = slides[x].noteId;
        let j = x;
        if (d === 1) {
          while (j < total && slides[j].noteId === id) j++;
          return j % total;
        }
        while (j >= 0 && slides[j].noteId === id) j--; // última imagen de la nota anterior
        if (j < 0) j = total - 1;
        const prev = slides[j].noteId;
        while (j > 0 && slides[j - 1].noteId === prev) j--;
        return j;
      }),
    [slides, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // que no cierre también el panel de detalle
        if (showNote) closeNote(); // primero el popup de la nota, luego el visor
        else onClose();
      } else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepNote(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepNote(1);
      } else return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [step, stepNote, onClose, showNote, closeNote]);

  if (!cur) return null;
  const note = byId.get(cur.noteId);

  return (
    <div
      className="lightbox"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <img src={cur.src} alt="" referrerPolicy="no-referrer" onClick={() => (total > 1 ? step(1) : onClose())} />
      {total > 1 && (
        <>
          <IconButton className="lb lb-prev" icon="left" label="Anterior (←)" onClick={() => step(-1)} />
          <IconButton className="lb lb-next" icon="right" label="Siguiente (→)" onClick={() => step(1)} />
        </>
      )}
      <div className="lb-caption">
        <div className="lb-cap-title">
          {note ? titleOf(note) : ''} {note && <span className="muted">· {hostOf(note.url)}</span>}
        </div>
        <div className="lb-cap-sub muted small">
          {cur.of > 1 && `imagen ${cur.n + 1} de ${cur.of} de esta nota · `}
          {i + 1} / {total}
          {total > 1 && ' · ↑ ↓ cambian de nota'}
        </div>
        <Button size="sm" icon="external" onClick={() => setShowNote((v) => !v)}>
          {showNote ? 'Ocultar nota' : 'Ver nota'}
        </Button>
      </div>
      {showNote && note && (
        <div className="lb-note" role="dialog" aria-label="Contenido de la nota">
          <div className="lb-note-head">
            <span className="small muted">{fmtDateTime(note.date)}</span>
            {folderOf.get(note.id) && <Badge tone="accent">{folderOf.get(note.id)}</Badge>}
            <span className="spacer" />
            <IconButton icon="x" label="Cerrar nota" onClick={closeNote} />
          </div>
          <div className="lb-note-body">
            {note.quote && <blockquote className="drawer-quote">{note.quote}</blockquote>}
            {note.note ? <p className="lb-note-text">{note.note}</p> : <p className="muted small">Esta nota no tiene texto.</p>}
          </div>
          {onOpenNote && (
            <div className="lb-note-foot">
              <Button size="sm" variant="primary" onClick={() => onOpenNote(cur.noteId)}>
                Editar nota
              </Button>
            </div>
          )}
        </div>
      )}
      <IconButton className="lb lb-close" icon="x" label="Cerrar (Esc)" onClick={onClose} />
    </div>
  );
}
