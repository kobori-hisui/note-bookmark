import { useEffect, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { IconButton } from './Button';

interface Props {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** true = panel lateral (drawer) en vez de diálogo centrado */
  side?: boolean;
}

export function Modal({ title, onClose, children, footer, width = 480, side = false }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={cx('overlay', side && 'overlay-side')}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cx('modal', side && 'drawer')}
        style={side ? { width } : { maxWidth: width }}
        role="dialog"
        aria-modal="true"
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton icon="x" label="Cerrar" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
