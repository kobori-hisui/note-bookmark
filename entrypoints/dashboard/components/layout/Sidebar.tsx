import { cx } from '../../lib/cx';
import { LOOSE } from '../../lib/constants';
import { navigate } from '../../lib/router';
import { routes } from '../../routes';
import { useBookmarks } from '../../store/bookmarks';
import { useFilters } from '../../store/filters';
import { Icon } from '../ui';

const MAX_FOLDERS = 10;

export function Sidebar({ current }: { current: string }) {
  const { items, folders, tree, looseIds } = useBookmarks();
  const { filters, setFilters } = useFilters();

  const openFolder = (key: string | null) => {
    setFilters({ folder: key });
    navigate('/notes');
  };
  const onNotes = current === '/notes';

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-dot" />
        Notas
      </div>

      <nav className="nav">
        {routes.map((r) => (
          <a key={r.path} href={`#${r.path}`} className={cx('nav-item', current === r.path && 'is-active')}>
            <Icon name={r.icon} />
            {r.label}
            {r.path === '/notes' && <span className="nav-count">{items.length}</span>}
          </a>
        ))}
      </nav>

      <div className="nav-section">Carpetas</div>
      <div className="nav folder-nav">
        {looseIds.size > 0 && (
          <button
            type="button"
            className={cx('nav-item', onNotes && filters.folder === LOOSE && 'is-active')}
            onClick={() => openFolder(LOOSE)}
          >
            <span className="muted">Sin carpeta</span>
            <span className="nav-count">{looseIds.size}</span>
          </button>
        )}
        {tree.slice(0, MAX_FOLDERS).map((f) => (
          <button
            key={f.key}
            type="button"
            className={cx('nav-item', onNotes && filters.folder === f.key && 'is-active')}
            onClick={() => openFolder(f.key)}
            title={f.label}
          >
            <span className="nav-label" style={{ paddingLeft: f.depth * 16 }}>
              {f.custom ? '🗂️' : '📁'} {f.name}
            </span>
            <span className="nav-count">{f.count}</span>
          </button>
        ))}
        {folders.length > MAX_FOLDERS && (
          <a href="#/folders" className="nav-item muted">
            Ver las {folders.length} carpetas…
          </a>
        )}
      </div>
    </aside>
  );
}
