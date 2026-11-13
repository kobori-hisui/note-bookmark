import { useMemo, useRef } from 'react';
import { combineBookmarks, replaceBookmarks } from '@/utils/bookmarks';
import { useBookmarks } from '../store/bookmarks';
import { useToast } from '../store/toast';
import { removeMany, restoreMany, setFolder } from './actions';
import { plural } from './format';

/**
 * Acciones de la UI con aviso y "Deshacer". Es la única capa que mezcla datos + avisos:
 * para una acción nueva (p. ej. "archivar"), agrégala aquí y úsala desde cualquier componente.
 * El objeto devuelto es estable (no re-renderiza a quien lo usa).
 */
export function useActions() {
  const toast = useToast();
  const { items } = useBookmarks();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  return useMemo(
    () => ({
      async remove(ids: string[]) {
        const removed = await removeMany(ids);
        if (!removed.length) return;
        toast({
          text: `${plural(removed.length, 'nota borrada', 'notas borradas')}.`,
          kind: 'ok',
          action: { label: 'Deshacer', run: () => restoreMany(removed) },
        });
      },

      async move(ids: string[], folder: string | null) {
        const undo = await setFolder(ids, folder);
        toast({
          text: folder ? `${plural(ids.length, 'nota movida', 'notas movidas')} a «${folder}».` : 'Carpeta manual quitada.',
          kind: 'ok',
          action: { label: 'Deshacer', run: undo },
        });
      },

      async merge(ids: string[]) {
        const set = new Set(ids);
        const parts = itemsRef.current.filter((b) => set.has(b.id));
        const merged = combineBookmarks(parts);
        if (typeof merged === 'string') {
          toast({ text: merged, kind: 'err' });
          return false;
        }
        await replaceBookmarks(ids, [merged]);
        toast({
          text: `Fusionadas ${parts.length} notas en una.`,
          kind: 'ok',
          action: { label: 'Deshacer', run: () => replaceBookmarks([merged.id], parts) },
        });
        return true;
      },
    }),
    [toast],
  );
}
