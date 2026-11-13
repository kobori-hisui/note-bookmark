import { useId, useState } from 'react';
import { isSafeUrl } from '@/utils/backup';
import { updateBookmark, type Bookmark } from '@/utils/bookmarks';
import { openNoteInPage } from '../../lib/actions';
import { fmtDateTime, titleOf } from '../../lib/format';
import { useActions } from '../../lib/useActions';
import { useBookmarks } from '../../store/bookmarks';
import { useToast } from '../../store/toast';
import { Button, Field, Input, Modal, Textarea } from '../ui';
import { Lightbox } from './Lightbox';
import { SafeImg } from './SafeImg';

/** Panel lateral con el detalle de una nota: imágenes, cita y formulario de edición. Usar con key={note.id}. */
export function NoteDrawer({ note, onClose }: { note: Bookmark; onClose: () => void }) {
  const { manualNames } = useBookmarks();
  const actions = useActions();
  const toast = useToast();
  const listId = useId();

  const [title, setTitle] = useState(note.title ?? '');
  const [text, setText] = useState(note.note);
  const [url, setUrl] = useState(note.url);
  const [folder, setFolder] = useState(note.folder ?? '');
  const [err, setErr] = useState('');
  const [view, setView] = useState<{ srcs: string[]; i: number } | null>(null);

  const dirty =
    title !== (note.title ?? '') || text !== note.note || url !== note.url || folder !== (note.folder ?? '');
  const gallery = note.images ?? [];

  const save = async () => {
    const u = url.trim();
    const n = text.trim();
    if (!isSafeUrl(u)) return setErr('La URL no es válida (usa http:// o https://).');
    if (!n && !note.quote && !note.image && !gallery.length) return setErr('La nota está vacía.');
    setErr('');
    await updateBookmark(note.id, {
      note: n,
      url: u,
      title: title.trim() || null,
      folder: folder.trim().slice(0, 60) || null,
    });
    toast({ text: 'Nota guardada.', kind: 'ok' });
  };

  return (
    <>
      <Modal
        side
        width={520}
        title={titleOf(note)}
        onClose={onClose}
        footer={
          <>
            <Button variant="danger" icon="trash" onClick={async () => { await actions.remove([note.id]); onClose(); }}>
              Borrar
            </Button>
            <span className="spacer" />
            <Button icon="external" onClick={() => openNoteInPage(note.id)}>
              Abrir en la página
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={save}>
              Guardar
            </Button>
          </>
        }
      >
        <p className="muted small">{fmtDateTime(note.date)}</p>

        {note.image && (
          <SafeImg src={note.image} className="drawer-main-img" onClick={() => setView({ srcs: [note.image!], i: 0 })} />
        )}
        {gallery.length > 0 && (
          <div className="drawer-gallery">
            {gallery.map((src, i) => (
              <SafeImg key={i} src={src} onClick={() => setView({ srcs: gallery, i })} />
            ))}
          </div>
        )}
        {note.quote && <blockquote className="drawer-quote">{note.quote}</blockquote>}

        <div className="form">
          <Field label="Título de la página">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Nota">
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="URL" hint="Si la cambias, la nota se mueve a la carpeta automática de esa página.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Carpeta" hint="Vacío = automática por sitio.">
            <Input value={folder} maxLength={60} list={listId} onChange={(e) => setFolder(e.target.value)} />
          </Field>
          <datalist id={listId}>
            {manualNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {err && <div className="err-text">{err}</div>}
        </div>
      </Modal>
      {view && <Lightbox srcs={view.srcs} start={view.i} onClose={() => setView(null)} />}
    </>
  );
}
