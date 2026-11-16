import { useMemo } from 'react';
import { cx } from '../../lib/cx';
import { LOOSE } from '../../lib/constants';
import { navigate } from '../../lib/router';
import { usePersistentState } from '../../lib/usePersistentState';
import { routes } from '../../routes';
import { useBookmarks } from '../../store/bookmarks';
import { useFilters } from '../../store/filters';
import { Icon } from '../ui';

const MAX_FOLDERS = 10;

export function Sidebar({ current }: { current: string }) {
  const { items, folders, tree, byKey, looseIds } = useBookmarks();
  const { filters, setFilters } = useFilters();

  // carpetas plegadas (se recuerdan entre sesiones); una hija se oculta si algún ancestro está plegado
  const [collapsedRaw, setCollapsedRaw] = usePersistentState<string>('dashboard:collapsed-folders', '');
  const collapsed = useMemo(() => new Set(collapsedRaw ? collapsedRaw.split('\n') : []), [collapsedRaw]);
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (!next.delete(key)) next.add(key);
    setCollapsedRaw([...next].join('\n'));
  };
  const hasKids = useMemo(() => new Set(tree.map((f) => f.parent).filter((k): k is string => !!k)), [tree]);
  const visible = useMemo(
    () =>
      tree.filter((f) => {
        for (let p = f.parent; p; p = byKey.get(p)?.parent ?? null) if (collapsed.has(p)) return false;
        return true;
      }),
    [tree, byKey, collapsed],
  );

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
        {visible.slice(0, MAX_FOLDERS).map((f) => (
          <div key={f.key} className="folder-row" style={{ paddingLeft: f.depth * 14 }}>
            {hasKids.has(f.key) ? (
              <button
                type="button"
                className="tree-toggle"
                aria-label={collapsed.has(f.key) ? `Desplegar ${f.name}` : `Plegar ${f.name}`}
                aria-expanded={!collapsed.has(f.key)}
                onClick={() => toggle(f.key)}
              >
                {collapsed.has(f.key) ? '▸' : '▾'}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <button
              type="button"
              className={cx('nav-item', onNotes && filters.folder === f.key && 'is-active')}
              onClick={() => openFolder(f.key)}
              title={f.label}
            >
              <span className="nav-label">
                {f.custom ? '🗂️' : '📁'} {f.name}
              </span>
              <span className="nav-count">{f.count}</span>
            </button>
          </div>
        ))}
        {visible.length > MAX_FOLDERS && (
          <a href="#/folders" className="nav-item muted">
            Ver las {folders.length} carpetas…
          </a>
        )}
      </div>
    </aside>
  );
}
