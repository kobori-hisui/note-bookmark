import { useMemo, useState } from 'react';
import type { ImageMode } from '@/utils/settings';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui';
import { applyStrip, downloadAllImages, planStrip, storageStats } from '../lib/images';
import { mb, plural } from '../lib/format';
import { useBookmarks } from '../store/bookmarks';
import { useConfirm } from '../store/confirm';
import { useSettings } from '../store/settings';
import { useToast } from '../store/toast';

const MODES: { value: ImageMode; title: string; body: string }[] = [
  {
    value: 'url',
    title: 'Solo enlace (recomendado)',
    body: 'Guarda la dirección de la imagen. Casi no ocupa espacio y todo se mantiene rápido, aunque tengas miles de notas. Necesita internet y que el sitio no la borre.',
  },
  {
    value: 'offline',
    title: 'Descargar (offline)',
    body: 'Guarda la imagen dentro de la extensión (~150–400 KB cada una). Se ve sin internet, pero con muchas notas se vuelve pesado.',
  },
];

export function SettingsPage() {
  const { items } = useBookmarks();
  const { settings, update } = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const stats = useMemo(() => storageStats(items), [items]);

  const downloadAll = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const r = await downloadAllImages(items, (done, total) => setProgress({ done, total }));
      if (!r.total) toast({ text: 'No hay imágenes pendientes de descargar.', kind: 'ok' });
      else
        toast({
          text: `Listo: ${r.total - r.failed} descargadas` + (r.failed ? ` · ${r.failed} fallaron (siguen como enlace)` : '') + '.',
          kind: r.failed ? 'err' : 'ok',
        });
    } finally {
      setProgress(null);
    }
  };

  const strip = async () => {
    const { patches, count } = planStrip(items);
    if (!count) return toast({ text: 'No hay copias descargadas que se puedan liberar.', kind: 'ok' });
    const ok = await confirm({
      title: 'Liberar espacio',
      body: `Se borrarán ${plural(count, 'copia descargada', 'copias descargadas')} y quedarán solo sus enlaces.`,
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (!ok) return;
    await applyStrip(patches);
    toast({ text: `Liberadas ${count} imágenes; ahora solo quedan los enlaces.`, kind: 'ok' });
  };

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Comportamiento de la extensión" />

      <section className="panel">
        <h2 className="panel-title">Imágenes de las notas</h2>
        <div className="options">
          {MODES.map((m) => (
            <label key={m.value} className="option">
              <input
                type="radio"
                name="imgmode"
                checked={settings?.imageMode === m.value}
                onChange={() => update({ imageMode: m.value })}
              />
              <span>
                <b>{m.title}</b>
                <br />
                <small className="muted">{m.body}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="muted">
          {stats.notes} notas · {stats.downloaded} imágenes descargadas · {stats.links} solo enlace · ocupan ~{mb(stats.bytes)}
        </p>
        <div className="row">
          <Button icon="data" disabled={!!progress} onClick={downloadAll}>
            {progress ? `Descargando ${progress.done}/${progress.total}…` : 'Descargar ahora las imágenes de mis notas'}
          </Button>
          <Button icon="trash" disabled={!!progress} onClick={strip}>
            Liberar espacio (dejar solo enlaces)
          </Button>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel-title">Insertar notas en cualquier sitio</h2>
        <label className="option">
          <input
            type="checkbox"
            checked={settings?.inlineInsert !== false}
            onChange={(e) => update({ inlineInsert: e.target.checked })}
          />
          <span>
            <b>Comando «/carpeta» en campos de texto</b>
            <br />
            <small className="muted">
              Al escribir <code>/mi-carpeta/sub</code> en un campo de texto aparece la lista de notas de esa carpeta: Enter inserta el
              texto y los botones 🖼 copian las imágenes al portapapeles. Solo se abre si lo escrito coincide con una carpeta tuya.
            </small>
          </span>
        </label>
      </section>

      <section className="panel">
        <h2 className="panel-title">Carpeta activa</h2>
        <p className="muted">Las notas nuevas se guardan en esta carpeta manual (se cambia con Tab o «/nombre» al escribir una nota).</p>
        <div className="row">
          <b>{settings?.activeFolder ?? 'Ninguna (automática por sitio)'}</b>
          {settings?.activeFolder && (
            <Button size="sm" icon="x" onClick={() => update({ activeFolder: null })}>
              Quitar
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
