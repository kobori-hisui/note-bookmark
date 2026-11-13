import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';

interface ConfirmOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (o: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.opts.title}
          width={420}
          onClose={() => close(false)}
          footer={
            <>
              <Button onClick={() => close(false)}>Cancelar</Button>
              <Button variant={state.opts.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {state.opts.confirmLabel ?? 'Aceptar'}
              </Button>
            </>
          }
        >
          {state.opts.body && <p className="muted">{state.opts.body}</p>}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

/** const confirm = useConfirm(); if (await confirm({ title: '¿Borrar?', danger: true })) ... */
export function useConfirm(): ConfirmFn {
  const v = useContext(ConfirmCtx);
  if (!v) throw new Error('useConfirm fuera de ConfirmProvider');
  return v;
}
