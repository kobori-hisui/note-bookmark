import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_FILTERS, type Filters } from '../lib/search';

interface Ctx {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  reset: () => void;
}

const FiltersCtx = createContext<Ctx | null>(null);

/** Filtros de la lista de notas. Viven aquí (no en la página) para que el sidebar y la barra superior los usen. */
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setAll] = useState<Filters>(DEFAULT_FILTERS);
  const setFilters = useCallback((patch: Partial<Filters>) => setAll((f) => ({ ...f, ...patch })), []);
  const reset = useCallback(() => setAll(DEFAULT_FILTERS), []);
  const value = useMemo(() => ({ filters, setFilters, reset }), [filters, setFilters, reset]);
  return <FiltersCtx.Provider value={value}>{children}</FiltersCtx.Provider>;
}

export function useFilters(): Ctx {
  const v = useContext(FiltersCtx);
  if (!v) throw new Error('useFilters fuera de FiltersProvider');
  return v;
}
