import { useState } from 'react';
import { exportJsonFile } from '../../lib/backupIO';
import { plural } from '../../lib/format';
import { useActions } from '../../lib/useActions';
import { useBookmarks } from '../../store/bookmarks';
import { useConfirm } from '../../store/confirm';
import { useSelection } from '../../store/selection';
import { Button } from '../ui';
import { FolderPicker } from './FolderPicker';

/** Barra de acciones en lote: aparece pegada arriba cuando hay notas seleccionadas. */
export function BulkBar() {
  const { selected, clear } = useSelection();
  const { items } = useBookmarks();
  const actions = useActions();
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);

  if (!selected.size) return null;
  const ids = [...selected];

  return (
    <div className="bulk">
      <strong>{plural(ids.length, 'seleccionada', 'seleccionadas')}</strong>
      <span className="spacer" />
      <Button size="sm" icon="folder" onClick={() => setPicking(true)}>
        Mover
      </Button>
      <Button
        size="sm"
        icon="merge"
        disabled={ids.length < 2}
        title="Une las notas elegidas en una sola (deben ser de la misma página)"
        onClick={async () => {
          if (await actions.merge(ids)) clear();
        }}
      >
        Fusionar
      </Button>
      <Button
        size="sm"
        icon="data"
        onClick={() => exportJsonFile(items.filter((b) => selected.has(b.id)), 'note-bookmarks-seleccion')}
      >
        Exportar
      </Button>
      <Button
        size="sm"
        variant="danger"
        icon="trash"
        onClick={async () => {
          const ok = await confirm({
            title: `¿Borrar ${plural(ids.length, 'nota', 'notas')}?`,
            body: 'Podrás deshacerlo unos segundos después.',
            confirmLabel: 'Borrar',
            danger: true,
          });
          if (!ok) return;
          await actions.remove(ids);
          clear();
        }}
      >
        Borrar
      </Button>
      <Button size="sm" variant="ghost" icon="x" onClick={clear}>
        Limpiar
      </Button>

      {picking && (
        <FolderPicker
          onClose={() => setPicking(false)}
          onPick={async (folder) => {
            await actions.move(ids, folder);
            clear();
          }}
        />
      )}
    </div>
  );
}
