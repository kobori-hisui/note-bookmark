import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBookmarks } from './bookmarks';

interface Ctx {
  selected: Set<string>;
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  set: (ids: Iterable<string>, on: boolean) => void;
  clear: () => void;
}

const SelectionCtx = createContext<Ctx | null>(null);

/** Selección múltiple de notas (para acciones en lote). Se limpia sola de notas que ya no existen. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const { byId } = useBookmarks();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => byId.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [byId]);

  const toggle = useCallback(
    (id: string) =>
      setSelected((p) => {
        const n = new Set(p);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const set = useCallback(
    (ids: Iterable<string>, on: boolean) =>
      setSelected((p) => {
        const n = new Set(p);
        for (const id of ids) {
          if (on) n.add(id);
          else n.delete(id);
        }
        return n;
      }),
    [],
  );
  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo<Ctx>(
    () => ({ selected, has: (id) => selected.has(id), toggle, set, clear }),
    [selected, toggle, set, clear],
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

export function useSelection(): Ctx {
  const v = useContext(SelectionCtx);
  if (!v) throw new Error('useSelection fuera de SelectionProvider');
  return v;
}
