import { memo, type MouseEvent } from 'react';
import type { Bookmark } from '@/utils/bookmarks';
import { openNoteInPage } from '../../lib/actions';
import { cx } from '../../lib/cx';
import { fmtDateTime, hostOf, imageCount, titleOf } from '../../lib/format';
import { useActions } from '../../lib/useActions';
import { Badge } from '../ui/Badge';
import { IconButton } from '../ui/Button';
import { NoteThumb } from './NoteThumb';

interface Props {
  note: Bookmark;
  index: number;
  selected: boolean;
  folder?: string;
  onToggle: (id: string, index: number, shift: boolean) => void;
  onOpen: (id: string) => void;
}

const stop = (e: MouseEvent) => e.stopPropagation();

/** Fila de la tabla de notas. Columnas definidas por --cols en NotesList (mantener en sync con el encabezado). */
export const NoteRow = memo(function NoteRow({ note, index, selected, folder, onToggle, onOpen }: Props) {
  const actions = useActions();
  const imgs = imageCount(note);

  return (
    <div className={cx('trow', selected && 'is-selected')} onClick={() => onOpen(note.id)}>
      <div className="tcell">
        <input
          type="checkbox"
          className="check"
          checked={selected}
          aria-label="Seleccionar nota"
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(note.id, index, e.shiftKey);
          }}
        />
      </div>
      <div className="tcell">
        <NoteThumb note={note} />
      </div>
      <div className="tcell note-main">
        <div className="note-title">
          {titleOf(note)} <span className="muted">· {hostOf(note.url)}</span>
        </div>
        {note.quote && <div className="note-quote">{note.quote}</div>}
        {note.note && <div className="note-text">{note.note}</div>}
        {imgs > 0 && (
          <div className="note-meta">
            <Badge>🖼 {imgs}</Badge>
          </div>
        )}
      </div>
      <div className="tcell">{folder ? <Badge tone="accent">{folder}</Badge> : <span className="muted">—</span>}</div>
      <div className="tcell muted small">{fmtDateTime(note.date)}</div>
      <div className="tcell tcell-actions" onClick={stop}>
        <IconButton icon="external" label="Abrir y ubicar en la página" onClick={() => openNoteInPage(note.id)} />
        <IconButton icon="trash" label="Borrar" danger onClick={() => actions.remove([note.id])} />
      </div>
    </div>
  );
});
