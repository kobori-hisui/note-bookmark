import { useMemo, useState } from 'react';
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
  const { folders } = useBookmarks();
  const [q, setQ] = useState('');
  const manual = useMemo(() => folders.filter((f) => f.custom), [folders]);

  const ql = q.trim().toLowerCase();
  const list = manual.filter((f) => f.label.toLowerCase().includes(ql));
  const exact = manual.some((f) => f.label.toLowerCase() === ql);

  const pick = async (v: string | null) => {
    await onPick(v);
    onClose();
  };

  return (
    <Modal title={title} width={420} onClose={onClose}>
      <Input
        autoFocus
        placeholder="Buscar o crear carpeta…"
        value={q}
        maxLength={60}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (list[0]) pick(list[0].label);
          else if (q.trim()) pick(q.trim());
        }}
      />
      <div className="picker-list">
        {list.map((f) => (
          <button key={f.key} type="button" className="picker-item" onClick={() => pick(f.label)}>
            <span>🗂️ {f.label}</span>
            <span className="muted small">{plural(f.count, 'nota', 'notas')}</span>
          </button>
        ))}
        {q.trim() && !exact && (
          <button type="button" className="picker-item" onClick={() => pick(q.trim())}>
            <span>➕ Crear «{q.trim()}»</span>
          </button>
        )}
        <button type="button" className="picker-item" onClick={() => pick(null)}>
          <span className="muted">Sin carpeta fija (automática)</span>
        </button>
      </div>
    </Modal>
  );
}
