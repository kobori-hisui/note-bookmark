import { LOOSE } from '../../lib/constants';
import { activeFilterCount, type RangeKey, type SortKey } from '../../lib/search';
import { useBookmarks } from '../../store/bookmarks';
import { useFilters } from '../../store/filters';
import { Button, Select, Segmented } from '../ui';
import type { NotesView } from './NotesList';

export function NotesToolbar({ view, onView }: { view: NotesView; onView: (v: NotesView) => void }) {
  const { tree, byKey, looseIds } = useBookmarks();
  const { filters, setFilters, reset } = useFilters();
  const active = activeFilterCount(filters);
  const selected = filters.folder ? byKey.get(filters.folder) : undefined;
  const hasChildren = !!selected && selected.count !== selected.ownCount;

  return (
    <div className="toolbar">
      <Select
        value={filters.folder ?? ''}
        onChange={(e) => setFilters({ folder: e.target.value || null })}
        aria-label="Carpeta"
      >
        <option value="">Todas las carpetas</option>
        {looseIds.size > 0 && <option value={LOOSE}>Sin carpeta ({looseIds.size})</option>}
        {tree.map((f) => (
          <option key={f.key} value={f.key}>
            {'\u00A0\u00A0'.repeat(f.depth)}
            {f.custom ? '🗂️' : '📁'} {f.name} ({f.count})
          </option>
        ))}
      </Select>

      {hasChildren && (
        <label className="toggle" title="Mostrar también las notas de las carpetas dentro de ésta">
          <input
            type="checkbox"
            className="check"
            checked={filters.withSub}
            onChange={(e) => setFilters({ withSub: e.target.checked })}
          />
          Incluir subcarpetas
        </label>
      )}

      <Select value={filters.range} onChange={(e) => setFilters({ range: e.target.value as RangeKey })} aria-label="Fecha">
        <option value="all">Cualquier fecha</option>
        <option value="7d">Últimos 7 días</option>
        <option value="30d">Últimos 30 días</option>
        <option value="90d">Últimos 90 días</option>
      </Select>

      <Select value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as SortKey })} aria-label="Orden">
        <option value="newest">Más recientes</option>
        <option value="oldest">Más antiguas</option>
        <option value="site">Por sitio</option>
      </Select>

      <label className="toggle">
        <input
          type="checkbox"
          className="check"
          checked={filters.onlyImages}
          onChange={(e) => setFilters({ onlyImages: e.target.checked })}
        />
        Con imágenes
      </label>

      {active > 0 && (
        <Button variant="ghost" size="sm" icon="x" onClick={reset}>
          Limpiar filtros ({active})
        </Button>
      )}

      <span className="spacer" />
      <Segmented
        value={view}
        onChange={onView}
        options={[
          { value: 'table', label: 'Tabla', icon: 'list' },
          { value: 'grid', label: 'Cuadrícula', icon: 'grid' },
        ]}
      />
    </div>
  );
}
