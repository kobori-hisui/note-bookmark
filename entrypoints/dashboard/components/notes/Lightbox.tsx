import { useEffect, useState } from 'react';
import { IconButton } from '../ui/Button';

/** Visor de imágenes a pantalla completa: ← → navegan, Esc / clic fuera cierran. */
export function Lightbox({ srcs, start = 0, onClose }: { srcs: string[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const n = srcs.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // que no cierre también el panel de detalle
        onClose();
      } else if (e.key === 'ArrowLeft' && n > 1) setI((x) => (x - 1 + n) % n);
      else if (e.key === 'ArrowRight' && n > 1) setI((x) => (x + 1) % n);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [n, onClose]);

  return (
    <div
      className="lightbox"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <img src={srcs[i]} alt="" referrerPolicy="no-referrer" onClick={onClose} />
      {n > 1 && (
        <>
          <IconButton className="lb lb-prev" icon="left" label="Anterior (←)" onClick={() => setI((x) => (x - 1 + n) % n)} />
          <IconButton className="lb lb-next" icon="right" label="Siguiente (→)" onClick={() => setI((x) => (x + 1) % n)} />
          <span className="lb-count">
            {i + 1} / {n}
          </span>
        </>
      )}
      <IconButton className="lb lb-close" icon="x" label="Cerrar (Esc)" onClick={onClose} />
    </div>
  );
}
