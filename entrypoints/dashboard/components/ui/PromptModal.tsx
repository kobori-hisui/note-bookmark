import { useId, useState } from 'react';
import { Button } from './Button';
import { Field, Input } from './forms';
import { Modal } from './Modal';

interface Props {
  title: string;
  label: string;
  initial?: string;
  hint?: string;
  /** Largo máximo del texto (60 por defecto). */
  maxLength?: number;
  /** Nombres existentes (autocompletado nativo con datalist). */
  suggestions?: string[];
  confirmLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}

/** Diálogo de un solo campo de texto (renombrar carpeta, etc.). */
export function PromptModal({ title, label, initial = '', hint, maxLength = 60, suggestions = [], confirmLabel = 'Guardar', onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initial);
  const listId = useId();
  const ok = value.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    await onSubmit(value.trim().slice(0, maxLength));
    onClose();
  };

  return (
    <Modal
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!ok} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label} hint={hint}>
        <Input
          autoFocus
          value={value}
          maxLength={maxLength}
          list={listId}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </Field>
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </Modal>
  );
}
