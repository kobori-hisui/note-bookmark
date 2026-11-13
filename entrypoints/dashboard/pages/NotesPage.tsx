import { useDeferredValue, useMemo, useState } from 'react';
import { BulkBar } from '../components/notes/BulkBar';
import { NoteDrawer } from '../components/notes/NoteDrawer';
import { NotesList, type NotesView } from '../components/notes/NotesList';
import { NotesToolbar } from '../components/notes/NotesToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui';
import { LOOSE } from '../lib/constants';
import { plural } from '../lib/format';
import { applyFilters, activeFilterCount } from '../lib/search';
import { usePersistentState } from '../lib/usePersistentState';
import { useBookmarks } from '../store/bookmarks';
import { useFilters } from '../store/filters';

export function NotesPage() {
  const { items, ready, byId, byKey, looseIds, folderOf } = useBookmarks();
  const { filters } = useFilters();
  const deferred = useDeferredValue(filters); // escribir en el buscador no bloquea la interfaz
  const [view, setView] = usePersistentState<NotesView>('dashboard:view', 'table');
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const folderIds =
      deferred.folder === null ? null : deferred.folder === LOOSE ? looseIds : (byKey.get(deferred.folder)?.ids ?? new Set<string>());
    return applyFilters(items, deferred, folderIds, folderOf);
  }, [items, deferred, byKey, looseIds, folderOf]);

  const opened = openId ? byId.get(openId) : undefined;
  const filtered = activeFilterCount(filters) > 0;

  return (
    <>
      <PageHeader
        title="Notas"
        subtitle={ready ? `${plural(visible.length, 'nota', 'notas')}${filtered ? ` de ${items.length}` : ''}` : 'Cargando…'}
      />
      <NotesToolbar view={view} onView={setView} />
      <BulkBar />

      {ready && visible.length === 0 ? (
        <EmptyState title={items.length ? 'Ninguna nota coincide con los filtros' : 'Aún no hay notas'}>
          {items.length ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Guarda la primera con Alt+C en cualquier página.'}
        </EmptyState>
      ) : (
        <NotesList items={visible} view={view} onOpen={setOpenId} resetKey={JSON.stringify(deferred)} />
      )}

      {opened && <NoteDrawer key={opened.id} note={opened} onClose={() => setOpenId(null)} />}
    </>
  );
}
