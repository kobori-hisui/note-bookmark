import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Bookmark } from '@/utils/bookmarks';
import { PAGE_SIZE } from '../../lib/constants';
import { useBookmarks } from '../../store/bookmarks';
import { useSelection } from '../../store/selection';
import { Button } from '../ui/Button';
import { NoteCard } from './NoteCard';
import { NoteRow } from './NoteRow';

export type NotesView = 'table' | 'grid';

interface Props {
  items: Bookmark[];
  view: NotesView;
  onOpen: (id: string) => void;
  /** Abre el visor de imágenes directamente (sin pasar por el panel de detalle). */
  onView: (id: string, n?: number) => void;
  /** Cambia cuando cambian los filtros: vuelve a la primera tanda. */
  resetKey: string;
}

// mantener en sync con las celdas de NoteRow
const COLS = '36px 64px minmax(0,1fr) 170px 150px 84px';

export function NotesList({ items, view, onOpen, onView, resetKey }: Props) {
  const { folderOf } = useBookmarks();
  const sel = useSelection();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const last = useRef<number | null>(null);

  useEffect(() => setLimit(PAGE_SIZE), [resetKey]);

  const shown = items.slice(0, limit);
  const allSelected = items.length > 0 && items.every((n) => sel.has(n.id));

  // clic normal alterna; Shift+clic selecciona el rango desde el último clic
  const onToggle = useCallback(
    (id: string, index: number, shift: boolean) => {
      if (shift && last.current !== null) {
        const [a, b] = [Math.min(last.current, index), Math.max(last.current, index)];
        sel.set(shown.slice(a, b + 1).map((n) => n.id), !sel.has(id));
      } else sel.toggle(id);
      last.current = index;
    },
    [sel, shown],
  );

  const more = items.length > shown.length && (
    <div className="load-more">
      <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
        Mostrar más ({items.length - shown.length} restantes)
      </Button>
    </div>
  );

  if (view === 'grid') {
    return (
      <>
        <div className="grid">
          {shown.map((n, i) => (
            <NoteCard key={n.id} note={n} index={i} selected={sel.has(n.id)} folder={folderOf.get(n.id)} onToggle={onToggle} onOpen={onOpen} onView={onView} />
          ))}
        </div>
        {more}
      </>
    );
  }

  return (
    <>
      <div className="table" style={{ '--cols': COLS } as CSSProperties}>
        <div className="thead">
          <div className="tcell">
            <input
              type="checkbox"
              className="check"
              checked={allSelected}
              aria-label="Seleccionar todas las notas del filtro"
              onChange={() => sel.set(items.map((n) => n.id), !allSelected)}
            />
          </div>
          <div className="tcell" />
          <div className="tcell">Nota</div>
          <div className="tcell">Carpeta</div>
          <div className="tcell">Fecha</div>
          <div className="tcell" />
        </div>
        {shown.map((n, i) => (
          <NoteRow key={n.id} note={n} index={i} selected={sel.has(n.id)} folder={folderOf.get(n.id)} onToggle={onToggle} onOpen={onOpen} onView={onView} />
        ))}
      </div>
      {more}
    </>
  );
}
