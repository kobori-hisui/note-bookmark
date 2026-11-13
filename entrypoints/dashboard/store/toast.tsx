import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface ToastItem {
  id: number;
  text: string;
  kind: 'ok' | 'err';
  /** Botón opcional (p. ej. "Deshacer"). Con acción el aviso dura 10 s. */
  action?: { label: string; run: () => void | Promise<void> };
}
export type ToastInput = Omit<ToastItem, 'id'>;

const ToastCtx = createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: ToastInput) => {
      const id = ++nextId.current;
      setList((l) => [...l.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.action ? 10_000 : 4_000);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** const toast = useToast(); toast({ text: 'Listo', kind: 'ok' }) */
export function useToast() {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast fuera de ToastProvider');
  return v;
}
