import { memo } from 'react';
import type { Bookmark } from '@/utils/bookmarks';
import { cx } from '../../lib/cx';
import { fmtDateTime, hostOf, titleOf } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { NoteThumb } from './NoteThumb';

interface Props {
  note: Bookmark;
  index: number;
  selected: boolean;
  folder?: string;
  onToggle: (id: string, index: number, shift: boolean) => void;
  onOpen: (id: string) => void;
  onView: (id: string, n?: number) => void;
}

/** Tarjeta de la vista en cuadrícula (ideal para notas con capturas e imágenes). */
export const NoteCard = memo(function NoteCard({ note, index, selected, folder, onToggle, onOpen, onView }: Props) {
  return (
    <div className={cx('card', selected && 'is-selected')} onClick={() => onOpen(note.id)}>
      <div className="card-thumb">
        <NoteThumb note={note} className="card-img" onView={onView} />
        <input
          type="checkbox"
          className="check card-check"
          checked={selected}
          aria-label="Seleccionar nota"
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(note.id, index, e.shiftKey);
          }}
        />
      </div>
      <div className="card-body">
        <div className="note-title">{titleOf(note)}</div>
        {note.quote && <div className="note-quote">{note.quote}</div>}
        {note.note && <div className="note-text">{note.note}</div>}
        <div className="card-foot">
          {folder ? <Badge tone="accent">{folder}</Badge> : <span className="muted small">{hostOf(note.url)}</span>}
          <span className="muted small">{fmtDateTime(note.date)}</span>
        </div>
      </div>
    </div>
  );
});
