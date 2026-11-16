import { useMemo, useState } from 'react';
import { cleanFolderPath, MAX_FOLDER_PATH } from '@/utils/folders';
import { plural } from '../../lib/format';
import { useBookmarks } from '../../store/bookmarks';
import { Input, Modal } from '../ui';

/** Elegir una carpeta manual existente, crear una nueva o quitar la carpeta fija (null). */
export function FolderPicker({
  title = 'Mover a carpeta',
  onPick,
  onClose,
}: {
  title?: string;
  onPick: (folder: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const { tree } = useBookmarks();
  const [q, setQ] = useState('');
  const manual = useMemo(() => tree.filter((f) => f.custom), [tree]);

  const created = cleanFolderPath(q); // "a / b//c" -> "a/b/c"
  const ql = q.trim().toLowerCase();
  const list = manual.filter((f) => f.label.toLowerCase().includes(ql));
  const exact = !!created && manual.some((f) => f.label.toLowerCase() === created.toLowerCase());

  const pick = async (v: string | null) => {
    await onPick(v);
    onClose();
  };

  return (
    <Modal title={title} width={420} onClose={onClose}>
      <Input
        autoFocus
        placeholder="Buscar o crear carpeta (a/b para anidar)…"
        value={q}
        maxLength={MAX_FOLDER_PATH}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (list[0]) pick(list[0].label);
          else if (created) pick(created);
        }}
      />
      <div className="picker-list">
        {list.map((f) => (
          <button key={f.key} type="button" className="picker-item" onClick={() => pick(f.label)}>
            <span title={f.label}>
              {'\u00A0\u00A0'.repeat(f.depth)}🗂️ {f.depth ? f.name : f.label}
            </span>
            <span className="muted small">{plural(f.count, 'nota', 'notas')}</span>
          </button>
        ))}
        {created && !exact && (
          <button type="button" className="picker-item" onClick={() => pick(created)}>
            <span>➕ Crear «{created}»</span>
          </button>
        )}
        <button type="button" className="picker-item" onClick={() => pick(null)}>
          <span className="muted">Sin carpeta fija (automática)</span>
        </button>
      </div>
    </Modal>
  );
}
