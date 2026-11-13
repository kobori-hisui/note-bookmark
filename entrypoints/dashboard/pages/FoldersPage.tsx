import { useState, type CSSProperties } from 'react';
import { setFolder } from '../lib/actions';
import { fmtDate, plural } from '../lib/format';
import { navigate } from '../lib/router';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, EmptyState, IconButton, PromptModal } from '../components/ui';
import { useBookmarks, type FolderInfo } from '../store/bookmarks';
import { useConfirm } from '../store/confirm';
import { useFilters } from '../store/filters';
import { useSettings } from '../store/settings';
import { useToast } from '../store/toast';

const COLS = 'minmax(0,1fr) 130px 90px 140px 120px';

/**
 * Administrar carpetas. Renombrar funciona con cualquiera (también las automáticas: sus notas pasan a
 * una carpeta manual con ese nombre). Si el nombre ya existe, se fusionan.
 */
export function FoldersPage() {
  const { folders, manualNames } = useBookmarks();
  const { setFilters } = useFilters();
  const { settings, update } = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<FolderInfo | null>(null);

  const view = (f: FolderInfo) => {
    setFilters({ folder: f.key });
    navigate('/notes');
  };

  const rename = async (f: FolderInfo, name: string) => {
    const undo = await setFolder(f.ids, name);
    // la carpeta activa de la extensión (donde se guardan las notas nuevas) sigue el cambio de nombre
    if (settings?.activeFolder?.toLowerCase() === f.label.toLowerCase()) await update({ activeFolder: name });
    toast({ text: `«${f.label}» → «${name}».`, kind: 'ok', action: { label: 'Deshacer', run: undo } });
  };

  const remove = async (f: FolderInfo) => {
    const ok = await confirm({
      title: `Quitar la carpeta «${f.label}»`,
      body: `Sus ${plural(f.count, 'nota', 'notas')} no se borran: vuelven a la carpeta automática por sitio.`,
      confirmLabel: 'Quitar carpeta',
      danger: true,
    });
    if (!ok) return;
    const undo = await setFolder(f.ids, null);
    if (settings?.activeFolder?.toLowerCase() === f.label.toLowerCase()) await update({ activeFolder: null });
    toast({ text: `Carpeta «${f.label}» quitada.`, kind: 'ok', action: { label: 'Deshacer', run: undo } });
  };

  return (
    <>
      <PageHeader title="Carpetas" subtitle={`${folders.length} carpetas · ${manualNames.length} manuales`} />
      {folders.length === 0 ? (
        <EmptyState title="Aún no hay carpetas">
          Las automáticas aparecen con 3 notas del mismo sitio. Para crear una manual escribe «/nombre» en una nota.
        </EmptyState>
      ) : (
        <div className="table" style={{ '--cols': COLS } as CSSProperties}>
          <div className="thead">
            <div className="tcell">Nombre</div>
            <div className="tcell">Tipo</div>
            <div className="tcell">Notas</div>
            <div className="tcell">Última nota</div>
            <div className="tcell" />
          </div>
          {folders.map((f) => (
            <div key={f.key} className="trow" onClick={() => view(f)}>
              <div className="tcell note-title">
                {f.custom ? '🗂️' : '📁'} {f.label}
                {f.pages > 0 && <span className="muted"> · {plural(f.pages, 'página', 'páginas')}</span>}
              </div>
              <div className="tcell">
                <Badge tone={f.custom ? 'accent' : 'neutral'}>{f.custom ? 'Manual' : 'Automática'}</Badge>
              </div>
              <div className="tcell">{f.count}</div>
              <div className="tcell muted small">{fmtDate(f.latest)}</div>
              <div className="tcell tcell-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton icon="edit" label="Renombrar o fusionar" onClick={() => setRenaming(f)} />
                {f.custom && <IconButton icon="trash" label="Quitar carpeta" danger onClick={() => remove(f)} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {renaming && (
        <PromptModal
          title={`Renombrar «${renaming.label}»`}
          label="Nuevo nombre"
          initial={renaming.label}
          suggestions={manualNames}
          hint="Si eliges el nombre de otra carpeta, se fusionan."
          onSubmit={(name) => rename(renaming, name)}
          onClose={() => setRenaming(null)}
        />
      )}
    </>
  );
}
