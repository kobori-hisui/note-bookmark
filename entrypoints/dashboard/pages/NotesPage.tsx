import { useDeferredValue, useMemo, useState } from 'react';
import { BulkBar } from '../components/notes/BulkBar';
import { Lightbox } from '../components/notes/Lightbox';
import { NoteDrawer } from '../components/notes/NoteDrawer';
import { NotesList, type NotesView } from '../components/notes/NotesList';
import { NotesToolbar } from '../components/notes/NotesToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui';
import { LOOSE } from '../lib/constants';
import { plural } from '../lib/format';
import { buildSlides, slideIndex, type Slide } from '../lib/gallery';
import { applyFilters, activeFilterCount, isBrowsing } from '../lib/search';
import { usePersistentState } from '../lib/usePersistentState';
import { useBookmarks, type FolderInfo } from '../store/bookmarks';
import { useFilters } from '../store/filters';

export function NotesPage() {
  const { items, ready, byId, byKey, looseIds, folderOf } = useBookmarks();
  const { filters, setFilters } = useFilters();
  const deferred = useDeferredValue(filters); // escribir en el buscador no bloquea la interfaz
  const [view, setView] = usePersistentState<NotesView>('dashboard:view', 'table');
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);

  const visible = useMemo(() => {
    const sel = deferred.folder === null || deferred.folder === LOOSE ? undefined : byKey.get(deferred.folder);
    const folderIds =
      deferred.folder === null
        ? null
        : deferred.folder === LOOSE
          ? looseIds
          : isBrowsing(deferred)
            ? (sel?.directIds ?? new Set<string>()) // explorador: solo lo que está directamente en la carpeta
            : ((deferred.withSub ? sel?.ids : sel?.ownIds) ?? new Set<string>());
    return applyFilters(items, deferred, folderIds, folderOf);
  }, [items, deferred, byKey, looseIds, folderOf]);

  // Un clic en cualquier miniatura (o imagen del panel) abre el visor sobre las imágenes de TODAS las notas visibles
  const openViewer = (id: string, n = 0) => {
    const slides = buildSlides(visible);
    if (slides.length) setViewer({ slides, start: slideIndex(slides, id, n) });
  };

  // modo explorador: las subcarpetas (y páginas) se ven como carpetas, como en los marcadores de Chrome
  const current = filters.folder && filters.folder !== LOOSE ? byKey.get(filters.folder) : undefined;
  const folderRows = useMemo(
    () => (isBrowsing(deferred) && current ? current.childKeys.map((k) => byKey.get(k)).filter((f): f is FolderInfo => !!f) : []),
    [deferred, current, byKey],
  );
  const trail: FolderInfo[] = [];
  for (let f = current; f; f = f.parent ? byKey.get(f.parent) : undefined) trail.unshift(f);
  const enter = (key: string | null) => setFilters({ folder: key });

  const opened = openId ? byId.get(openId) : undefined;
  const filtered = activeFilterCount(filters) > 0;

  return (
    <>
      <PageHeader
        title="Notas"
        subtitle={ready ? `${plural(visible.length, 'nota', 'notas')}${filtered ? ` de ${items.length}` : ''}` : 'Cargando…'}
      />
      <NotesToolbar view={view} onView={setView} />
      {isBrowsing(filters) && trail.length > 0 && (
        <nav className="crumbs" aria-label="Ruta de carpetas">
          <button type="button" className="crumb" onClick={() => enter(null)}>
            Todas
          </button>
          {trail.map((f, i) => (
            <span key={f.key}>
              <span className="muted"> › </span>
              {i === trail.length - 1 ? (
                <b>{f.name}</b>
              ) : (
                <button type="button" className="crumb" onClick={() => enter(f.key)}>
                  {f.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      <BulkBar />

      {ready && visible.length === 0 && folderRows.length === 0 ? (
        <EmptyState title={items.length ? 'Ninguna nota coincide con los filtros' : 'Aún no hay notas'}>
          {items.length ? 'Prueba con otra búsqueda o limpia los filtros.' : 'Guarda la primera con Alt+C en cualquier página.'}
        </EmptyState>
      ) : (
        <NotesList items={visible} view={view} onOpen={setOpenId} onView={openViewer} folderRows={folderRows} onEnter={enter} resetKey={JSON.stringify(deferred)} />
      )}

      {opened && <NoteDrawer key={opened.id} note={opened} onClose={() => setOpenId(null)} onView={openViewer} />}
      {viewer && (
        <Lightbox
          slides={viewer.slides}
          start={viewer.start}
          onClose={() => setViewer(null)}
          onOpenNote={(id) => {
            setViewer(null);
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
