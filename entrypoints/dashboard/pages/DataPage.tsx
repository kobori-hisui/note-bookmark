import { useRef, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui';
import { exportDbFile, exportJsonFile, importFromFile } from '../lib/backupIO';
import { plural } from '../lib/format';
import { useBookmarks } from '../store/bookmarks';
import { useToast } from '../store/toast';

/** Respaldo: exportar a JSON / SQLite e importar un JSON (suma sin pisar nada). */
export function DataPage() {
  const { items } = useBookmarks();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), kind: 'err' });
    } finally {
      setBusy(false);
    }
  };

  const noNotes = items.length === 0;

  return (
    <>
      <PageHeader title="Datos" subtitle="Respaldo e importación de tus notas" />

      <section className="panel">
        <h2 className="panel-title">Exportar</h2>
        <p className="muted">
          Descarga las {plural(items.length, 'nota', 'notas')} con sus imágenes. El JSON sirve de respaldo (se puede
          importar de vuelta); el .db se abre en cualquier gestor SQLite.
        </p>
        <div className="row">
          <Button icon="data" disabled={noNotes} onClick={() => { exportJsonFile(items); toast({ text: `Exportadas ${items.length} notas (JSON).`, kind: 'ok' }); }}>
            Descargar JSON
          </Button>
          <Button
            icon="data"
            disabled={noNotes || busy}
            onClick={() =>
              guard(async () => {
                await exportDbFile(items);
                toast({ text: `Exportadas ${items.length} notas a SQLite.`, kind: 'ok' });
              })
            }
          >
            Descargar .db
          </Button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Importar</h2>
        <p className="muted">Se suman al final; si una nota ya existe (mismo id) se ignora. No se pisa nada.</p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            guard(async () => {
              const r = await importFromFile(file);
              if (!r.ok) return toast({ text: r.error, kind: 'err' });
              toast({
                text: `Importadas ${r.added} · ya existían ${r.duplicates}` + (r.skipped ? ` · descartadas ${r.skipped} inválidas` : ''),
                kind: 'ok',
              });
            });
          }}
        />
        <div className="row">
          <Button icon="upload" disabled={busy} onClick={() => fileRef.current?.click()}>
            Elegir archivo JSON…
          </Button>
        </div>
      </section>
    </>
  );
}
