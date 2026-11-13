import { useEffect, useRef } from 'react';
import { navigate } from '../../lib/router';
import { useFilters } from '../../store/filters';
import { Icon } from '../ui';

/** Buscador global: escribir aquí lleva a la lista de notas. Atajo: "/". */
export function Topbar({ current }: { current: string }) {
  const { filters, setFilters } = useFilters();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="topbar">
      <div className="search">
        <Icon name="search" size={15} />
        <input
          ref={ref}
          value={filters.query}
          placeholder="Buscar en notas, citas, títulos, sitios y carpetas…"
          onChange={(e) => {
            setFilters({ query: e.target.value });
            if (current !== '/notes') navigate('/notes');
          }}
        />
        {filters.query ? (
          <button type="button" className="search-clear" aria-label="Borrar búsqueda" onClick={() => setFilters({ query: '' })}>
            <Icon name="x" size={14} />
          </button>
        ) : (
          <kbd>/</kbd>
        )}
      </div>
    </header>
  );
}
